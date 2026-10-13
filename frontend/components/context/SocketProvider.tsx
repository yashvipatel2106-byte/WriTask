"use client";

import {
  createContext,
  useContext,
  useEffect,
} from "react";

import { socket } from "@/services/socket/socket";

const SocketContext = createContext(socket);

export function SocketProvider({
  children,
}: {
  children: React.ReactNode;
}) {

  useEffect(() => {

    socket.connect();

    socket.on("connect", () => {
      console.log("Socket Connected:", socket.id);
    });

    socket.on("disconnect", () => {
      console.log("Socket Disconnected");
    });

    return () => {
      socket.disconnect();
    };

  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);