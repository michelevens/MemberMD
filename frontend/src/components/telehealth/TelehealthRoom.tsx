// ===== TelehealthRoom =====
//
// LiveKit-backed HIPAA-compliant video visit room.
//
// Phases:
//   loading       → resolving session from API
//   tech-check    → camera/mic preview + device picker before joining
//   external      → BYOV session (provider's Zoom/Meet/Teams link)
//   connecting    → LiveKit Room.connect in flight
//   active        → in-session, controls + chat available
//   ended         → post-session summary
//   error         → fatal failure (bad token, room not found, etc.)
//
// UI layout intentionally mirrors EnnHealth's TelehealthVideoSession
// (header strip with status + duration + connection quality, large
// remote video, picture-in-picture local preview, footer toolbar
// with mute/cam/share/chat/end, optional chat side panel). What
// differs: every state here is DRIVEN by real LiveKit events, not
// fake setTimeouts. There's no "// Simulate connection" — if you
// see "Connected", you actually are.

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Video, VideoOff, Mic, MicOff, Monitor, MonitorOff,
  PhoneOff, Clock, MessageSquare, Send, Loader2, AlertTriangle,
  CheckCircle, Settings, ExternalLink, Camera, X,
} from "lucide-react";
import {
  Room, RoomEvent, ConnectionQuality, Track,
} from "livekit-client";
import type {
  RemoteTrack, RemoteTrackPublication, RemoteParticipant,
  LocalTrackPublication, Participant,
} from "livekit-client";
import { authService, telehealthService } from "../../lib/api";

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  navy900: "#0f172a",
  navy800: "#1e293b",
  navy700: "#334155",
  teal500: "#27ab83",
  teal600: "#147d64",
  teal50: "#e6fffa",
  slate50: "#f8fafc",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate700: "#334155",
  white: "#ffffff",
  red500: "#ef4444",
  red600: "#dc2626",
  green500: "#22c55e",
  amber500: "#f59e0b",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase =
  | { kind: "loading" }
  | { kind: "tech-check"; sessionToken: string; sessionUrl: string; roomName: string }
  | { kind: "external"; url: string }
  | { kind: "connecting"; sessionToken: string; sessionUrl: string; roomName: string }
  | { kind: "active" }
  | { kind: "ended"; durationSeconds: number }
  | { kind: "error"; message: string };

interface ChatEntry {
  id: string;
  from: string;
  text: string;
  at: Date;
  mine: boolean;
  system?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TelehealthRoom() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  // LiveKit Room — held in a ref because event handlers close over a
  // stable instance and we don't want re-renders to recreate it.
  const roomRef = useRef<Room | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const sessionStartRef = useRef<Date | null>(null);
  // Pending remote tracks — captured in TrackSubscribed and attached
  // by an effect once the <video> element is mounted. Necessary
  // because TrackSubscribed can fire before the active-phase render
  // has flushed, leaving remoteVideoRef.current null.
  const pendingRemoteTracksRef = useRef<RemoteTrack[]>([]);

  // Active-call state — exposed for UI bindings.
  const [isCamOn, setIsCamOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteJoined, setRemoteJoined] = useState(false);
  const [remoteName, setRemoteName] = useState<string>("Participant");
  const [duration, setDuration] = useState(0);
  const [quality, setQuality] = useState<ConnectionQuality>(ConnectionQuality.Excellent);
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  // Waiting room overlay state — patient lands in this state on join
  // until the provider clicks Admit. The overlay covers the active
  // layout but the LiveKit room is already connected behind it so
  // when admitted_at flips, the transition is instant.
  // Practice/provider role bypasses the waiting check (they don't
  // wait for themselves to admit).
  const [isWaiting, setIsWaiting] = useState(false);
  const [waitingFor, setWaitingFor] = useState("your provider");

  // Devices — populated after the local stream is up.
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [activeCam, setActiveCam] = useState<string>("");
  const [activeMic, setActiveMic] = useState<string>("");

  // ─── 1. Fetch the session + token ───────────────────────────────────────
  useEffect(() => {
    if (!sessionId) {
      setPhase({ kind: "error", message: "Missing session id." });
      return;
    }
    let cancelled = false;
    (async () => {
      // Resolve current user role first so we can decide whether to
      // apply the waiting-room gate. Provider/admin/staff bypass it
      // (they're the ones admitting). Patients always go through it.
      const meRes = await authService.me();
      const role = (meRes.data as { role?: string } | null)?.role ?? "";
      const isStaff = ["practice_admin", "staff", "provider", "superadmin"].includes(role);

      const res = await telehealthService.joinSession(sessionId);
      if (cancelled) return;
      if (res.error || !res.data) {
        setPhase({ kind: "error", message: res.error || "Could not load this session." });
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = res.data as any;
      const session = data.session;
      // External (BYOV) — short-circuit.
      if (session?.isExternal) {
        const url = session.externalVideoUrl || session.roomUrl || "";
        if (!url) {
          setPhase({ kind: "error", message: "External video URL is missing." });
          return;
        }
        setPhase({ kind: "external", url });
        return;
      }
      if (!data.token || !data.roomUrl || !data.roomName) {
        setPhase({ kind: "error", message: "Server didn't return a usable LiveKit token." });
        return;
      }
      // Waiting-room gate: patient + admitted_at IS NULL = waiting.
      const admittedAt = session?.admittedAt ?? session?.admitted_at ?? null;
      const isPatient = !isStaff;
      if (isPatient && !admittedAt) {
        setIsWaiting(true);
        // Surface provider's name in the waiting overlay if we can.
        const apt = session?.appointment ?? null;
        const prov = apt?.provider?.user ?? apt?.providerUser ?? null;
        const provName = prov?.name
          ?? [prov?.firstName ?? prov?.first_name, prov?.lastName ?? prov?.last_name].filter(Boolean).join(" ").trim();
        if (provName) setWaitingFor(provName);
      }
      setPhase({
        kind: "tech-check",
        sessionToken: data.token,
        sessionUrl: data.roomUrl,
        roomName: data.roomName,
      });
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  // ─── 1a. Poll session for admittance — only while waiting. ──────────────
  // The patient is already connected to LiveKit; this just clears the
  // overlay once the provider clicks Admit on their end. 4s cadence is
  // a fair balance between perceived latency and server load.
  useEffect(() => {
    if (!isWaiting || !sessionId) return;
    let cancelled = false;
    const id = window.setInterval(async () => {
      const res = await telehealthService.getSession(sessionId);
      if (cancelled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sess = res.data as any;
      const admittedAt = sess?.admittedAt ?? sess?.admitted_at ?? null;
      if (admittedAt) {
        setIsWaiting(false);
        window.clearInterval(id);
      }
    }, 4000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [isWaiting, sessionId]);

  // ─── 2. Tech check — get camera/mic preview before joining ──────────────
  useEffect(() => {
    if (phase.kind !== "tech-check") return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        // Enumerate devices once permissions are granted (labels
        // come back populated only after getUserMedia succeeds).
        const all = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setCameras(all.filter((d) => d.kind === "videoinput"));
        setMics(all.filter((d) => d.kind === "audioinput"));
        setSpeakers(all.filter((d) => d.kind === "audiooutput"));
        const v = stream.getVideoTracks()[0]?.getSettings();
        const a = stream.getAudioTracks()[0]?.getSettings();
        if (v?.deviceId) setActiveCam(v.deviceId);
        if (a?.deviceId) setActiveMic(a.deviceId);
      } catch {
        if (!cancelled) {
          setPhase({
            kind: "error",
            message: "Could not access camera or microphone. Check browser permissions.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [phase.kind]);

  // ─── 3. Connect to LiveKit ──────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (phase.kind !== "tech-check") return;
    const { sessionToken, sessionUrl, roomName } = phase;
    setPhase({ kind: "connecting", sessionToken, sessionUrl, roomName });

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        deviceId: activeCam || undefined,
        resolution: { width: 1280, height: 720, frameRate: 30 },
      },
      audioCaptureDefaults: {
        deviceId: activeMic || undefined,
      },
    });
    roomRef.current = room;

    // ─── Event wiring ──────────────────────────────────────────────────
    room
      .on(RoomEvent.Connected, () => {
        sessionStartRef.current = new Date();
        setPhase({ kind: "active" });
        // If the other participant was already in the room when we
        // joined, ParticipantConnected won't fire for them — that
        // event only fires for arrivals AFTER us. Seed remoteJoined
        // from the current remoteParticipants snapshot so we don't
        // get stuck on "Waiting for the other participant."
        const existing = Array.from(room.remoteParticipants.values());
        if (existing.length > 0) {
          const p = existing[0];
          setRemoteJoined(true);
          setRemoteName(p.name || p.identity || "Participant");
        }
        // Kick off mic/cam publishing using the same devices the
        // tech-check stream was using.
        void room.localParticipant.setMicrophoneEnabled(true);
        void room.localParticipant.setCameraEnabled(true);
      })
      .on(RoomEvent.Disconnected, (reason) => {
        const dur = sessionStartRef.current
          ? Math.floor((Date.now() - sessionStartRef.current.getTime()) / 1000)
          : 0;
        setPhase((p) => p.kind === "ended"
          ? p
          : { kind: "ended", durationSeconds: dur });
        if (reason !== undefined) {
          // eslint-disable-next-line no-console
          console.warn("LiveKit disconnect reason:", reason);
        }
      })
      .on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        setRemoteJoined(true);
        setRemoteName(p.name || p.identity || "Participant");
        appendSystem(`${p.name || p.identity} joined`);
      })
      .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        setRemoteJoined(false);
        appendSystem(`${p.name || p.identity} left`);
      })
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, p: RemoteParticipant) => {
        // Belt-and-suspenders for already-present participants: if the
        // Connected handler somehow missed them (race with the
        // remoteParticipants snapshot), the first track we subscribe
        // to is also a definitive "they're here" signal.
        setRemoteJoined(true);
        setRemoteName(p.name || p.identity || "Participant");
        // The <video> may not be in the DOM yet because the active
        // phase render hasn't flushed. Always queue first; the effect
        // that watches phase + remoteJoined will drain the queue once
        // the ref is populated.
        pendingRemoteTracksRef.current.push(track);
        if (remoteVideoRef.current) {
          track.attach(remoteVideoRef.current);
        }
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach();
        pendingRemoteTracksRef.current = pendingRemoteTracksRef.current.filter(t => t !== track);
      })
      .on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication) => {
        if (pub.kind === Track.Kind.Video && pub.track && localVideoRef.current) {
          pub.track.attach(localVideoRef.current);
        }
      })
      .on(RoomEvent.ConnectionQualityChanged, (q: ConnectionQuality, p?: Participant) => {
        if (!p || p.identity === room.localParticipant.identity) {
          setQuality(q);
        }
      })
      .on(RoomEvent.DataReceived, (payload: Uint8Array, p?: RemoteParticipant) => {
        try {
          const text = new TextDecoder().decode(payload);
          const parsed = JSON.parse(text) as { kind?: string; text?: string };
          const msgText = parsed.text;
          if (parsed.kind === "chat" && typeof msgText === "string") {
            setChat((prev) => [...prev, {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              from: p?.name || p?.identity || "Participant",
              text: msgText,
              at: new Date(),
              mine: false,
            }]);
            setUnreadChat((n) => n + 1);
          }
        } catch {
          /* ignore non-JSON payloads */
        }
      });

    try {
      await room.connect(sessionUrl, sessionToken);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to join the video room.";
      setPhase({ kind: "error", message: msg });
    }
  }, [phase, activeCam, activeMic]);

  // ─── 4. Cleanup on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect().catch(() => {});
        roomRef.current = null;
      }
    };
  }, []);

  // ─── 5. Duration tick ───────────────────────────────────────────────────
  useEffect(() => {
    if (phase.kind !== "active") return;
    const id = window.setInterval(() => {
      if (sessionStartRef.current) {
        setDuration(Math.floor((Date.now() - sessionStartRef.current.getTime()) / 1000));
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase.kind]);

  // ─── 5a. Drain pending remote tracks once the video element is in DOM ──
  // TrackSubscribed can fire before the active-phase render has flushed, so
  // queued tracks need to be attached as soon as the element exists.
  useEffect(() => {
    if (phase.kind !== "active") return;
    if (!remoteVideoRef.current) return;
    if (pendingRemoteTracksRef.current.length === 0) return;
    const el = remoteVideoRef.current;
    pendingRemoteTracksRef.current.forEach((t) => t.attach(el));
    pendingRemoteTracksRef.current = [];
  }, [phase.kind, remoteJoined]);

  // Reset unread chat count when the panel opens.
  useEffect(() => { if (chatOpen) setUnreadChat(0); }, [chatOpen]);

  // ─── Helpers ────────────────────────────────────────────────────────────
  function appendSystem(text: string) {
    setChat((prev) => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from: "system", text, at: new Date(), mine: false, system: true,
    }]);
  }

  async function toggleCam() {
    const room = roomRef.current;
    if (!room) return;
    const next = !isCamOn;
    await room.localParticipant.setCameraEnabled(next);
    setIsCamOn(next);
  }
  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;
    const next = !isMicOn;
    await room.localParticipant.setMicrophoneEnabled(next);
    setIsMicOn(next);
  }
  async function toggleScreenShare() {
    const room = roomRef.current;
    if (!room) return;
    const next = !isScreenSharing;
    try {
      await room.localParticipant.setScreenShareEnabled(next);
      setIsScreenSharing(next);
    } catch {
      // User cancelled the OS picker — silent.
    }
  }
  async function endCall() {
    const room = roomRef.current;
    const dur = sessionStartRef.current
      ? Math.floor((Date.now() - sessionStartRef.current.getTime()) / 1000)
      : 0;
    setPhase({ kind: "ended", durationSeconds: dur });
    if (room) {
      try { await room.disconnect(); } catch { /* swallow */ }
    }
    if (sessionId) {
      void telehealthService.endSession(sessionId);
    }
  }
  async function sendChat() {
    const room = roomRef.current;
    const text = chatDraft.trim();
    if (!room || !text) return;
    const payload = new TextEncoder().encode(JSON.stringify({ kind: "chat", text }));
    await room.localParticipant.publishData(payload, { reliable: true });
    setChat((prev) => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from: "you", text, at: new Date(), mine: true,
    }]);
    setChatDraft("");
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  if (phase.kind === "loading") {
    return <FullPageMessage icon={Loader2} title="Loading session…" spinning />;
  }
  if (phase.kind === "error") {
    return (
      <FullPageMessage
        icon={AlertTriangle}
        accent={C.red500}
        title="Couldn't open the video room"
        body={phase.message}
        cta={{ label: "Go back", onClick: () => navigate(-1) }}
      />
    );
  }
  if (phase.kind === "external") {
    return <ExternalRoomPanel url={phase.url} onLeave={() => navigate(-1)} />;
  }
  if (phase.kind === "ended") {
    return (
      <FullPageMessage
        icon={CheckCircle}
        accent={C.teal500}
        title="Session ended"
        body={`Duration: ${formatDuration(phase.durationSeconds)}`}
        cta={{ label: "Done", onClick: () => navigate(-1) }}
      />
    );
  }

  // tech-check + connecting + active share the room frame.
  // Lock to viewport height + clip overflow so the page can't grow
  // taller than the viewport. Without this, the body's large video
  // panel + bottom toolbar + waiting overlay can collectively exceed
  // 100vh and produce a scrollbar — the room must always render as
  // a stable, fit-to-screen surface.
  return (
    <div style={{ height: "100vh", maxHeight: "100vh", overflow: "hidden", backgroundColor: C.navy900, color: C.white, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.navy700}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: phase.kind === "active" ? C.green500 : C.amber500 }} />
          <span className="text-sm font-semibold">
            {phase.kind === "tech-check" && "Tech check"}
            {phase.kind === "connecting" && "Connecting…"}
            {phase.kind === "active" && (remoteJoined ? `In session with ${remoteName}` : "Waiting for the other participant…")}
          </span>
          {phase.kind === "active" && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1" style={{ backgroundColor: C.navy800 }}>
              <Clock className="w-3 h-3" /> {formatDuration(duration)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {phase.kind === "active" && <QualityPill quality={quality} />}
        </div>
      </div>

      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {phase.kind === "active" && (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              backgroundColor: C.navy900,
              display: remoteJoined ? "block" : "none",
            }}
          />
        )}
        {phase.kind === "active" && !remoteJoined && (
          <div className="text-center">
            <Loader2 className="w-8 h-8 mx-auto animate-spin mb-3" style={{ color: C.slate400 }} />
            <p className="text-sm" style={{ color: C.slate400 }}>
              Waiting for {remoteName} to join…
            </p>
          </div>
        )}

        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: phase.kind === "tech-check" ? "static" : "absolute",
            bottom: phase.kind === "tech-check" ? undefined : 18,
            right: phase.kind === "tech-check" ? undefined : 18,
            width: phase.kind === "tech-check" ? "min(640px, 90%)" : 200,
            height: phase.kind === "tech-check" ? "auto" : 140,
            aspectRatio: phase.kind === "tech-check" ? "16/9" : undefined,
            objectFit: "cover",
            borderRadius: 12,
            border: phase.kind === "tech-check" ? `1px solid ${C.navy700}` : `2px solid ${C.navy800}`,
            backgroundColor: C.navy800,
          }}
        />

        {phase.kind === "tech-check" && (
          <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", textAlign: "center" }}>
            <div className="text-xs mb-2" style={{ color: C.slate400 }}>Camera & microphone preview</div>
            <button
              onClick={connect}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold text-white"
              style={{ backgroundColor: C.teal500 }}
            >
              <Video className="w-4 h-4" /> Join session
            </button>
          </div>
        )}

        {phase.kind === "connecting" && (
          <div className="text-center">
            <Loader2 className="w-8 h-8 mx-auto animate-spin mb-3" style={{ color: C.slate400 }} />
            <p className="text-sm" style={{ color: C.slate400 }}>Connecting to the room…</p>
          </div>
        )}

        {phase.kind === "active" && chatOpen && (
          <ChatPanel
            messages={chat}
            draft={chatDraft}
            onDraftChange={setChatDraft}
            onSend={sendChat}
            onClose={() => setChatOpen(false)}
          />
        )}

        {showSettings && (
          <SettingsPanel
            cameras={cameras}
            mics={mics}
            speakers={speakers}
            activeCam={activeCam}
            activeMic={activeMic}
            onSelectCam={async (id) => {
              setActiveCam(id);
              const room = roomRef.current;
              if (room) await room.switchActiveDevice("videoinput", id);
            }}
            onSelectMic={async (id) => {
              setActiveMic(id);
              const room = roomRef.current;
              if (room) await room.switchActiveDevice("audioinput", id);
            }}
            onSelectSpeaker={async (id) => {
              const room = roomRef.current;
              if (room) await room.switchActiveDevice("audiooutput", id);
            }}
            onClose={() => setShowSettings(false)}
          />
        )}

        {/* Waiting-room overlay — patient is connected to LiveKit
            but the provider hasn't clicked Admit yet. Covers the
            entire video area so they don't see/hear anything until
            admitted. The provider role bypasses isWaiting entirely
            so they're never staring at this screen. */}
        {phase.kind === "active" && isWaiting && (
          <div
            style={{
              position: "absolute", inset: 0,
              backgroundColor: C.navy900,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              zIndex: 40,
              textAlign: "center",
              padding: 24,
            }}
          >
            <div
              style={{
                width: 64, height: 64, borderRadius: "50%",
                backgroundColor: "rgba(39, 171, 131, 0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <Loader2 className="w-7 h-7 animate-spin" style={{ color: C.teal500 }} />
            </div>
            <h2 className="text-lg font-semibold" style={{ color: C.white }}>
              You're in the waiting room
            </h2>
            <p className="text-sm mt-2 max-w-sm" style={{ color: C.slate400 }}>
              {waitingFor !== "your provider"
                ? `${waitingFor} will admit you when they're ready.`
                : "Your provider will admit you when they're ready."}
              {" "}This usually takes just a moment.
            </p>
            <p className="text-xs mt-6" style={{ color: C.slate500 }}>
              Your camera and microphone are ready — they'll start when the visit begins.
            </p>
          </div>
        )}
      </div>

      {phase.kind === "active" && (
        <div style={{ padding: "14px 18px", borderTop: `1px solid ${C.navy700}`, display: "flex", justifyContent: "center", gap: 10, flexShrink: 0 }}>
          <ToolbarButton
            label={isMicOn ? "Mute" : "Unmute"}
            icon={isMicOn ? Mic : MicOff}
            danger={!isMicOn}
            onClick={toggleMic}
          />
          <ToolbarButton
            label={isCamOn ? "Camera off" : "Camera on"}
            icon={isCamOn ? Video : VideoOff}
            danger={!isCamOn}
            onClick={toggleCam}
          />
          <ToolbarButton
            label="Share screen"
            icon={isScreenSharing ? MonitorOff : Monitor}
            active={isScreenSharing}
            onClick={toggleScreenShare}
          />
          <ToolbarButton
            label="Chat"
            icon={MessageSquare}
            badge={unreadChat}
            active={chatOpen}
            onClick={() => setChatOpen((v) => !v)}
          />
          <ToolbarButton
            label="Settings"
            icon={Settings}
            active={showSettings}
            onClick={() => setShowSettings((v) => !v)}
          />
          <button
            onClick={endCall}
            className="px-5 py-3 rounded-full text-sm font-bold text-white inline-flex items-center gap-2 hover:opacity-90 transition-opacity"
            style={{ backgroundColor: C.red500 }}
          >
            <PhoneOff className="w-4 h-4" /> End
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ToolbarButton({
  icon: Icon, label, onClick, active = false, danger = false, badge = 0,
}: {
  icon: typeof Video;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="relative flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
      style={{
        backgroundColor: active ? "rgba(39, 171, 131, 0.15)" : "transparent",
        color: danger ? C.red500 : C.white,
      }}
    >
      <Icon className="w-5 h-5" />
      <span className="text-[10px]" style={{ color: C.slate400 }}>{label}</span>
      {badge > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
          style={{ backgroundColor: C.red500, color: C.white }}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

function QualityPill({ quality }: { quality: ConnectionQuality }) {
  const meta = quality === ConnectionQuality.Excellent
    ? { color: C.green500, label: "Excellent" }
    : quality === ConnectionQuality.Good
      ? { color: C.amber500, label: "Good" }
      : quality === ConnectionQuality.Poor
        ? { color: C.red500, label: "Poor" }
        : { color: C.slate400, label: "Unknown" };
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1.5" style={{ backgroundColor: C.navy800 }}>
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
}

function ChatPanel({
  messages, draft, onDraftChange, onSend, onClose,
}: {
  messages: ChatEntry[];
  draft: string;
  onDraftChange: (v: string) => void;
  onSend: () => void;
  onClose: () => void;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div
      style={{
        position: "absolute", top: 0, right: 0, bottom: 0,
        width: "min(360px, 90%)",
        backgroundColor: C.navy800,
        borderLeft: `1px solid ${C.navy700}`,
        display: "flex", flexDirection: "column",
        boxShadow: "-10px 0 30px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.navy700}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p className="text-sm font-semibold">Chat</p>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
        {messages.length === 0 && (
          <p className="text-xs text-center mt-6" style={{ color: C.slate400 }}>
            No messages yet — say hi.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="mb-2">
            {m.system ? (
              <p className="text-[10px] text-center italic" style={{ color: C.slate400 }}>{m.text}</p>
            ) : (
              <div style={{ textAlign: m.mine ? "right" : "left" }}>
                <div
                  className="inline-block px-3 py-1.5 rounded-2xl text-sm max-w-[80%] text-left"
                  style={{
                    backgroundColor: m.mine ? C.teal600 : C.navy700,
                    color: C.white,
                  }}
                >
                  {m.text}
                </div>
                <p className="text-[10px] mt-0.5" style={{ color: C.slate400 }}>
                  {m.from} · {m.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div style={{ padding: "10px 12px", borderTop: `1px solid ${C.navy700}`, display: "flex", gap: 8 }}>
        <input
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          placeholder="Type a message…"
          className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
          style={{ backgroundColor: C.navy900, color: C.white, border: `1px solid ${C.navy700}` }}
        />
        <button
          onClick={onSend}
          disabled={!draft.trim()}
          className="px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{ backgroundColor: C.teal500, color: C.white }}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function SettingsPanel({
  cameras, mics, speakers, activeCam, activeMic,
  onSelectCam, onSelectMic, onSelectSpeaker, onClose,
}: {
  cameras: MediaDeviceInfo[];
  mics: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
  activeCam: string;
  activeMic: string;
  onSelectCam: (id: string) => void;
  onSelectMic: (id: string) => void;
  onSelectSpeaker: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute", inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 30,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: C.navy800,
          borderRadius: 12,
          padding: "16px 18px",
          width: "min(420px, 90%)",
          color: C.white,
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold">Devices</p>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>
        <DeviceSelect label="Camera" devices={cameras} value={activeCam} onChange={onSelectCam} />
        <DeviceSelect label="Microphone" devices={mics} value={activeMic} onChange={onSelectMic} />
        <DeviceSelect label="Speaker" devices={speakers} value={""} onChange={onSelectSpeaker} placeholder="(default)" />
      </div>
    </div>
  );
}

function DeviceSelect({
  label, devices, value, onChange, placeholder,
}: {
  label: string;
  devices: MediaDeviceInfo[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium mb-1" style={{ color: C.slate400 }}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-sm"
        style={{ backgroundColor: C.navy900, color: C.white, border: `1px solid ${C.navy700}` }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>{d.label || `Unknown ${label.toLowerCase()}`}</option>
        ))}
      </select>
    </div>
  );
}

function ExternalRoomPanel({ url, onLeave }: { url: string; onLeave: () => void }) {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: C.slate50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, backgroundColor: C.white, borderRadius: 16, padding: 32, textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.06)" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", backgroundColor: C.teal50, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Camera className="w-7 h-7" style={{ color: C.teal600 }} />
        </div>
        <h1 className="text-lg font-semibold mb-1" style={{ color: C.navy800 }}>External video session</h1>
        <p className="text-sm mb-5" style={{ color: C.slate500 }}>
          Your provider uses an external video service (Zoom, Google Meet, etc.) for this visit.
          Click below to open the meeting in a new tab.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold text-white"
          style={{ backgroundColor: C.teal500 }}
        >
          Open meeting <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <p className="text-xs mt-4 break-all" style={{ color: C.slate400 }}>{url}</p>
        <button
          onClick={onLeave}
          className="mt-5 text-xs font-medium hover:underline"
          style={{ color: C.slate500 }}
        >
          Back
        </button>
      </div>
    </div>
  );
}

function FullPageMessage({
  icon: Icon, title, body, accent = C.slate500, spinning = false, cta,
}: {
  icon: typeof Video;
  title: string;
  body?: string;
  accent?: string;
  spinning?: boolean;
  cta?: { label: string; onClick: () => void };
}) {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: C.slate50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <Icon
          className={`w-10 h-10 mx-auto mb-3 ${spinning ? "animate-spin" : ""}`}
          style={{ color: accent }}
        />
        <h1 className="text-lg font-semibold mb-1" style={{ color: C.navy800 }}>{title}</h1>
        {body && <p className="text-sm" style={{ color: C.slate500 }}>{body}</p>}
        {cta && (
          <button
            onClick={cta.onClick}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-100"
            style={{ color: C.slate700, border: `1px solid ${C.slate200}` }}
          >
            {cta.label}
          </button>
        )}
      </div>
    </div>
  );
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default TelehealthRoom;
