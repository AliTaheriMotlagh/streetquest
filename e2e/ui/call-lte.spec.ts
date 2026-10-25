// Android ↔ iPhone video call over "mobile data". Two phones on carrier-grade NAT can
// never reach each other directly: every packet has to go through the TURN relay. Both
// sides are forced relay-only (sq_call_relay=1), Chrome plays the Android phone and
// WebKit (Safari's engine) plays the iPhone, and the call must connect both ways.
//
// Needs a real TURN server, so it only runs when one is configured for the test server:
//   TURN_URLS="turn:…:80,turns:…:443?transport=tcp" TURN_USERNAME=… TURN_CREDENTIAL=… \
//     npx playwright test e2e/ui/call-lte.spec.ts
import { devices, expect, test, webkit, type Browser, type Page } from "@playwright/test";

test.skip(!process.env.TURN_URLS, "set TURN_URLS / TURN_USERNAME / TURN_CREDENTIAL to run the relay test");
test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });
test.describe.configure({ mode: "default" });

const octet = () => Math.floor(Math.random() * 250) + 1;

/** Relay-only, keeps every peer connection reachable for stats, and (WebKit) a fake camera. */
function phoneSetup(fakeCamera: boolean) {
  localStorage.setItem("sq_tour_v2", "1");
  localStorage.setItem("sq_mode_never", "1");
  localStorage.setItem("sq_push_asked", "1");
  localStorage.setItem("sq_call_relay", "1");
  const Real = RTCPeerConnection;
  const pcs: RTCPeerConnection[] = [];
  (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs = pcs;
  window.RTCPeerConnection = function (cfg?: RTCConfiguration) {
    const pc = new Real(cfg);
    pcs.push(pc);
    return pc;
  } as unknown as typeof RTCPeerConnection;
  window.RTCPeerConnection.prototype = Real.prototype;
  if (fakeCamera)
    navigator.mediaDevices.getUserMedia = async (c?: MediaStreamConstraints) => {
      const canvas = Object.assign(document.createElement("canvas"), { width: 320, height: 240 });
      const g = canvas.getContext("2d")!;
      let f = 0;
      setInterval(() => {
        g.fillStyle = `hsl(${(f += 7) % 360} 80% 50%)`;
        g.fillRect(0, 0, 320, 240);
      }, 66);
      const out = new MediaStream();
      if (c?.video) canvas.captureStream(15).getVideoTracks().forEach((t) => out.addTrack(t));
      if (c?.audio) {
        const ac = new AudioContext();
        const osc = ac.createOscillator();
        const dest = ac.createMediaStreamDestination();
        osc.connect(dest);
        osc.start();
        dest.stream.getAudioTracks().forEach((t) => out.addTrack(t));
      }
      return out;
    };
}

async function phone(browser: Browser, device: (typeof devices)[string], fakeCamera: boolean, baseURL: string) {
  const ctx = await browser.newContext({ ...device, baseURL, extraHTTPHeaders: { "x-forwarded-for": `10.${octet()}.${octet()}.${octet()}` } });
  await ctx.grantPermissions(fakeCamera ? ["geolocation"] : ["camera", "microphone", "geolocation"]).catch(() => ctx.grantPermissions(["geolocation"]));
  await ctx.setGeolocation({ latitude: 35.7 + Math.random() / 10, longitude: 51.4 + Math.random() / 10, accuracy: 10 });
  const page = await ctx.newPage();
  await page.addInitScript(phoneSetup, fakeCamera);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/play");
  await expect(page.locator(".player-card")).toBeVisible({ timeout: 60_000 });
  const me = await page.evaluate(() => fetch("/api/me").then((r) => r.json()));
  return { page, errors, id: me.id as string, username: me.username as string };
}

/** The route the live call actually uses: local and remote candidate types. */
const route = (p: Page) =>
  p.evaluate(async () => {
    const pcs = (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs;
    const stats = await pcs[pcs.length - 1].getStats();
    let pair: { localCandidateId: string; remoteCandidateId: string } | null = null;
    stats.forEach((s) => {
      if (s.type === "candidate-pair" && s.state === "succeeded" && (s.nominated || s.selected)) pair = s;
    });
    if (!pair) return null;
    const p2 = pair as { localCandidateId: string; remoteCandidateId: string };
    return { local: stats.get(p2.localCandidateId)?.candidateType, remote: stats.get(p2.remoteCandidateId)?.candidateType };
  });

test("Android ↔ iPhone call connects through the TURN relay, both directions", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  // Not the project's Chrome channel: the stock WebKit build.
  const iphoneBrowser = await webkit.launch({ channel: undefined });
  try {
    const android = await phone(browser, devices["Pixel 7"], false, baseURL!);
    const iphone = await phone(iphoneBrowser, devices["iPhone 15"], true, baseURL!);
    await android.page.evaluate((u) => fetch("/api/friends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "request", username: u }) }), iphone.username);
    const fr = await iphone.page.evaluate(() => fetch("/api/friends").then((r) => r.json()));
    await iphone.page.evaluate((id) => fetch("/api/friends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "accept", friendshipId: id }) }), fr.incoming[0].friendshipId);

    for (const [caller, callee] of [
      [android, iphone],
      [iphone, android],
    ] as const) {
      await caller.page.locator("[data-tour=nav-social]").click();
      await caller.page.getByRole("button", { name: "Crew & chat" }).click();
      await caller.page.getByRole("button", { name: `Video call ${callee.username}` }).click();
      const out = caller.page.getByRole("dialog", { name: `Video call with ${callee.username}` });
      const inc = callee.page.getByRole("dialog", { name: `Video call with ${caller.username}` });
      await inc.getByRole("button", { name: "Answer" }).click({ timeout: 20_000 });
      await new Promise((r) => setTimeout(r, 20_000));
      for (const [n, p] of [["caller", caller.page], ["callee", callee.page]] as const)
        console.log("DBG", n, await p.evaluate(async () => {
          const pcs = (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs;
          const pc = pcs[pcs.length - 1];
          if (!pc) return "no pc";
          const st = await pc.getStats();
          const c: Record<string, number> = {};
          const pairs: string[] = [];
          st.forEach((s) => { if (s.type.includes("candidate")) c[s.type + ":" + (s.candidateType ?? s.state)] = (c[s.type + ":" + (s.candidateType ?? s.state)] ?? 0) + 1; });
          return JSON.stringify({ n: pcs.length, sig: pc.signalingState, ice: pc.iceConnectionState, conn: pc.connectionState, gather: pc.iceGatheringState, ld: pc.localDescription?.type, rd: pc.remoteDescription?.type, c, tr: pc.getTransceivers().map((t) => `${t.mid}:${t.direction}:${t.currentDirection}`) });
        }));
      for (const d of [out, inc]) await expect(d).toHaveClass(/\blive\b/, { timeout: 45_000 });
      for (const p of [caller.page, callee.page])
        await expect.poll(() => p.locator("video.call-remote").evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 }).toBeGreaterThan(0);
      // Really relayed, as it must be between two phones on mobile data.
      for (const p of [caller.page, callee.page]) expect(await route(p)).toMatchObject({ local: "relay" });
      await caller.page.getByRole("button", { name: "Hang up" }).click();
      await expect(inc).toHaveCount(0, { timeout: 15_000 });
      await caller.page.locator("[data-tour=nav-social]").click(); // close the crew panel for the next round
    }
    expect([...android.errors, ...iphone.errors]).toEqual([]);
  } finally {
    await iphoneBrowser.close();
  }
});
