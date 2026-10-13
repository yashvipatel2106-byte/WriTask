const EVENTS = require("./events");
const { registerMeetingHandlers } = require("./meetingHandler");

const registerSocketHandlers = (io) => {
  io.on("connection", (socket) => {
    console.log("User Connected:", socket.id);

    socket.on(EVENTS.PROJECT_JOIN, (projectId) => {
      socket.join(projectId);
      console.log(`${socket.id} joined ${projectId}`);
    });

    socket.on(EVENTS.PROJECT_LEAVE, (projectId) => {
      socket.leave(projectId);
      console.log(`${socket.id} left ${projectId}`);
    });

    registerMeetingHandlers(io, socket);

    socket.on("disconnect", () => {
      console.log("Disconnected :", socket.id);
    });
  });
};

module.exports = registerSocketHandlers;
