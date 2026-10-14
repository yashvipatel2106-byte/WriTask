const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const registerSocketHandlers = require("./socketHandler");

let io;

/*
 * Soft JWT auth: reuses the exact same verify logic as
 * middleware/authMiddleware.js (same secret, same token shape) so the
 * server never trusts a client-supplied userId for presence.
 *
 * Deliberately non-fatal — sockets that connect without a valid token
 * (e.g. any pre-existing flow that never sent one) still connect, just
 * with `socket.data.userId` left unset, so nothing that worked before
 * this feature was added breaks. Presence-specific handlers simply
 * no-op for such sockets.
 */
const attachSocketAuth = (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "");

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.data.userId = decoded.id;
    }
  } catch (error) {
    // Invalid/expired token — treat as unauthenticated rather than
    // rejecting the connection outright.
    socket.data.userId = null;
  }

  next();
};

const initializeSocket = (server) => {
  // CORS_ORIGINS allow-list; reflects the request origin when unset
  // so local + Dev Tunnel frontends keep working.
  io = new Server(server, {
    cors: {
      origin: require("../config/corsOrigins").corsOriginOption(),
      methods: ["GET", "POST", "PUT", "DELETE"],
      credentials: true,
    },
  });

  io.use(attachSocketAuth);

  registerSocketHandlers(io);

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket not initialized");
  }
  return io;
};

module.exports = {
  initializeSocket,
  getIO,
};
