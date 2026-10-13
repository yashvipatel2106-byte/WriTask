const { Server } = require("socket.io");
const registerSocketHandlers = require("./socketHandler");

let io;

const initializeSocket = (server) => {
  // Reflect request origin so local + Dev Tunnel frontends both work
  io = new Server(server, {
    cors: {
      origin: true,
      methods: ["GET", "POST", "PUT", "DELETE"],
      credentials: true,
    },
  });

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
