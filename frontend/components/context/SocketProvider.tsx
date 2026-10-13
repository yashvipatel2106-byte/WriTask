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

    /*
     * Connect only once a token exists, and pass it so the backend's
     * socket auth middleware can identify the user (needed for
     * presence — see backend/socket/socket.js). Re-checked whenever
     * the app signals the user changed (login/logout/profile update)
     * so a login (full page load, token already present) and a
     * logout (SPA navigation, socket stays mounted) both keep the
     * connection's identity in sync without a page refresh.
     */
    const syncConnection = () => {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("token")
          : null;

      if (token) {
        socket.auth = { token };
        if (!socket.connected) socket.connect();
      } else if (socket.connected) {
        socket.disconnect();
      }
    };

    syncConnection();

    socket.on("connect", () => {
      console.log("Socket Connected:", socket.id);
    });

    socket.on("disconnect", () => {
      console.log("Socket Disconnected");
    });

    window.addEventListener("user-updated", syncConnection);
    window.addEventListener("auth-changed", syncConnection);

    return () => {
      window.removeEventListener("user-updated", syncConnection);
      window.removeEventListener("auth-changed", syncConnection);
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