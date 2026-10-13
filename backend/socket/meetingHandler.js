const EVENTS = require("./events");

/** roomId → Map<socketId, peerInfo> */
const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  return rooms.get(roomId);
}

function peerSnapshot(peer) {
  return {
    socketId: peer.socketId,
    userId: peer.userId,
    username: peer.username,
    handRaised: !!peer.handRaised,
    audioEnabled: peer.audioEnabled !== false,
    videoEnabled: peer.videoEnabled !== false,
  };
}

function leaveMeeting(socket, io) {
  const { meetingRoomId } = socket.data || {};
  if (!meetingRoomId) return;

  const room = rooms.get(meetingRoomId);
  if (!room) return;

  const peer = room.get(socket.id);
  room.delete(socket.id);
  socket.leave(`meeting:${meetingRoomId}`);

  if (peer) {
    io.to(`meeting:${meetingRoomId}`).emit(EVENTS.MEETING_PEER_LEFT, {
      socketId: socket.id,
      userId: peer.userId,
      username: peer.username,
    });
  }

  if (room.size === 0) rooms.delete(meetingRoomId);
  socket.data.meetingRoomId = null;
}

function registerMeetingHandlers(io, socket) {
  socket.on(EVENTS.MEETING_JOIN, (payload = {}) => {
    try {
      const {
        roomId,
        userId,
        username,
        audioEnabled = true,
        videoEnabled = true,
      } = payload;

      if (!roomId || !userId || !username) {
        socket.emit(EVENTS.MEETING_ERROR, {
          message: "Missing room or user details",
        });
        return;
      }

      // Leave any previous meeting room first
      leaveMeeting(socket, io);

      const room = getRoom(roomId);
      const existing = [...room.values()].map(peerSnapshot);

      const peer = {
        socketId: socket.id,
        userId: String(userId),
        username: String(username),
        handRaised: false,
        audioEnabled: !!audioEnabled,
        videoEnabled: !!videoEnabled,
      };

      room.set(socket.id, peer);
      socket.data.meetingRoomId = roomId;
      socket.join(`meeting:${roomId}`);

      socket.emit(EVENTS.MEETING_PEERS, { peers: existing });
      socket.to(`meeting:${roomId}`).emit(EVENTS.MEETING_PEER_JOINED, peerSnapshot(peer));
    } catch (err) {
      socket.emit(EVENTS.MEETING_ERROR, {
        message: err.message || "Failed to join meeting",
      });
    }
  });

  socket.on(EVENTS.MEETING_LEAVE, () => {
    leaveMeeting(socket, io);
  });

  socket.on(EVENTS.MEETING_OFFER, ({ to, sdp }) => {
    if (!to || !sdp) return;
    io.to(to).emit(EVENTS.MEETING_OFFER, {
      from: socket.id,
      sdp,
      userId: rooms.get(socket.data.meetingRoomId)?.get(socket.id)?.userId,
      username: rooms.get(socket.data.meetingRoomId)?.get(socket.id)?.username,
    });
  });

  socket.on(EVENTS.MEETING_ANSWER, ({ to, sdp }) => {
    if (!to || !sdp) return;
    io.to(to).emit(EVENTS.MEETING_ANSWER, {
      from: socket.id,
      sdp,
    });
  });

  socket.on(EVENTS.MEETING_ICE, ({ to, candidate }) => {
    if (!to || !candidate) return;
    io.to(to).emit(EVENTS.MEETING_ICE, {
      from: socket.id,
      candidate,
    });
  });

  socket.on(EVENTS.MEETING_CHAT, (payload = {}) => {
    const roomId = socket.data.meetingRoomId;
    if (!roomId) return;

    const peer = rooms.get(roomId)?.get(socket.id);
    if (!peer) return;

    const text = String(payload.text || "").trim().slice(0, 2000);
    if (!text) return;

    const mentions = Array.isArray(payload.mentions)
      ? payload.mentions.map(String)
      : [];

    const message = {
      id: `${Date.now()}-${socket.id}`,
      text,
      mentions,
      createdAt: new Date().toISOString(),
      from: {
        socketId: socket.id,
        userId: peer.userId,
        username: peer.username,
      },
    };

    io.to(`meeting:${roomId}`).emit(EVENTS.MEETING_CHAT, message);
  });

  socket.on(EVENTS.MEETING_HAND, ({ raised } = {}) => {
    const roomId = socket.data.meetingRoomId;
    if (!roomId) return;
    const peer = rooms.get(roomId)?.get(socket.id);
    if (!peer) return;

    peer.handRaised = !!raised;
    io.to(`meeting:${roomId}`).emit(EVENTS.MEETING_HAND, {
      socketId: socket.id,
      userId: peer.userId,
      username: peer.username,
      raised: peer.handRaised,
    });
  });

  socket.on(EVENTS.MEETING_MEDIA, ({ audioEnabled, videoEnabled } = {}) => {
    const roomId = socket.data.meetingRoomId;
    if (!roomId) return;
    const peer = rooms.get(roomId)?.get(socket.id);
    if (!peer) return;

    if (typeof audioEnabled === "boolean") peer.audioEnabled = audioEnabled;
    if (typeof videoEnabled === "boolean") peer.videoEnabled = videoEnabled;

    io.to(`meeting:${roomId}`).emit(EVENTS.MEETING_MEDIA, {
      socketId: socket.id,
      userId: peer.userId,
      audioEnabled: peer.audioEnabled,
      videoEnabled: peer.videoEnabled,
    });
  });

  socket.on(EVENTS.MEETING_ENDED, () => {
    const roomId = socket.data.meetingRoomId;
    if (!roomId) return;

    io.to(`meeting:${roomId}`).emit(EVENTS.MEETING_ENDED, { roomId });

    const room = rooms.get(roomId);
    if (room) {
      for (const sid of room.keys()) {
        const s = io.sockets.sockets.get(sid);
        if (s) {
          s.leave(`meeting:${roomId}`);
          s.data.meetingRoomId = null;
        }
      }
      rooms.delete(roomId);
    }
  });

  socket.on("disconnect", () => {
    leaveMeeting(socket, io);
  });
}

module.exports = { registerMeetingHandlers };
