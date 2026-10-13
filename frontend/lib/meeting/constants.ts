export const MEETING_EVENTS = {
  JOIN: "meeting:join",
  LEAVE: "meeting:leave",
  PEERS: "meeting:peers",
  PEER_JOINED: "meeting:peer-joined",
  PEER_LEFT: "meeting:peer-left",
  OFFER: "meeting:offer",
  ANSWER: "meeting:answer",
  ICE: "meeting:ice-candidate",
  CHAT: "meeting:chat",
  HAND: "meeting:hand-raise",
  MEDIA: "meeting:media-state",
  ENDED: "meeting:ended",
  ERROR: "meeting:error",
} as const;

export type MeetingPeer = {
  socketId: string;
  userId: string;
  username: string;
  handRaised?: boolean;
  audioEnabled?: boolean;
  videoEnabled?: boolean;
  stream?: MediaStream | null;
  isLocal?: boolean;
};

export type ChatMessage = {
  id: string;
  text: string;
  mentions: string[];
  createdAt: string;
  from: {
    socketId: string;
    userId: string;
    username: string;
  };
};

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];
