"use client";
// 1:1 video calls with crew members. WebRTC carries the audio/video straight between the
// two phones; /api/calls relays only the handshake (offer, answer, ICE candidates) by
// polling, the same serverless-friendly "realtime" as chat. The caller always offers.
import { useEffect, useRef, useState } from "react";
import { Button } from "../Button";
import { api } from "./client";
import { sfx } from "./sfx";
import { useGame } from "./ui";

export type CallPeer = { id: string; username: string; avatar: string };
/** A call to place (caller, no id yet) or one ringing this phone (callee). */
export type CallInvite = { id?: string; peer: CallPeer; role: "caller" | "callee" };

type Phase = "ringing" | "calling" | "connecting" | "live" | "ended";
type Signal = { id: number; kind: "offer" | "answer" | "ice" | "state"; data: string };
type PeerState = { cam: boolean; mic: boolean };

const END_TEXT: Record<string, string> = {
  hangup: "Call ended",
  declined: "Declined",
  missed: "No answer",
  busy: "Busy",
  lost: "Connection lost",
  failed: "Couldn't connect — the network blocked the call",
};

/** Camera + mic, falling back to mic only, then to watching/listening only. */
async function getMedia(facingMode: "user" | "environment" = "user") {
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) return { stream: null, note: "Calls need a secure (https) connection" };
  try {
    return { stream: await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } } }), note: null };
  } catch {
    try {
      return { stream: await md.getUserMedia({ audio: true }), note: "Camera unavailable — voice only" };
    } catch {
      return { stream: null, note: "Camera and mic are blocked — they won't see or hear you" };
    }
  }
}

/** The WebRTC side of one call: peer connection, signaling outbox and poll loop. */
class Session {
  pc: RTCPeerConnection | null = null;
  remote = new MediaStream();
  private after = 0;
  private closed = false;
  private outbox: { kind: Signal["kind"]; data: string }[] = [];
  private flushT: ReturnType<typeof setTimeout> | null = null;
  private pollT: ReturnType<typeof setTimeout> | null = null;
  private sending: Promise<unknown> = Promise.resolve();
  private pendingIce: RTCIceCandidateInit[] = [];
  live = false;

  constructor(
    public id: string,
    public local: MediaStream | null,
    private on: { connected: () => void; ended: (reason: string) => void; track: () => void; peer: (s: PeerState) => void; accepted: () => void },
  ) {}

  connect(iceServers: RTCIceServer[], offerer: boolean) {
    // Hung up while this phone was still asking for the camera.
    if (this.closed) return this.local?.getTracks().forEach((t) => t.stop());
    const pc = (this.pc = new RTCPeerConnection({ iceServers }));
    for (const t of this.local?.getTracks() ?? []) pc.addTrack(t, this.local!);
    // The offer always asks for both audio and video, even if this phone has no camera or
    // mic. (The answering side reuses its addTrack senders for the offer's lines.)
    if (offerer && !this.local?.getAudioTracks().length) pc.addTransceiver("audio", { direction: "recvonly" });
    if (offerer && !this.local?.getVideoTracks().length) pc.addTransceiver("video", { direction: "recvonly" });
    pc.ontrack = (e) => {
      if (!this.remote.getTracks().includes(e.track)) this.remote.addTrack(e.track);
      this.on.track();
    };
    pc.onicecandidate = (e) => e.candidate && this.send("ice", JSON.stringify(e.candidate.toJSON()));
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected" && !this.live) {
        this.live = true;
        this.on.connected();
      }
      if (pc.connectionState === "failed") this.finish(this.live ? "lost" : "failed");
    };
    if (offerer)
      (async () => {
        await pc.setLocalDescription(await pc.createOffer());
        this.send("offer", pc.localDescription!.sdp);
      })().catch(() => this.finish("failed"));
  }

  send(kind: Signal["kind"], data: string) {
    if (this.closed) return;
    this.outbox.push({ kind, data });
    // ICE candidates arrive in bursts: batch them into one request. Batches go out in
    // order, so candidates never overtake the offer/answer they belong to.
    this.flushT ??= setTimeout(() => {
      this.flushT = null;
      const signals = this.outbox.splice(0);
      this.sending = this.sending.then(() => api("/api/calls", { body: { action: "signal", callId: this.id, signals } }).catch(() => {}));
    }, 120);
  }

  /** Poll for the call's status and the other side's signals. While ringing, only status. */
  poll(ringing = false) {
    if (this.closed) return;
    this.pollT = setTimeout(async () => {
      try {
        const r = await api<{ status: string; endReason: string | null; signals: Signal[] }>(`/api/calls?id=${this.id}&after=${this.after}`);
        if (this.closed) return;
        if (r.status === "ENDED") return this.finish(r.endReason ?? "hangup", false);
        if (r.status === "ACTIVE" && !this.live) this.on.accepted();
        if (!ringing) for (const s of r.signals) await this.handle(s);
      } catch {}
      this.poll(ringing && !this.pc);
    }, this.live ? 2000 : 700);
  }

  private async handle(s: Signal) {
    this.after = s.id;
    const pc = this.pc;
    if (!pc) return;
    try {
      if (s.kind === "offer") {
        await pc.setRemoteDescription({ type: "offer", sdp: s.data });
        await this.drainIce();
        await pc.setLocalDescription(await pc.createAnswer());
        this.send("answer", pc.localDescription!.sdp);
      } else if (s.kind === "answer") {
        if (pc.signalingState === "have-local-offer") await pc.setRemoteDescription({ type: "answer", sdp: s.data });
        await this.drainIce();
      } else if (s.kind === "ice") {
        const c = JSON.parse(s.data) as RTCIceCandidateInit;
        if (pc.remoteDescription) await pc.addIceCandidate(c);
        else this.pendingIce.push(c);
      } else if (s.kind === "state") this.on.peer(JSON.parse(s.data));
    } catch (e) {
      if (s.kind !== "ice") this.finish("failed");
      else console.warn("bad ICE candidate", e);
    }
  }

  private async drainIce() {
    for (const c of this.pendingIce.splice(0)) await this.pc!.addIceCandidate(c).catch(() => {});
  }

  /** Swap the camera without renegotiating (front ↔ back). */
  async replaceVideo(track: MediaStreamTrack) {
    const t = this.pc?.getTransceivers().find((x) => x.receiver.track.kind === "video");
    await t?.sender.replaceTrack(track);
  }

  /** Tear everything down; tell the server unless it told us. */
  finish(reason: string, tellServer = true) {
    if (this.closed) return;
    this.closed = true;
    if (this.flushT) clearTimeout(this.flushT);
    if (this.pollT) clearTimeout(this.pollT);
    if (tellServer) api("/api/calls", { body: { action: "end", callId: this.id } }).catch(() => {});
    this.pc?.close();
    this.local?.getTracks().forEach((t) => t.stop());
    this.on.ended(reason);
  }

  /** Page is closing: a beacon still reaches the server after the tab is gone. */
  beacon() {
    if (this.closed) return;
    navigator.sendBeacon?.("/api/calls", new Blob([JSON.stringify({ action: "end", callId: this.id })], { type: "application/json" }));
  }
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function CallScreen({ invite, onDone }: { invite: CallInvite; onDone: (callId?: string) => void }) {
  const { toast } = useGame();
  const { peer, role } = invite;
  const [phase, setPhase] = useState<Phase>(role === "caller" ? "calling" : "ringing");
  const [endText, setEndText] = useState("");
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [hasCam, setHasCam] = useState(false);
  const [canFlip, setCanFlip] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [them, setThem] = useState<PeerState>({ cam: true, mic: true });
  const [remoteVideo, setRemoteVideo] = useState(false);
  const [mini, setMini] = useState(false);
  const [liveAt, setLiveAt] = useState<number | null>(null);
  const [, tick] = useState(0);
  const sess = useRef<Session | null>(null);
  const localV = useRef<HTMLVideoElement>(null);
  const remoteV = useRef<HTMLVideoElement>(null);
  const callId = useRef(invite.id);

  const handlers = {
    connected: () => {
      setPhase("live");
      setLiveAt(Date.now());
      sfx("go");
    },
    accepted: () => setPhase("connecting"),
    track: () => {
      if (remoteV.current && remoteV.current.srcObject !== sess.current?.remote) remoteV.current.srcObject = sess.current!.remote;
      remoteV.current?.play().catch(() => {});
      setRemoteVideo(!!sess.current?.remote.getVideoTracks().length);
    },
    peer: setThem,
    ended: (reason: string) => {
      setEndText(role === "callee" && reason === "missed" ? "Missed call" : (END_TEXT[reason] ?? "Call ended"));
      setPhase("ended");
      setMini(false);
      if (reason === "failed" || reason === "lost" || reason === "busy") sfx("lose");
    },
  };

  const showLocal = (stream: MediaStream | null) => {
    setHasCam(!!stream?.getVideoTracks().length);
    if (localV.current) localV.current.srcObject = stream;
  };

  // Start once. Teardown is deferred a tick: React's dev-mode double mount runs a cleanup
  // and re-mounts straight away, and that must not hang up the call.
  const started = useRef(false);
  const gone = useRef(false);
  const teardown = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (teardown.current) clearTimeout(teardown.current);
    gone.current = false;
    if (!started.current) {
      started.current = true;
      if (role === "callee" && invite.id) {
        // Ring until answered, or until the caller gives up (status-only polling).
        sess.current = new Session(invite.id, null, handlers);
        sess.current.poll(true);
      } else if (role === "caller") void placeCall();
    }
    const bye = () => sess.current?.beacon();
    window.addEventListener("pagehide", bye);
    return () => {
      window.removeEventListener("pagehide", bye);
      teardown.current = setTimeout(() => {
        gone.current = true;
        sess.current?.finish("hangup");
      }, 0);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Caller: camera first (its permission prompt), then ring them and send the offer.
  const placeCall = async () => {
    const { stream, note } = await getMedia();
    const stop = () => stream?.getTracks().forEach((t) => t.stop());
    if (gone.current) return stop();
    if (note) toast({ kind: stream ? "info" : "error", title: note });
    showLocal(stream);
    try {
      const r = await api<{ callId: string; iceServers: RTCIceServer[] }>("/api/calls", { body: { action: "start", userId: peer.id } });
      if (gone.current) {
        api("/api/calls", { body: { action: "end", callId: r.callId } }).catch(() => {});
        return stop();
      }
      callId.current = r.callId;
      const s = (sess.current = new Session(r.callId, stream, handlers));
      s.connect(r.iceServers, true);
      s.poll();
    } catch (e) {
      stop();
      toast({ kind: "error", title: (e as Error).message });
      onDone();
    }
  };

  // Ring tone / ringback, and a buzz on the callee's phone.
  useEffect(() => {
    if (phase !== "ringing" && phase !== "calling") return;
    const ring = () => {
      if (phase === "ringing") {
        sfx("ring");
        navigator.vibrate?.([400, 200, 400]);
      } else sfx("beep");
    };
    ring();
    const t = setInterval(ring, phase === "ringing" ? 2000 : 3000);
    return () => {
      clearInterval(t);
      navigator.vibrate?.(0);
    };
  }, [phase]);

  // Call timer.
  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Close the "call ended" card on its own.
  useEffect(() => {
    if (phase !== "ended") return;
    const t = setTimeout(() => onDone(callId.current), 1800);
    return () => clearTimeout(t);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hasCam) return;
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((d) => setCanFlip(d.filter((x) => x.kind === "videoinput").length > 1))
      .catch(() => {});
  }, [hasCam]);

  const accept = async () => {
    const s = sess.current;
    if (!s) return;
    setPhase("connecting");
    // Answer first (stops the ring timer), then the camera prompt; the offer waits on the server.
    let iceServers: RTCIceServer[];
    try {
      iceServers = (await api<{ iceServers: RTCIceServer[] }>("/api/calls", { body: { action: "accept", callId: s.id } })).iceServers;
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
      return s.finish("hangup", false);
    }
    const { stream, note } = await getMedia();
    if (note) toast({ kind: stream ? "info" : "error", title: note });
    if (gone.current) return stream?.getTracks().forEach((t) => t.stop());
    s.local = stream;
    showLocal(stream);
    s.connect(iceServers, false);
  };

  const decline = async () => {
    const s = sess.current;
    if (!s) return onDone();
    await api("/api/calls", { body: { action: "decline", callId: s.id } }).catch(() => {});
    s.finish("declined", false);
    onDone(s.id);
  };

  const hangUp = () => (sess.current ? sess.current.finish("hangup") : onDone());

  const pushState = (next: PeerState) => sess.current?.send("state", JSON.stringify(next));
  const toggleMic = () => {
    const on = !mic;
    sess.current?.local?.getAudioTracks().forEach((t) => (t.enabled = on));
    setMic(on);
    pushState({ cam, mic: on });
  };
  const toggleCam = () => {
    const on = !cam;
    sess.current?.local?.getVideoTracks().forEach((t) => (t.enabled = on));
    setCam(on);
    pushState({ cam: on, mic });
  };
  const flip = async () => {
    const s = sess.current;
    const local = s?.local;
    if (!s || !local) return;
    const next = facing === "user" ? "environment" : "user";
    // Release the current camera first: iOS can't open both at once.
    local.getVideoTracks().forEach((t) => (t.stop(), local.removeTrack(t)));
    const open = (mode: "user" | "environment") => navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: mode } } }).then((m) => m.getVideoTracks()[0]);
    let track: MediaStreamTrack | null = null;
    let used: "user" | "environment" = next;
    try {
      track = await open(next);
    } catch {
      toast({ kind: "error", title: "Couldn't switch camera" });
      used = facing;
      track = await open(facing).catch(() => null);
    }
    if (!track) return setHasCam(false);
    track.enabled = cam;
    await s.replaceVideo(track);
    local.addTrack(track);
    if (localV.current) localV.current.srcObject = local;
    setFacing(used);
  };

  const status =
    phase === "ringing" ? "📹 Incoming video call" : phase === "calling" ? "Calling…" : phase === "connecting" ? "Connecting…" : phase === "live" ? mmss(Date.now() - (liveAt ?? Date.now())) : endText;
  const showRemote = phase === "live" && remoteVideo && them.cam;

  return (
    <div className={`call ${mini ? "mini" : ""} ${phase}`} role="dialog" aria-label={`Video call with ${peer.username}`} onClick={mini ? () => setMini(false) : undefined}>
      <video ref={remoteV} className={`call-remote ${showRemote ? "" : "hidden"}`} autoPlay playsInline />
      {!showRemote && (
        <div className="call-peer">
          <div className="call-avatar">{peer.avatar}</div>
          {!mini && <h2>{peer.username}</h2>}
          {!mini && phase === "live" && !them.cam && <p className="muted small">Camera off</p>}
        </div>
      )}

      {!mini && (
        <div className="call-top">
          {showRemote && <b>{peer.username}</b>}
          <span className="call-status">
            {phase === "live" && <span className="call-rec" />} {status}
            {phase === "live" && !them.mic && " · 🔇"}
          </span>
        </div>
      )}
      {mini && <span className="call-mini-time">{status}</span>}

      <video ref={localV} className={`call-local ${hasCam && cam && phase !== "ringing" ? "" : "hidden"} ${facing === "user" ? "mirror" : ""}`} autoPlay playsInline muted />

      {!mini && phase === "ringing" && (
        <div className="call-bar">
          <Button className="call-btn end" onClick={decline} aria-label="Decline">📵</Button>
          <Button className="call-btn answer" onClick={accept} aria-label="Answer">📹</Button>
        </div>
      )}
      {!mini && (phase === "calling" || phase === "connecting" || phase === "live") && (
        <div className="call-bar">
          <Button className={`call-btn ${mic ? "" : "off"}`} onClick={toggleMic} aria-label={mic ? "Mute" : "Unmute"} aria-pressed={!mic}>{mic ? "🎙️" : "🔇"}</Button>
          {hasCam && <Button className={`call-btn ${cam ? "" : "off"}`} onClick={toggleCam} aria-label={cam ? "Camera off" : "Camera on"} aria-pressed={!cam}>{cam ? "📷" : "🚫"}</Button>}
          {canFlip && <Button className="call-btn" onClick={flip} aria-label="Switch camera">🔄</Button>}
          <Button className="call-btn" onClick={() => setMini(true)} aria-label="Minimize — keep playing">🗺️</Button>
          <Button className="call-btn end" onClick={hangUp} aria-label="Hang up">📵</Button>
        </div>
      )}
    </div>
  );
}
