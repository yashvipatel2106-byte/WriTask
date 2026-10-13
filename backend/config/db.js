const dns = require("node:dns");
const mongoose = require("mongoose");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const connectDB = async () => {
  await mongoose.connect(process.env.MONGO_URI);
};

module.exports = connectDB;