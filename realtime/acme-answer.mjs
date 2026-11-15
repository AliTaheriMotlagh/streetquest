// A tiny authoritative DNS server for one name only, run for the minute a certificate is issued or
// renewed (realtime/install.sh, RT_DNS=self). sslip.io delegates `_acme-challenge.<a-b-c-d>.sslip.io`
// to the address a.b.c.d itself, so the server proves the name is its own by answering the Let's
// Encrypt TXT question here — no domain, no DNS account, ports 80/443 untouched.
//
//   node acme-answer.mjs <bind address> <zone, e.g. _acme-challenge.1-2-3-4.sslip.io> <file of TXT values>
//
// Answers TXT/SOA/NS for the zone (the values are re-read on every question, so acme.sh's hook only
// edits the file), and REFUSED for any other name: never an open resolver. UDP and TCP on port 53.
import dgram from "node:dgram";
import { readFileSync } from "node:fs";
import net from "node:net";

const [addr, zoneArg, file] = process.argv.slice(2);
if (!addr || !zoneArg || !file) {
  console.error("usage: acme-answer.mjs <bind address> <zone> <txt file>");
  process.exit(2);
}
const zone = zoneArg.toLowerCase().replace(/\.$/, "");
const host = zone.replace(/^_acme-challenge\./, "");
const T = { A: 1, NS: 2, SOA: 6, TXT: 16 };
const PORT = Number(process.env.DNS_PORT ?? 53);

function encodeName(name) {
  const parts = name.split(".").filter(Boolean);
  return Buffer.concat([...parts.map((p) => Buffer.concat([Buffer.from([p.length]), Buffer.from(p)])), Buffer.from([0])]);
}

/** The question: name (as sent — resolvers randomise its case), type, and where it ends. */
function question(msg) {
  let i = 12;
  const labels = [];
  while (i < msg.length && msg[i] !== 0) {
    if (msg[i] & 0xc0) return null; // no compression in a question
    labels.push(msg.subarray(i + 1, i + 1 + msg[i]).toString("latin1"));
    i += msg[i] + 1;
  }
  if (i + 5 > msg.length) return null;
  return { name: labels.join("."), type: msg.readUInt16BE(i + 1), end: i + 5 };
}

function rr(type, rdata, ttl = 1) {
  const head = Buffer.alloc(12);
  head.writeUInt16BE(0xc00c, 0); // the question's name
  head.writeUInt16BE(type, 2);
  head.writeUInt16BE(1, 4); // IN
  head.writeUInt32BE(ttl, 6);
  head.writeUInt16BE(rdata.length, 10);
  return Buffer.concat([head, rdata]);
}
const soa = () => {
  const nums = Buffer.alloc(20);
  [Math.floor(Date.now() / 1000) >>> 0, 60, 60, 600, 1].forEach((n, k) => nums.writeUInt32BE(n, k * 4));
  return Buffer.concat([encodeName(host), encodeName(`hostmaster.${host}`), nums]);
};
const txts = () => {
  try {
    return readFileSync(file, "utf8").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 8);
  } catch {
    return [];
  }
};

function answer(msg) {
  if (msg.length < 12) return null;
  const q = question(msg);
  const out = Buffer.alloc(12);
  msg.copy(out, 0, 0, 2); // id
  const rd = msg[2] & 0x01;
  if (!q || msg.readUInt16BE(4) !== 1) {
    out.writeUInt16BE(0x8000 | (rd << 8) | 1, 2); // FORMERR
    return out;
  }
  const qsec = msg.subarray(12, q.end);
  const name = q.name.toLowerCase();
  if (name !== zone) {
    out.writeUInt16BE(0x8000 | (rd << 8) | 5, 2); // REFUSED: not ours
    out.writeUInt16BE(1, 4);
    return Buffer.concat([out, qsec]);
  }
  let ans = [];
  if (q.type === T.TXT) ans = txts().map((v) => rr(T.TXT, Buffer.concat([Buffer.from([Buffer.byteLength(v)]), Buffer.from(v)])));
  else if (q.type === T.SOA) ans = [rr(T.SOA, soa(), 60)];
  else if (q.type === T.NS) ans = [rr(T.NS, encodeName(host), 60)];
  const auth = ans.length ? [] : [rr(T.SOA, soa(), 60)]; // NODATA carries the SOA
  out.writeUInt16BE(0x8400 | (rd << 8), 2); // QR + AA, NOERROR
  out.writeUInt16BE(1, 4);
  out.writeUInt16BE(ans.length, 6);
  out.writeUInt16BE(auth.length, 8);
  return Buffer.concat([out, qsec, ...ans, ...auth]);
}

const udp = dgram.createSocket(addr.includes(":") ? "udp6" : "udp4");
udp.on("message", (msg, from) => {
  const r = answer(msg);
  if (r) udp.send(r, from.port, from.address);
});
udp.bind(PORT, addr, () => console.log(`[acme-answer] ${zone} on ${addr}:${PORT}`));

net
  .createServer((sock) => {
    let buf = Buffer.alloc(0);
    sock.setTimeout(5000, () => sock.destroy());
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 2 && buf.length >= 2 + buf.readUInt16BE(0)) {
        const r = answer(buf.subarray(2, 2 + buf.readUInt16BE(0)));
        buf = buf.subarray(2 + buf.readUInt16BE(0));
        if (r) sock.write(Buffer.concat([Buffer.from([r.length >> 8, r.length & 0xff]), r]));
      }
    });
    sock.on("error", () => {});
  })
  .listen(PORT, addr);
