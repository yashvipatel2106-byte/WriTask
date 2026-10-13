import { io } from "socket.io-client";
import { getServerOrigin } from "@/lib/validation/api";

export const socket = io(getServerOrigin(), {
  autoConnect: false,
  transports: ["websocket", "polling"],
});
