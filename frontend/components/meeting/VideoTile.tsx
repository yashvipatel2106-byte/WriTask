"use client";

import { useEffect, useRef } from "react";
import { Hand, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { avatarColor, avatarInitials } from "@/lib/avatarColor";

type Props = {
  stream?: MediaStream | null;
  username: string;
  userId?: string;
  muted?: boolean;
  videoOff?: boolean;
  handRaised?: boolean;
  isLocal?: boolean;
  mirror?: boolean;
};

export default function VideoTile({
  stream,
  username,
  userId = "",
  muted,
  videoOff,
  handRaised,
  isLocal,
  mirror,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    // Local preview must be muted or autoplay is blocked by the browser
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");

    if (!isLocal) {
      // Remote: mute only when that peer muted their mic (we still show video)
      el.muted = !!muted;
    }

    const attach = async () => {
      try {
        if (stream) {
          if (el.srcObject !== stream) {
            el.srcObject = stream;
          }
          await el.play();
        } else {
          el.srcObject = null;
        }
      } catch (err) {
        // Autoplay can fail once; retry muted
        try {
          el.muted = true;
          await el.play();
        } catch {
          console.warn("Video play failed", err);
        }
      }
    };

    void attach();

    return () => {
      // Do not stop tracks here — only detach from this element
      if (el.srcObject === stream) {
        el.srcObject = null;
      }
    };
  }, [stream, isLocal, muted]);

  const hasLiveVideo =
    !!stream &&
    stream.getVideoTracks().some((t) => t.readyState === "live" && t.enabled);

  const showVideo = !videoOff && hasLiveVideo;

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl"
      style={{
        background: "#020617",
        border: "1px solid #1E293B",
        aspectRatio: "16 / 9",
        minHeight: 220,
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal ? true : !!muted}
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          opacity: showVideo ? 1 : 0,
          transform: mirror ? "scaleX(-1)" : undefined,
          zIndex: 1,
          background: "#000",
        }}
      />

      {!showVideo && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2"
          style={{
            background: "linear-gradient(135deg, #1E293B 0%, #020617 100%)",
            zIndex: 2,
          }}
        >
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-white ${avatarColor(userId || username)}`}
          >
            {avatarInitials(username)}
          </div>
          <p className="text-xs" style={{ color: "#94A3B8" }}>
            {videoOff
              ? "Camera off"
              : stream
                ? "Starting camera…"
                : "No camera"}
          </p>
        </div>
      )}

      <div
        className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-3 py-2"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.75), transparent)",
          zIndex: 3,
        }}
      >
        <p className="truncate text-xs font-medium text-white">
          {username}
          {isLocal ? " (You)" : ""}
        </p>
        <div className="flex items-center gap-1.5">
          {handRaised && (
            <span
              className="rounded-full p-1"
              style={{ background: "#FBBF24", color: "#422006" }}
            >
              <Hand size={12} />
            </span>
          )}
          <span
            className="rounded-full p-1 text-white"
            style={{ background: muted ? "#DC2626" : "rgba(0,0,0,0.5)" }}
          >
            {muted ? <MicOff size={12} /> : <Mic size={12} />}
          </span>
          <span
            className="rounded-full p-1 text-white"
            style={{ background: videoOff ? "#DC2626" : "rgba(0,0,0,0.5)" }}
          >
            {videoOff ? <VideoOff size={12} /> : <Video size={12} />}
          </span>
        </div>
      </div>
    </div>
  );
}
