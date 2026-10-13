"use client";

import {
  Hand,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Users,
  Video,
  VideoOff,
} from "lucide-react";

type Props = {
  audioEnabled: boolean;
  videoEnabled: boolean;
  handRaised: boolean;
  screenSharing: boolean;
  chatOpen: boolean;
  participantsOpen: boolean;
  unreadChat: number;
  participantCount: number;
  isHost: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleHand: () => void;
  onToggleScreen: () => void;
  onToggleChat: () => void;
  onToggleParticipants: () => void;
  onLeave: () => void;
  onEnd?: () => void;
};

function ControlButton({
  active,
  danger,
  warn,
  label,
  onClick,
  children,
  badge,
}: {
  active?: boolean;
  danger?: boolean;
  warn?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  badge?: number;
}) {
  let background = "#334155";
  let color = "#F8FAFC";
  if (danger || warn) {
    background = "#DC2626";
    color = "#FFFFFF";
  } else if (active) {
    background = "#F8FAFC";
    color = "#0F172A";
  }

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition hover:brightness-110"
      style={{ background, color }}
    >
      {children}
      {!!badge && badge > 0 && (
        <span
          className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold"
          style={{ background: "#EF4444", color: "#FFFFFF" }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

export default function MeetingControls({
  audioEnabled,
  videoEnabled,
  handRaised,
  screenSharing,
  chatOpen,
  participantsOpen,
  unreadChat,
  participantCount,
  isHost,
  onToggleAudio,
  onToggleVideo,
  onToggleHand,
  onToggleScreen,
  onToggleChat,
  onToggleParticipants,
  onLeave,
  onEnd,
}: Props) {
  return (
    <div
      className="flex flex-nowrap items-center justify-center gap-2 rounded-full px-3 py-2 shadow-2xl sm:gap-3 sm:px-4 sm:py-2.5"
      style={{
        background: "rgba(17, 24, 39, 0.95)",
        border: "1px solid #334155",
        backdropFilter: "blur(8px)",
      }}
    >
      <ControlButton
        label={audioEnabled ? "Mute" : "Unmute"}
        warn={!audioEnabled}
        onClick={onToggleAudio}
      >
        {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
      </ControlButton>

      <ControlButton
        label={videoEnabled ? "Turn camera off" : "Turn camera on"}
        warn={!videoEnabled}
        onClick={onToggleVideo}
      >
        {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
      </ControlButton>

      <ControlButton
        label={handRaised ? "Lower hand" : "Raise hand"}
        active={handRaised}
        onClick={onToggleHand}
      >
        <Hand size={18} />
      </ControlButton>

      <ControlButton
        label={screenSharing ? "Stop sharing" : "Share screen"}
        active={screenSharing}
        onClick={onToggleScreen}
      >
        <MonitorUp size={18} />
      </ControlButton>

      <ControlButton
        label="Participants"
        active={participantsOpen}
        badge={participantCount}
        onClick={onToggleParticipants}
      >
        <Users size={18} />
      </ControlButton>

      <ControlButton
        label="Chat"
        active={chatOpen}
        badge={unreadChat}
        onClick={onToggleChat}
      >
        <MessageSquare size={18} />
      </ControlButton>

      <ControlButton label="Leave" danger onClick={onLeave}>
        <LogOut size={18} />
      </ControlButton>

      {isHost && onEnd && (
        <ControlButton label="End meeting for all" danger onClick={onEnd}>
          <PhoneOff size={18} />
        </ControlButton>
      )}
    </div>
  );
}
