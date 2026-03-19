// ===== TelehealthRoom =====
// HIPAA-compliant video visit room with Daily.co integration
// States: loading → tech-check → waiting → active → post-session
// Also handles external video links

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Monitor,
  PhoneOff,
  Clock,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Shield,
  Loader2,
  Camera,
} from "lucide-react";
import { telehealthService } from "../../lib/api";
import type { TelehealthSession } from "../../types";

// ─── Colors (no arbitrary Tailwind) ──────────────────────────────────────────

const C = {
  navy900: "#102a43",
  navy800: "#243b53",
  navy700: "#334e68",
  navy600: "#486581",
  teal500: "#27ab83",
  teal600: "#147d64",
  teal700: "#0c6b58",
  slate50: "#f8fafc",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  red500: "#ef4444",
  red600: "#dc2626",
  green50: "#ecfdf5",
  green500: "#22c55e",
  amber500: "#f59e0b",
  white: "#ffffff",
};

type RoomPhase = "loading" | "tech-check" | "waiting" | "active" | "post-session" | "external" | "error";

interface TelehealthRoomProps {
  sessionId?: string;
}

export function TelehealthRoom({ sessionId: propSessionId }: TelehealthRoomProps) {
  const params = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const sid = propSessionId || params.sessionId || "";

  const [phase, setPhase] = useState<RoomPhase>("loading");
  const [session, setSession] = useState<TelehealthSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tech check
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [consentGiven, setConsentGiven] = useState(false);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  // Active session
  const dailyContainerRef = useRef<HTMLDivElement>(null);
  const callFrameRef = useRef<ReturnType<typeof import("@daily-co/daily-js").default.createFrame> | null>(null);
  const [screenSharing, setScreenSharing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Polling ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Load Session ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!sid) {
      setError("No session ID provided");
      setPhase("error");
      return;
    }
    loadSession();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid]);

  async function loadSession() {
    const res = await telehealthService.getSession(sid);
    if (res.error || !res.data) {
      setError(res.error || "Failed to load session");
      setPhase("error");
      return;
    }
    const s = res.data;
    setSession(s);

    if (s.isExternal && s.externalVideoUrl) {
      setPhase("external");
    } else if (s.status === "completed" || s.status === "expired") {
      setPhase("post-session");
    } else {
      setPhase("tech-check");
    }
  }

  // ─── Tech Check: Camera/Mic Preview ────────────────────────────────────────

  useEffect(() => {
    if (phase !== "tech-check") return;
    startPreview();
    return () => stopPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function startPreview() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setMediaStream(stream);
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }
    } catch {
      // Camera/mic not available — still allow joining
    }
  }

  function stopPreview() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      setMediaStream(null);
    }
  }

  // ─── Join Session ──────────────────────────────────────────────────────────

  const handleJoin = useCallback(async () => {
    if (!session) return;

    // Give consent if needed
    if (session.recordingEnabled && consentGiven) {
      await telehealthService.giveConsent(sid);
    }

    stopPreview();

    // Join via API
    const joinRes = await telehealthService.joinSession(sid);
    if (joinRes.error || !joinRes.data) {
      setError(joinRes.error || "Failed to join session");
      setPhase("error");
      return;
    }

    const { token, roomUrl } = joinRes.data;

    // If Daily.co is available, create frame
    if (dailyContainerRef.current && roomUrl && !roomUrl.includes("mock")) {
      try {
        const DailyIframe = (await import("@daily-co/daily-js")).default;
        const callFrame = DailyIframe.createFrame(dailyContainerRef.current, {
          iframeStyle: { width: "100%", height: "100%", border: "none", borderRadius: "12px" },
          showLeaveButton: false,
        });
        await callFrame.join({ url: roomUrl, token });
        callFrameRef.current = callFrame;
        setPhase("active");
        startTimer();
      } catch {
        // Daily.co not configured — go to waiting/active with message
        setPhase("active");
        startTimer();
      }
    } else {
      // Mock mode or no container — simulate waiting then active
      setPhase("waiting");
      pollRef.current = setInterval(async () => {
        // In mock mode, auto-transition to active after 3 seconds
        setPhase("active");
        startTimer();
        if (pollRef.current) clearInterval(pollRef.current);
      }, 3000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, consentGiven, sid]);

  function startTimer() {
    setElapsedSeconds(0);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  }

  function formatDuration(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  // ─── End Session ───────────────────────────────────────────────────────────

  const handleEndCall = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (callFrameRef.current) {
      try {
        await callFrameRef.current.leave();
        callFrameRef.current.destroy();
        callFrameRef.current = null;
      } catch {
        // Ignore cleanup errors
      }
    }

    await telehealthService.endSession(sid);
    setPhase("post-session");
  }, [sid]);

  // ─── Toggle Controls ──────────────────────────────────────────────────────

  function toggleCamera() {
    setCameraOn((prev) => {
      if (callFrameRef.current) {
        callFrameRef.current.setLocalVideo(!prev);
      }
      if (mediaStream) {
        mediaStream.getVideoTracks().forEach((t) => { t.enabled = !prev; });
      }
      return !prev;
    });
  }

  function toggleMic() {
    setMicOn((prev) => {
      if (callFrameRef.current) {
        callFrameRef.current.setLocalAudio(!prev);
      }
      if (mediaStream) {
        mediaStream.getAudioTracks().forEach((t) => { t.enabled = !prev; });
      }
      return !prev;
    });
  }

  async function toggleScreenShare() {
    if (!callFrameRef.current) return;
    try {
      if (screenSharing) {
        await callFrameRef.current.stopScreenShare();
      } else {
        await callFrameRef.current.startScreenShare();
      }
      setScreenSharing(!screenSharing);
    } catch {
      // User cancelled screen share picker
    }
  }

  // ─── Render: Loading ───────────────────────────────────────────────────────

  if (phase === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.navy900 }}>
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3" style={{ color: C.teal500 }} />
          <p className="text-sm" style={{ color: C.slate400 }}>Connecting to your session...</p>
        </div>
      </div>
    );
  }

  // ─── Render: Error ─────────────────────────────────────────────────────────

  if (phase === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.navy900 }}>
        <div className="text-center max-w-md mx-auto px-6">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4" style={{ color: C.amber500 }} />
          <h2 className="text-xl font-bold mb-2" style={{ color: C.white }}>Session Error</h2>
          <p className="text-sm mb-6" style={{ color: C.slate400 }}>{error || "Something went wrong"}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ backgroundColor: C.teal500 }}
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ─── Render: External Video ────────────────────────────────────────────────

  if (phase === "external" && session) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.navy900 }}>
        <div className="text-center max-w-md mx-auto px-6">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ backgroundColor: C.navy800 }}
          >
            <ExternalLink className="w-10 h-10" style={{ color: C.teal500 }} />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: C.white }}>External Video Call</h2>
          <p className="text-sm mb-2" style={{ color: C.slate400 }}>
            This appointment uses an external video service.
          </p>
          <p className="text-xs mb-6 px-4" style={{ color: C.slate500 }}>
            You will be redirected to a third-party platform. Please ensure your browser allows pop-ups.
            Your provider has set up this link for your visit.
          </p>
          <a
            href={session.externalVideoUrl || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ backgroundColor: C.teal500 }}
          >
            <Video className="w-4 h-4" /> Join External Video Call
          </a>
          <button
            onClick={() => navigate(-1)}
            className="block w-full mt-4 text-sm font-medium transition-colors"
            style={{ color: C.slate400 }}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ─── Render: Tech Check ────────────────────────────────────────────────────

  if (phase === "tech-check") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.navy900 }}>
        <div className="w-full max-w-lg mx-auto px-6">
          {/* Header */}
          <div className="text-center mb-8">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: C.navy800 }}
            >
              <Camera className="w-7 h-7" style={{ color: C.teal500 }} />
            </div>
            <h2 className="text-xl font-bold mb-1" style={{ color: C.white }}>Device Check</h2>
            <p className="text-sm" style={{ color: C.slate400 }}>
              Test your camera and microphone before joining
            </p>
          </div>

          {/* Video Preview */}
          <div
            className="relative rounded-2xl overflow-hidden mb-6"
            style={{ backgroundColor: C.navy800, aspectRatio: "16/9" }}
          >
            <video
              ref={videoPreviewRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
            {!mediaStream && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-sm" style={{ color: C.slate400 }}>
                  Camera preview unavailable
                </p>
              </div>
            )}
            {/* Preview Controls */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3">
              <button
                onClick={toggleMic}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
                style={{
                  backgroundColor: micOn ? "rgba(255,255,255,0.15)" : C.red500,
                  backdropFilter: "blur(8px)",
                }}
              >
                {micOn ? (
                  <Mic className="w-5 h-5" style={{ color: C.white }} />
                ) : (
                  <MicOff className="w-5 h-5" style={{ color: C.white }} />
                )}
              </button>
              <button
                onClick={toggleCamera}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
                style={{
                  backgroundColor: cameraOn ? "rgba(255,255,255,0.15)" : C.red500,
                  backdropFilter: "blur(8px)",
                }}
              >
                {cameraOn ? (
                  <Video className="w-5 h-5" style={{ color: C.white }} />
                ) : (
                  <VideoOff className="w-5 h-5" style={{ color: C.white }} />
                )}
              </button>
            </div>
          </div>

          {/* Consent */}
          {session?.recordingEnabled && (
            <label className="flex items-start gap-3 mb-4 p-3 rounded-xl cursor-pointer" style={{ backgroundColor: C.navy800 }}>
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
                className="mt-0.5 rounded"
              />
              <div>
                <p className="text-sm font-medium" style={{ color: C.white }}>
                  I consent to recording
                </p>
                <p className="text-xs mt-0.5" style={{ color: C.slate400 }}>
                  This session may be recorded for clinical documentation purposes.
                  All recordings are encrypted and HIPAA-compliant.
                </p>
              </div>
            </label>
          )}

          {/* Telehealth Consent */}
          <label className="flex items-start gap-3 mb-6 p-3 rounded-xl cursor-pointer" style={{ backgroundColor: C.navy800 }}>
            <input
              type="checkbox"
              checked={consentGiven || !session?.recordingEnabled}
              onChange={(e) => setConsentGiven(e.target.checked)}
              className="mt-0.5 rounded"
              disabled={!session?.recordingEnabled}
            />
            <div>
              <p className="text-sm font-medium" style={{ color: C.white }}>
                <Shield className="w-3.5 h-3.5 inline mr-1" style={{ color: C.teal500 }} />
                HIPAA Notice
              </p>
              <p className="text-xs mt-0.5" style={{ color: C.slate400 }}>
                This telehealth session uses end-to-end encryption. By joining, you acknowledge
                that you are in a private location and consent to receive care via telehealth.
              </p>
            </div>
          </label>

          {/* Join Button */}
          <button
            onClick={handleJoin}
            className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 flex items-center justify-center gap-2"
            style={{ backgroundColor: C.teal500 }}
          >
            <Video className="w-4 h-4" /> Join Session
          </button>

          <button
            onClick={() => navigate(-1)}
            className="w-full mt-3 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1"
            style={{ color: C.slate400 }}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        </div>
      </div>
    );
  }

  // ─── Render: Waiting Room ──────────────────────────────────────────────────

  if (phase === "waiting") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.navy900 }}>
        <div className="text-center max-w-md mx-auto px-6">
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div
              className="absolute inset-0 rounded-full animate-ping"
              style={{ backgroundColor: C.teal500, opacity: 0.2 }}
            />
            <div
              className="absolute inset-2 rounded-full animate-pulse"
              style={{ backgroundColor: C.teal500, opacity: 0.3 }}
            />
            <div
              className="absolute inset-4 rounded-full flex items-center justify-center"
              style={{ backgroundColor: C.navy800 }}
            >
              <Video className="w-8 h-8" style={{ color: C.teal500 }} />
            </div>
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: C.white }}>
            Waiting Room
          </h2>
          <p className="text-sm mb-1" style={{ color: C.slate400 }}>
            Your provider will be with you shortly
          </p>
          <p className="text-xs" style={{ color: C.slate500 }}>
            Please keep this window open. You will be connected automatically.
          </p>
          <div className="mt-8 flex items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: C.teal500, animationDelay: "0ms" }} />
            <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: C.teal500, animationDelay: "150ms" }} />
            <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: C.teal500, animationDelay: "300ms" }} />
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: Post-Session ──────────────────────────────────────────────────

  if (phase === "post-session") {
    const durationMin = session?.durationSeconds
      ? Math.round(session.durationSeconds / 60)
      : Math.round(elapsedSeconds / 60);

    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.navy900 }}>
        <div className="text-center max-w-md mx-auto px-6">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ backgroundColor: C.navy800 }}
          >
            <CheckCircle className="w-10 h-10" style={{ color: C.green500 }} />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: C.white }}>Session Complete</h2>
          <p className="text-sm mb-6" style={{ color: C.slate400 }}>
            Your telehealth visit has ended successfully.
          </p>

          <div
            className="rounded-xl p-4 mb-6 text-left space-y-2"
            style={{ backgroundColor: C.navy800 }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: C.slate400 }}>Duration</span>
              <span className="text-sm font-semibold" style={{ color: C.white }}>
                {durationMin > 0 ? `${durationMin} minutes` : `${elapsedSeconds} seconds`}
              </span>
            </div>
            {session?.startedAt && (
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: C.slate400 }}>Started</span>
                <span className="text-sm" style={{ color: C.slate200 }}>
                  {new Date(session.startedAt).toLocaleTimeString()}
                </span>
              </div>
            )}
            {session?.endedAt && (
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: C.slate400 }}>Ended</span>
                <span className="text-sm" style={{ color: C.slate200 }}>
                  {new Date(session.endedAt).toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={() => navigate(-1)}
            className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
            style={{ backgroundColor: C.teal500 }}
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ─── Render: Active Session ────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: C.navy900 }}>
      {/* Top Bar */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ backgroundColor: C.navy800 }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: C.navy700 }}
          >
            <Video className="w-4 h-4" style={{ color: C.teal500 }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: C.white }}>
              Telehealth Session
            </p>
            <p className="text-xs" style={{ color: C.slate400 }}>
              {session?.roomName || "Video Visit"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Status Badge */}
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
            style={{ backgroundColor: C.green50, color: C.green500 }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: C.green500 }} />
            Live
          </span>

          {/* Duration Timer */}
          <div className="flex items-center gap-1.5 text-sm font-mono" style={{ color: C.white }}>
            <Clock className="w-3.5 h-3.5" style={{ color: C.slate400 }} />
            {formatDuration(elapsedSeconds)}
          </div>
        </div>
      </div>

      {/* Video Area */}
      <div className="flex-1 relative min-h-0">
        <div ref={dailyContainerRef} className="absolute inset-0">
          {/* Daily.co iframe mounts here; fallback message if not available */}
          {!callFrameRef.current && (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <Video className="w-16 h-16 mx-auto mb-4" style={{ color: C.navy700 }} />
                <p className="text-sm font-medium" style={{ color: C.slate400 }}>
                  Video service not configured
                </p>
                <p className="text-xs mt-1" style={{ color: C.slate500 }}>
                  Daily.co API key required for live video.
                  Session timer is running.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Controls Bar (glassmorphism) */}
      <div
        className="shrink-0 flex items-center justify-center gap-4 px-6 py-4"
        style={{
          backgroundColor: "rgba(16, 42, 67, 0.85)",
          backdropFilter: "blur(16px)",
          borderTop: `1px solid ${C.navy700}`,
        }}
      >
        <button
          onClick={toggleMic}
          className="w-12 h-12 rounded-full flex items-center justify-center transition-all"
          style={{ backgroundColor: micOn ? C.navy700 : C.red500 }}
          title={micOn ? "Mute" : "Unmute"}
        >
          {micOn ? (
            <Mic className="w-5 h-5" style={{ color: C.white }} />
          ) : (
            <MicOff className="w-5 h-5" style={{ color: C.white }} />
          )}
        </button>

        <button
          onClick={toggleCamera}
          className="w-12 h-12 rounded-full flex items-center justify-center transition-all"
          style={{ backgroundColor: cameraOn ? C.navy700 : C.red500 }}
          title={cameraOn ? "Turn off camera" : "Turn on camera"}
        >
          {cameraOn ? (
            <Video className="w-5 h-5" style={{ color: C.white }} />
          ) : (
            <VideoOff className="w-5 h-5" style={{ color: C.white }} />
          )}
        </button>

        <button
          onClick={toggleScreenShare}
          className="w-12 h-12 rounded-full flex items-center justify-center transition-all"
          style={{ backgroundColor: screenSharing ? C.teal600 : C.navy700 }}
          title="Screen Share"
        >
          <Monitor className="w-5 h-5" style={{ color: C.white }} />
        </button>

        <button
          onClick={handleEndCall}
          className="w-14 h-12 rounded-full flex items-center justify-center transition-all hover:opacity-90"
          style={{ backgroundColor: C.red500 }}
          title="End Call"
        >
          <PhoneOff className="w-5 h-5" style={{ color: C.white }} />
        </button>
      </div>
    </div>
  );
}
