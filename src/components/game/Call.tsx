"use client";
// 1:1 video and voice calls with crew members. WebRTC carries the audio/video straight between the
// two phones; /api/calls relays only the handshake (offer, answer, ICE candidates) by
// polling, the same serverless-friendly "realtime" as chat. The caller always offers.
import { useEffect, useRef, useState } from "react";
import { Button } from "../Button";
import { msg, t } from "@/lib/i18n";
import { api, statusOf } from "./client";
import { browserInfo, cameraSteps, openInBrowserUrl } from "./location/browser";
import { sfx } from "./sfx";
import { useGame } from "./ui";

export type CallPeer = { id: string; username: string; avatar: string };
/** A call to place (caller, no id yet) or one ringing this phone (callee). */
export type CallInvite = { id?: string; peer: CallPeer; role: "caller" | "callee"; /** false: a voice call, no cameras. */ video?: boolean; /** Answered from the notification. */ autoAnswer?: boolean };

type Phase = "ringing" | "calling" | "connecting" | "live" | "ended";
type Signal = { id: number; kind: "offer" | "answer" | "ice" | "state"; data: string };
type PeerState = { cam: boolean; mic: boolean };

const END_TEXT: Record<string, string> = {
  hangup: msg("Call ended"),
  declined: msg("Declined"),
  missed: msg("No answer"),
  busy: msg("Busy"),
  lost: msg("Connection lost"),
  failed: msg("Couldn't connect — the network blocked the call"),
  norelay: msg("Couldn't connect — this network blocks the call relay. Try Wi-Fi or another SIM"),
};

/**
 * What the camera captures. 720p: phones show the other side full screen, and anything
 * smaller looks blurry once it's stretched to fill it. The encoder still scales down on
 * its own when the network or the phone can't keep up.
 */
const CAMERA = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } };
const MIC = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
/** Video bitrate ceiling. Some browsers (Safari) cap it well below what 720p needs. */
const VIDEO_BPS = 2_500_000;

/** Signals per request (the server accepts up to 60). */
const SIGNAL_BATCH = 30;
/** A signal batch is retried this many times (about 20 s in all) before it's given up. */
const SEND_RETRIES = 8;
/**
 * Relay-only calls: every packet goes through TURN, as it must between two phones on
 * carrier-grade NAT (most mobile data). Set localStorage sq_call_relay=1 to check the
 * relay works from a network, or to reproduce an LTE ↔ LTE call on Wi-Fi.
 */
const forceRelay = () => {
  try {
    return localStorage.getItem("sq_call_relay") === "1";
  } catch {
    return false;
  }
};

/** "typ relay" etc. from an ICE candidate line. */
const candType = (line: string) => / typ (\w+)/.exec(line)?.[1] ?? "?";
const candProto = (line: string) => (/ tcp /i.test(line) ? "tcp" : "udp");

/** Why the camera/mic couldn't be opened. */
type MediaProblem = "blocked" | "busy" | "inapp" | "insecure" | "nodevice";

const PROBLEM_TITLE: Record<Exclude<MediaProblem, "nodevice">, string> = {
  blocked: msg("Camera & mic are blocked"),
  busy: msg("Camera is busy"),
  inapp: msg("Open in your browser"),
  insecure: msg("Calls need https"),
};

function classify(e: unknown): MediaProblem {
  const name = (e as { name?: string })?.name;
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "nodevice";
  // Android also reports a camera held by another app (or switched off in quick settings) this way.
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "busy";
  // In-app browsers (Telegram, Instagram…) refuse without ever asking.
  return browserInfo().inApp ? "inapp" : "blocked";
}

/** Camera + mic (just the mic for a voice call); failing that, mic only (with the reason the camera failed). */
async function getMedia(video: boolean): Promise<{ stream: MediaStream | null; problem: MediaProblem | null }> {
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) return { stream: null, problem: browserInfo().inApp ? "inapp" : "insecure" };
  try {
    return { stream: await md.getUserMedia({ audio: MIC, video: video && { ...CAMERA, facingMode: "user" } }), problem: null };
  } catch (e) {
    const problem = classify(e);
    if (!video) return { stream: null, problem };
    try {
      return { stream: await md.getUserMedia({ audio: MIC }), problem };
    } catch (e2) {
      const p2 = classify(e2);
      return { stream: null, problem: p2 === "nodevice" ? problem : p2 };
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
  private offerer = false;
  private watchdog: ReturnType<typeof setTimeout>[] = [];
  live = false;
  /** What ICE found on each side, sent to the server logs when a call can't connect. */
  private diag = { local: {} as Record<string, number>, remote: {} as Record<string, number>, restarts: 0, iceState: "", gather: "" };

  constructor(
    public id: string,
    public local: MediaStream | null,
    private on: { connected: () => void; ended: (reason: string) => void; track: () => void; peer: (s: PeerState) => void; accepted: () => void },
  ) {}

  connect(iceServers: RTCIceServer[], offerer: boolean, video: boolean) {
    // Hung up while this phone was still asking for the camera.
    if (this.closed) return this.local?.getTracks().forEach((t) => t.stop());
    this.offerer = offerer;
    const pc = (this.pc = new RTCPeerConnection({ iceServers, iceTransportPolicy: forceRelay() ? "relay" : "all" }));
    for (const t of this.local?.getTracks() ?? []) pc.addTrack(t, this.local!);
    // A video call's offer always asks for both audio and video, even if this phone has no
    // camera or mic. (The answering side reuses its addTrack senders for the offer's lines.)
    if (offerer && !this.local?.getAudioTracks().length) pc.addTransceiver("audio", { direction: "recvonly" });
    if (offerer && video && !this.local?.getVideoTracks().length) pc.addTransceiver("video", { direction: "recvonly" });
    pc.ontrack = (e) => {
      if (!this.remote.getTracks().includes(e.track)) this.remote.addTrack(e.track);
      this.on.track();
    };
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      const k = `${candType(e.candidate.candidate)}/${candProto(e.candidate.candidate)}`;
      this.diag.local[k] = (this.diag.local[k] ?? 0) + 1;
      this.send("ice", JSON.stringify(e.candidate.toJSON()));
    };
    pc.onicegatheringstatechange = () => (this.diag.gather = pc.iceGatheringState);
    pc.oniceconnectionstatechange = () => (this.diag.iceState = pc.iceConnectionState);
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "connected" && !this.live) {
        this.live = true;
        this.on.connected();
      }
      // Mobile data drops for a moment when the phone changes cell or switches to Wi-Fi:
      // the caller asks for a fresh route instead of letting the call die.
      if (st === "disconnected" && this.live) setTimeout(() => pc.connectionState === "disconnected" && this.restart(), 3000);
      if (st === "failed") {
        if (this.live) this.restart();
        // Before connecting, the watchdog decides (restart, then give up).
      }
    };
    if (offerer)
      (async () => {
        await pc.setLocalDescription(await pc.createOffer());
        this.send("offer", pc.localDescription!.sdp);
      })().catch(() => this.finish("failed"));
  }

  /**
   * Started once offer and answer are exchanged: a call stuck "Connecting…" gets a fresh
   * set of routes (ICE restart) and then gives up with a reason, instead of hanging.
   */
  private arm() {
    if (this.watchdog.length) return;
    this.watchdog = [
      setTimeout(() => !this.live && this.restart(), 12_000),
      setTimeout(() => !this.live && this.finish(this.diag.local["relay/udp"] || this.diag.local["relay/tcp"] ? "failed" : "norelay"), 40_000),
    ];
  }

  /** New ICE routes. The caller drives it; the callee just answers the new offer. */
  private async restart() {
    const pc = this.pc;
    if (!pc || this.closed || !this.offerer || pc.signalingState !== "stable") return;
    this.diag.restarts++;
    try {
      await pc.setLocalDescription(await pc.createOffer({ iceRestart: true }));
      this.send("offer", pc.localDescription!.sdp);
    } catch {}
  }

  send(kind: Signal["kind"], data: string) {
    if (this.closed) return;
    this.outbox.push({ kind, data });
    // ICE candidates arrive in bursts: batch them into one request. Batches go out in
    // order, so candidates never overtake the offer/answer they belong to.
    this.flushT ??= setTimeout(() => {
      this.flushT = null;
      const all = this.outbox.splice(0);
      // Phones on mobile data with IPv6 and several TURN routes can gather more candidates
      // than one request may carry: split rather than have the server refuse the lot.
      for (let i = 0; i < all.length; i += SIGNAL_BATCH) {
        const signals = all.slice(i, i + SIGNAL_BATCH);
        this.sending = this.sending.then(() => this.deliver(signals));
      }
    }, 120);
  }

  /**
   * One batch, retried until it lands: on mobile data a request often fails once, and a
   * lost answer or relay candidate would leave the call stuck on "Connecting…".
   */
  private async deliver(signals: { kind: Signal["kind"]; data: string }[]) {
    for (let attempt = 0; attempt < SEND_RETRIES && !this.closed; attempt++) {
      try {
        await api("/api/calls", { body: { action: "signal", callId: this.id, signals } });
        return;
      } catch (e) {
        // The call is over (410) or gone (404): nothing left to deliver to.
        if (statusOf(e) === 404 || statusOf(e) === 410) return;
        await new Promise((r) => setTimeout(r, Math.min(4000, 400 * 2 ** attempt)));
      }
    }
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
        this.arm();
        void this.tune();
      } else if (s.kind === "answer") {
        if (pc.signalingState === "have-local-offer") await pc.setRemoteDescription({ type: "answer", sdp: s.data });
        await this.drainIce();
        this.arm();
        void this.tune();
      } else if (s.kind === "ice") {
        const c = JSON.parse(s.data) as RTCIceCandidateInit;
        const k = `${candType(c.candidate ?? "")}/${candProto(c.candidate ?? "")}`;
        this.diag.remote[k] = (this.diag.remote[k] ?? 0) + 1;
        if (pc.remoteDescription) await pc.addIceCandidate(c);
        else this.pendingIce.push(c);
      } else if (s.kind === "state") this.on.peer(JSON.parse(s.data));
    } catch (e) {
      if (s.kind !== "ice") this.finish("failed");
      else console.warn("bad ICE candidate", e);
    }
  }

  /**
   * Encoder settings, once negotiation has created the encoders: a higher video ceiling,
   * and voice first when the network is congested — choppy video is bearable, choppy
   * sound isn't.
   */
  private async tune() {
    for (const sender of this.pc?.getSenders() ?? []) {
      const kind = sender.track?.kind;
      const p = sender.getParameters();
      if (!kind || !p.encodings?.length) continue;
      Object.assign(p.encodings[0], kind === "video" ? { maxBitrate: VIDEO_BPS, maxFramerate: 30 } : { priority: "high", networkPriority: "high" });
      await sender.setParameters(p).catch(() => {});
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
    this.watchdog.forEach(clearTimeout);
    // A call that couldn't connect (or dropped) reports what ICE saw, for the server logs.
    const troubled = reason === "failed" || reason === "norelay" || reason === "lost";
    const net = (navigator as { connection?: { effectiveType?: string; type?: string } }).connection;
    const diag = troubled ? { reason, role: this.offerer ? "caller" : "callee", ...this.diag, net: net ? `${net.type ?? "?"}/${net.effectiveType ?? "?"}` : "?", ua: navigator.userAgent.slice(0, 160) } : undefined;
    if (tellServer) api("/api/calls", { body: { action: "end", callId: this.id, reason: troubled ? reason : undefined, diag } }).catch(() => {});
    this.pc?.close();
    this.local?.getTracks().forEach((t) => t.stop());
    this.on.ended(reason);
  }

  /** Page is closing: a beacon still reaches the server after the tab is gone. */
  beacon() {
    // A phone that is only ringing leaves the call alone: it can still be answered from the notification.
    if (this.closed || !this.pc) return;
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
  const video = invite.video ?? true;
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
  // Camera/mic couldn't open: the call waits on this card until the player fixes it or goes on without.
  const [help, setHelp] = useState<{ problem: Exclude<MediaProblem, "nodevice">; partial: MediaStream | null } | null>(null);
  const helpDone = useRef<((s: MediaStream | null) => void) | null>(null);
  const helpStream = useRef<MediaStream | null>(null);
  const b = useRef(browserInfo()).current;
  const installed = typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches;

  /** Camera + mic, or explain what's blocking them and let the player fix it or go on without. */
  const acquire = async (): Promise<MediaStream | null> => {
    const { stream, problem } = await getMedia(video);
    if (!problem) return stream;
    if (problem === "nodevice") {
      toast({ kind: "info", title: !video ? t("No mic found — you can still listen") : stream ? t("No camera found — voice only") : t("No camera or mic found — you can still watch and listen") });
      return stream;
    }
    helpStream.current = stream;
    return new Promise((resolve) => {
      helpDone.current = (s) => {
        helpDone.current = null;
        helpStream.current = null;
        setHelp(null);
        resolve(s);
      };
      setHelp({ problem, partial: stream });
    });
  };
  const retryMedia = async () => {
    helpStream.current?.getTracks().forEach((t) => t.stop());
    helpStream.current = null;
    const { stream, problem } = await getMedia(video);
    if (!problem || problem === "nodevice") return helpDone.current?.(stream);
    helpStream.current = stream;
    setHelp({ problem, partial: stream });
    toast({ kind: "error", title: t("Still blocked — check the steps above") });
  };

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
      helpStream.current?.getTracks().forEach((t) => t.stop());
      helpDone.current?.(null);
      setEndText(role === "callee" && reason === "missed" ? t("Missed call") : t(END_TEXT[reason] ?? "Call ended"));
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
        // It rings in here now: clear the phone's ringing notification.
        navigator.serviceWorker?.ready
          .then((r) => r.getNotifications({ tag: `call-${invite.id}` }))
          .then((ns) => ns.forEach((n) => n.close()))
          .catch(() => {});
        if (invite.autoAnswer) void accept();
      } else if (role === "caller") void placeCall();
    }
    const bye = () => sess.current?.beacon();
    window.addEventListener("pagehide", bye);
    return () => {
      window.removeEventListener("pagehide", bye);
      teardown.current = setTimeout(() => {
        gone.current = true;
        helpStream.current?.getTracks().forEach((t) => t.stop());
        // Only hang up a call this phone is in (not one that's merely ringing here).
        sess.current?.finish("hangup", !!sess.current.pc);
      }, 0);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Caller: camera first (its permission prompt), then ring them and send the offer.
  const placeCall = async () => {
    const stream = await acquire();
    const stop = () => stream?.getTracks().forEach((t) => t.stop());
    if (gone.current) return stop();
    showLocal(stream);
    try {
      const r = await api<{ callId: string; iceServers: RTCIceServer[] }>("/api/calls", { body: { action: "start", userId: peer.id, video } });
      if (gone.current) {
        api("/api/calls", { body: { action: "end", callId: r.callId } }).catch(() => {});
        return stop();
      }
      callId.current = r.callId;
      const s = (sess.current = new Session(r.callId, stream, handlers));
      s.connect(r.iceServers, true, video);
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
    const stream = await acquire();
    if (gone.current) return stream?.getTracks().forEach((t) => t.stop());
    s.local = stream;
    showLocal(stream);
    s.connect(iceServers, false, video);
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
    const open = (mode: "user" | "environment") => navigator.mediaDevices.getUserMedia({ video: { ...CAMERA, facingMode: { exact: mode } } }).then((m) => m.getVideoTracks()[0]);
    let track: MediaStreamTrack | null = null;
    let used: "user" | "environment" = next;
    try {
      track = await open(next);
    } catch {
      toast({ kind: "error", title: t("Couldn't switch camera") });
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
    phase === "ringing" ? (video ? t("📹 Incoming video call") : t("📞 Incoming voice call")) : phase === "calling" ? t("Calling…") : phase === "connecting" ? t("Connecting…") : phase === "live" ? mmss(Date.now() - (liveAt ?? Date.now())) : endText;
  const showRemote = video && phase === "live" && remoteVideo && them.cam;

  return (
    <div className={`call ${mini ? "mini" : ""} ${phase}`} role="dialog" aria-label={video ? t("Video call with {name}", { name: peer.username }) : t("Voice call with {name}", { name: peer.username })} onClick={mini ? () => setMini(false) : undefined}>
      <video ref={remoteV} className={`call-remote ${showRemote ? "" : "hidden"}`} autoPlay playsInline />
      {!showRemote && (
        <div className="call-peer">
          <div className="call-avatar">{peer.avatar}</div>
          {!mini && <h2 dir="auto">{peer.username}</h2>}
          {!mini && phase === "live" && video && !them.cam && <p className="muted small">{t("Camera off")}</p>}
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
          <Button className="call-btn end" onClick={decline} aria-label={t("Decline")}>📵</Button>
          <Button className="call-btn answer" onClick={accept} aria-label={t("Answer")}>{video ? "📹" : "📞"}</Button>
        </div>
      )}
      {!mini && (phase === "calling" || phase === "connecting" || phase === "live") && (
        <div className="call-bar">
          <Button className={`call-btn ${mic ? "" : "off"}`} onClick={toggleMic} aria-label={mic ? t("Mute") : t("Unmute")} aria-pressed={!mic}>{mic ? "🎙️" : "🔇"}</Button>
          {hasCam && <Button className={`call-btn ${cam ? "" : "off"}`} onClick={toggleCam} aria-label={cam ? t("Camera off") : t("Camera on")} aria-pressed={!cam}>{cam ? "📷" : "🚫"}</Button>}
          {canFlip && <Button className="call-btn" onClick={flip} aria-label={t("Switch camera")}>🔄</Button>}
          <Button className="call-btn" onClick={() => setMini(true)} aria-label={t("Minimize — keep playing")}>🗺️</Button>
          <Button className="call-btn end" onClick={hangUp} aria-label={t("Hang up")}>📵</Button>
        </div>
      )}

      {help && phase !== "ended" && !mini && (
        <div className="call-help" role="alertdialog" aria-labelledby="call-help-title">
          <div style={{ fontSize: 40 }} aria-hidden>📷</div>
          <h3 id="call-help-title">{!video && help.problem === "blocked" ? t("Microphone is blocked") : t(PROBLEM_TITLE[help.problem])}</h3>
          {help.problem === "blocked" && (
            <ol className="steps">
              {cameraSteps(b, installed).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
          {help.problem === "busy" && <p>{t("Another app is using the camera, or camera access is switched off in your phone's quick settings. Close the other app (or turn access on), then tap Try again.")}</p>}
          {help.problem === "inapp" && <p>{t("You opened the game inside {app}, which can't use the camera.", { app: b.inApp ?? "" })} {b.os === "ios" ? t("Tap ••• or the share icon → Open in browser.") : t("Open it in Chrome to make calls.")}</p>}
          {help.problem === "insecure" && <p>{t("Browsers only allow the camera on https:// pages. Open the game through its https link.")}</p>}
          <div className="row wrap" style={{ justifyContent: "center" }}>
            {help.problem === "inapp" && openInBrowserUrl(b) && (
              <a className="btn cyan" href={openInBrowserUrl(b)!}>
                {t("Open in Chrome")}
              </a>
            )}
            {(help.problem === "blocked" || help.problem === "busy") && (
              <Button className="btn cyan" onClick={retryMedia}>
                {t("Try again")}
              </Button>
            )}
            <Button className="btn ghost" onClick={() => helpDone.current?.(help.partial)}>
              {help.partial ? t("Continue voice only") : video ? t("Continue without camera") : t("Continue without mic")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
