"use client";

import { X, Crown } from "lucide-react";
import { avatarColor, avatarInitials } from "@/lib/avatarColor";
import type { MeetingPeer } from "@/lib/meeting/constants";
import type { UserSnap } from "@/lib/validation/calendarApi";

type Props = {
  open: boolean;
  onClose: () => void;
  hostId?: string;
  assignees: UserSnap[];
  peers: MeetingPeer[];
  localUser: { userId: string; username: string };
  localHandRaised?: boolean;
  localAudio?: boolean;
  localVideo?: boolean;
};

export default function ParticipantsPanel({
  open,
  onClose,
  hostId,
  assignees,
  peers,
  localUser,
  localHandRaised,
  localAudio = true,
  localVideo = true,
}: Props) {
  if (!open) return null;

  const inRoomIds = new Set([
    localUser.userId,
    ...peers.map((p) => p.userId).filter(Boolean),
  ]);

  const peerByUserId = new Map(
    peers.filter((p) => p.userId).map((p) => [p.userId, p])
  );

  // Invited list (assignees + host) with presence
  const invitedMap = new Map<string, UserSnap>();
  for (const a of assignees || []) invitedMap.set(a._id, a);

  const rows: Array<{
    userId: string;
    username: string;
    isHost: boolean;
    inRoom: boolean;
    handRaised?: boolean;
    audioEnabled?: boolean;
    videoEnabled?: boolean;
    isYou?: boolean;
  }> = [];

  // Always show local user first
  rows.push({
    userId: localUser.userId,
    username: localUser.username,
    isHost: hostId === localUser.userId,
    inRoom: true,
    handRaised: localHandRaised,
    audioEnabled: localAudio,
    videoEnabled: localVideo,
    isYou: true,
  });

  // Other live peers
  for (const p of peers) {
    if (!p.userId || p.userId === localUser.userId) continue;
    rows.push({
      userId: p.userId,
      username: p.username,
      isHost: hostId === p.userId,
      inRoom: true,
      handRaised: p.handRaised,
      audioEnabled: p.audioEnabled !== false,
      videoEnabled: p.videoEnabled !== false,
    });
  }

  // Invited but not in room yet
  for (const [id, user] of invitedMap) {
    if (inRoomIds.has(id)) continue;
    rows.push({
      userId: id,
      username: user.username,
      isHost: hostId === id,
      inRoom: false,
      audioEnabled: false,
      videoEnabled: false,
    });
  }

  // Host if missing from assignees and not already listed
  if (hostId && !rows.some((r) => r.userId === hostId)) {
    const hostPeer = peerByUserId.get(hostId);
    rows.splice(hostId === localUser.userId ? 0 : 1, 0, {
      userId: hostId,
      username: hostPeer?.username || "Host",
      isHost: true,
      inRoom: !!hostPeer || hostId === localUser.userId,
      handRaised: hostPeer?.handRaised,
      audioEnabled: hostPeer?.audioEnabled,
      videoEnabled: hostPeer?.videoEnabled,
      isYou: hostId === localUser.userId,
    });
  }

  const inRoomCount = rows.filter((r) => r.inRoom).length;

  return (
    <aside
      className="flex h-full w-full max-w-sm flex-col"
      style={{ background: "#0F172A", color: "#F1F5F9" }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid #1E293B" }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: "#F8FAFC" }}>
            Participants
          </p>
          <p className="text-[11px]" style={{ color: "#94A3B8" }}>
            {inRoomCount} in room · {rows.length} invited
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5"
          style={{ color: "#94A3B8" }}
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {rows.map((r) => (
          <div
            key={r.userId}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5"
            style={{ background: "transparent" }}
          >
            <div className="relative">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white ${avatarColor(r.userId)}`}
              >
                {avatarInitials(r.username)}
              </div>
              <span
                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full"
                style={{
                  background: r.inRoom ? "#34D399" : "#64748B",
                  boxShadow: "0 0 0 2px #0F172A",
                }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-medium" style={{ color: "#F8FAFC" }}>
                  {r.username}
                  {r.isYou ? " (You)" : ""}
                </p>
                {r.isHost && (
                  <span
                    className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{ background: "rgba(251,191,36,0.15)", color: "#FCD34D" }}
                  >
                    <Crown size={10} /> Host
                  </span>
                )}
              </div>
              <p className="text-[11px]" style={{ color: "#94A3B8" }}>
                {r.inRoom ? (
                  <>
                    In meeting
                    {r.handRaised ? " · Hand raised" : ""}
                    {!r.audioEnabled ? " · Muted" : ""}
                    {!r.videoEnabled ? " · Cam off" : ""}
                  </>
                ) : (
                  "Invited · Not joined"
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
