"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Users, Link2, Check } from "lucide-react";
import { useSocket } from "@/components/context/SocketProvider";
import { useMeetingWebRTC } from "@/hooks/useMeetingWebRTC";
import {
  endMeeting,
  fetchMeetingByRoomId,
  startMeeting,
  type MeetingRoomInfo,
} from "@/lib/validation/calendarApi";
import { confirmDialog } from "@/components/ui/confirm";
import VideoTile from "@/components/meeting/VideoTile";
import MeetingChat from "@/components/meeting/MeetingChat";
import MeetingControls from "@/components/meeting/MeetingControls";
import ParticipantsPanel from "@/components/meeting/ParticipantsPanel";
import { toast } from "../ui/toast";

type Props = {
  roomId: string;
  orgId: string;
};

export default function MeetingRoom({ roomId, orgId }: Props) {
  const socket = useSocket();
  const router = useRouter();
  const [info, setInfo] = useState<MeetingRoomInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const [ending, setEnding] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const prevMsgCount = useRef(0);

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  }, []);

  const userId = String(
    user.id || user._id || localStorage.getItem("userId") || ""
  );
  const username = String(user.username || user.name || "Guest");

  const showToast = useCallback(
    (msg: string, variant: "success" | "error" | "info" | "warning" = "info") => {
      toast.show(msg, variant);
    },
    []
  );

  useEffect(() => {
    if (!socket.connected) socket.connect();
  }, [socket]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        let data = await fetchMeetingByRoomId(orgId, roomId);
        if (cancelled) return;

        if (data.isHost && data.status === "scheduled") {
          try {
            await startMeeting(orgId, data.eventId);
            data = await fetchMeetingByRoomId(orgId, roomId);
          } catch {
            // host can still enter; assignees stay blocked until live
          }
        }

        if (cancelled) return;
        setInfo(data);
        if (data.status !== "live" && !data.isHost) {
          setLoadError("Meeting has not started yet. Wait for the host.");
        }
      } catch (err: any) {
        if (!cancelled) setLoadError(err.message || "Unable to load meeting");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, roomId]);

  const meetingReady = !!info && !loadError && !!userId;
  const leaveRef = useRef<() => void>(() => {});

  const handleMeetingEnded = useCallback(() => {
    // Ensure camera/mic are released when host ends (or we receive ended)
    leaveRef.current();
    showToast("Host ended the meeting", "info");
    setTimeout(() => router.push("/calendar"), 800);
  }, [router, showToast]);

  const {
    peers,
    localStream,
    messages,
    audioEnabled,
    videoEnabled,
    handRaised,
    screenSharing,
    joining,
    mediaError,
    toggleAudio,
    toggleVideo,
    toggleHand,
    toggleScreenShare,
    sendChat,
    leave,
    notifyEnded,
    stopAllMedia,
  } = useMeetingWebRTC({
    socket,
    roomId,
    userId,
    username,
    enabled: meetingReady,
    onMeetingEnded: handleMeetingEnded,
    onError: (msg: string) => showToast(msg, "error"),
  });

  leaveRef.current = () => {
    stopAllMedia();
  };

  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      const added = messages.length - prevMsgCount.current;
      if (!chatOpen) setUnreadChat((n) => n + added);
    }
    prevMsgCount.current = messages.length;
  }, [messages, chatOpen]);

  useEffect(() => {
    if (chatOpen) setUnreadChat(0);
  }, [chatOpen]);

  // Hard guarantee: stop camera if this page unmounts for any reason
  useEffect(() => {
    return () => {
      stopAllMedia();
    };
  }, [stopAllMedia]);

  const leaveMeeting = () => {
    leave();
    router.push("/calendar");
  };

  const endForAll = async () => {
    if (!info?.isHost || ending) return;
    const ok = await confirmDialog({
      title: "End meeting?",
      description:
        "End meeting for everyone? All participants will be disconnected.",
      confirmLabel: "End meeting",
      cancelLabel: "Cancel",
      variant: "danger",
    });
    if (!ok) return;
    try {
      setEnding(true);
      await endMeeting(orgId, info.eventId);
      notifyEnded(); // also stops camera
      stopAllMedia();
      router.push("/calendar");
    } catch (err: any) {
      showToast(err.message || "Failed to end meeting", "error");
      setEnding(false);
    }
  };

  const openParticipants = () => {
    setParticipantsOpen(true);
    setChatOpen(false);
  };

  const openChat = () => {
    setChatOpen(true);
    setParticipantsOpen(false);
  };

  // Full-viewport shell with explicit hex colors (app light theme tokens
  // would otherwise paint a blank white page over translucent slate utilities)
  const shellStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 80,
    display: "flex",
    flexDirection: "column",
    background: "#0B1120",
    color: "#F1F5F9",
  };

  // Show the room as soon as meeting info is ready; camera joins in the background
  if (loading) {
    return (
      <div style={shellStyle} className="items-center justify-center">
        <div className="flex items-center gap-3 text-sm" style={{ color: "#94A3B8" }}>
          <Loader2 className="animate-spin" size={18} />
          Loading meeting…
        </div>
      </div>
    );
  }

  if (loadError || !info) {
    return (
      <div
        style={shellStyle}
        className="items-center justify-center gap-4 px-6 text-center"
      >
        <p className="max-w-md text-sm" style={{ color: "#CBD5E1" }}>
          {loadError || "Meeting not found"}
        </p>
        {!userId && (
          <p className="text-xs" style={{ color: "#F87171" }}>
            Session user missing — please log in again.
          </p>
        )}
        <button
          type="button"
          onClick={() => router.push("/calendar")}
          className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
          style={{ background: "#0891B2" }}
        >
          Back to calendar
        </button>
      </div>
    );
  }

  const meetingShareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/meeting/${roomId}`
      : info?.meetingLink || `/meeting/${roomId}`;

  const copyMeetingLink = async () => {
    try {
      await navigator.clipboard.writeText(meetingShareUrl);
      setCopiedLink(true);
      showToast("Meeting link copied — share it so others can join", "success");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      showToast("Could not copy link", "error");
    }
  };

  const hostId =
    typeof info.createdBy === "string"
      ? info.createdBy
      : info.createdBy?._id;

  const gridCount = peers.length + 1;
  const gridClass =
    gridCount <= 1
      ? "grid-cols-1 max-w-3xl mx-auto"
      : gridCount === 2
        ? "grid-cols-1 md:grid-cols-2"
        : gridCount <= 4
          ? "grid-cols-1 sm:grid-cols-2"
          : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3";

  return (
    <div style={shellStyle}>
      <header
        className="flex shrink-0 items-center justify-between gap-3 px-4 py-3"
        style={{ borderBottom: "1px solid #1E293B", background: "#111827" }}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" style={{ color: "#F8FAFC" }}>
            {info.title}
          </p>
          <p className="text-[11px]" style={{ color: "#94A3B8" }}>
            Room · {roomId.slice(0, 8)}… ·{" "}
            <span style={{ color: "#34D399" }}>Live</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={copyMeetingLink}
            className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
            style={{ background: "#0E7490", color: "#ECFEFF" }}
            title={meetingShareUrl}
          >
            {copiedLink ? <Check size={14} /> : <Link2 size={14} />}
            {copiedLink ? "Copied" : "Copy link"}
          </button>
          <button
            type="button"
            onClick={openParticipants}
            className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
            style={{ background: "#1E293B", color: "#CBD5E1" }}
          >
            <Users size={14} />
            {peers.length + 1} people
          </button>
        </div>
      </header>

      {(mediaError || joining) && (
        <div
          className="shrink-0 px-4 py-2 text-center text-xs"
          style={{
            background: mediaError
              ? "rgba(245,158,11,0.15)"
              : "rgba(8,145,178,0.15)",
            color: mediaError ? "#FDE68A" : "#A5F3FC",
          }}
        >
          {mediaError || "Starting camera… allow access if the browser asks."}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-4 pb-32">
            <div className={`grid gap-3 ${gridClass}`}>
              <VideoTile
                stream={localStream}
                username={username}
                userId={userId}
                muted={!audioEnabled}
                videoOff={!videoEnabled}
                handRaised={handRaised}
                isLocal
                mirror={!screenSharing}
              />
              {peers.map((p) => (
                <VideoTile
                  key={p.socketId}
                  stream={p.stream}
                  username={p.username}
                  userId={p.userId}
                  muted={p.audioEnabled === false}
                  videoOff={p.videoEnabled === false}
                  handRaised={!!p.handRaised}
                />
              ))}
            </div>
          </div>
        </div>

        {chatOpen && (
          <div
            className="hidden h-full w-full max-w-sm shrink-0 sm:flex"
            style={{ borderLeft: "1px solid #1E293B" }}
          >
            <MeetingChat
              open={chatOpen}
              onClose={() => setChatOpen(false)}
              messages={messages}
              peers={peers}
              localUser={{ userId, username }}
              onSend={sendChat}
            />
          </div>
        )}

        {chatOpen && (
          <div
            className="fixed inset-0 z-90 flex sm:hidden"
            style={{ background: "rgba(0,0,0,0.55)" }}
          >
            <button
              type="button"
              className="flex-1"
              aria-label="Close chat"
              onClick={() => setChatOpen(false)}
            />
            <div className="flex h-full w-[85%] max-w-sm">
              <MeetingChat
                open={chatOpen}
                onClose={() => setChatOpen(false)}
                messages={messages}
                peers={peers}
                localUser={{ userId, username }}
                onSend={sendChat}
              />
            </div>
          </div>
        )}

        {participantsOpen && (
          <div
            className="hidden h-full w-full max-w-sm shrink-0 sm:flex"
            style={{ borderLeft: "1px solid #1E293B" }}
          >
            <ParticipantsPanel
              open={participantsOpen}
              onClose={() => setParticipantsOpen(false)}
              hostId={hostId}
              assignees={info.assignees || []}
              peers={peers}
              localUser={{ userId, username }}
              localHandRaised={handRaised}
              localAudio={audioEnabled}
              localVideo={videoEnabled}
            />
          </div>
        )}

        {participantsOpen && (
          <div
            className="fixed inset-0 z-90 flex sm:hidden"
            style={{ background: "rgba(0,0,0,0.55)" }}
          >
            <button
              type="button"
              className="flex-1"
              aria-label="Close participants"
              onClick={() => setParticipantsOpen(false)}
            />
            <div className="flex h-full w-[85%] max-w-sm">
              <ParticipantsPanel
                open={participantsOpen}
                onClose={() => setParticipantsOpen(false)}
                hostId={hostId}
                assignees={info.assignees || []}
                peers={peers}
                localUser={{ userId, username }}
                localHandRaised={handRaised}
                localAudio={audioEnabled}
                localVideo={videoEnabled}
              />
            </div>
          </div>
        )}
      </div>

      {/* Center-bottom controls — fixed to viewport so they stay centered */}
      <div
        className="pointer-events-none"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 20,
          zIndex: 100,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "0 16px",
        }}
      >
        <div className="pointer-events-auto">
          <MeetingControls
            audioEnabled={audioEnabled}
            videoEnabled={videoEnabled}
            handRaised={handRaised}
            screenSharing={screenSharing}
            chatOpen={chatOpen}
            participantsOpen={participantsOpen}
            unreadChat={unreadChat}
            participantCount={peers.length + 1}
            isHost={info.isHost}
            onToggleAudio={toggleAudio}
            onToggleVideo={toggleVideo}
            onToggleHand={toggleHand}
            onToggleScreen={toggleScreenShare}
            onToggleChat={() => (chatOpen ? setChatOpen(false) : openChat())}
            onToggleParticipants={() =>
              participantsOpen
                ? setParticipantsOpen(false)
                : openParticipants()
            }
            onLeave={leaveMeeting}
            onEnd={info.isHost ? endForAll : undefined}
          />
        </div>
      </div>
    </div>
  );
}
