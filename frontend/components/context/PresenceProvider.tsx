"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { useSocket } from "@/components/context/SocketProvider";
import { EVENTS } from "@/services/socket/events";
import {
  fetchMyStatus,
  fetchPresenceBulk,
  resetStatus as apiResetStatus,
  setManualStatus as apiSetManualStatus,
  setStatusVisibility as apiSetStatusVisibility,
  type DurationKey,
  type EffectiveStatus,
  type ManualStatus,
} from "@/lib/presence";

// Must stay comfortably under the backend's 5-minute inactivity
// timeout (PRESENCE_INACTIVITY_TIMEOUT_MS) so a still-active user's
// heartbeat always lands before the server would consider them idle.
const HEARTBEAT_INTERVAL_MS = 30 * 1000;
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
const ACTIVITY_EVENTS = [
  "mousemove",
  "keydown",
  "mousedown",
  "scroll",
  "touchstart",
] as const;

type PresenceContextValue = {
  /** Effective status for a user, or null if not loaded yet. */
  getStatus: (userId?: string | null) => ManualStatus | null;
  /** My own full status record (statusMode/manualStatus/expiry), for the status menu. */
  myStatus: EffectiveStatus | null;
  /** Requests presence for these userIds be fetched/tracked, if not already known. */
  ensureTracked: (userIds: (string | null | undefined)[]) => void;
  setStatus: (
    manualStatus: ManualStatus,
    duration?: DurationKey | "none",
    expiresAt?: string
  ) => Promise<void>;
  resetStatus: () => Promise<void>;
  /** Shows/hides the status badge from everyone (including yourself) at all. */
  setVisibility: (visible: boolean) => Promise<void>;
};

const PresenceContext = createContext<PresenceContextValue>({
  getStatus: () => null,
  myStatus: null,
  ensureTracked: () => {},
  setStatus: async () => {},
  resetStatus: async () => {},
  setVisibility: async () => {},
});

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const socket = useSocket();

  const [statusMap, setStatusMap] = useState<
    Record<string, ManualStatus | null>
  >({});
  const [myStatus, setMyStatus] = useState<EffectiveStatus | null>(null);

  const knownIds = useRef<Set<string>>(new Set());
  // Populated on mount (see effect below) — 0 just means "not started yet".
  const lastActivityRef = useRef<number>(0);

  // ── activity detection (throttled) + heartbeat ──────────────────────────
  useEffect(() => {
    lastActivityRef.current = Date.now();
    let lastRecorded = 0;

    const markActive = () => {
      const now = Date.now();
      // Cheap throttle — we only actually need ~second-level accuracy
      // and don't want a mousemove flood touching a ref constantly.
      if (now - lastRecorded < 1000) return;
      lastRecorded = now;
      lastActivityRef.current = now;
    };

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, markActive, { passive: true })
    );

    const heartbeat = setInterval(() => {
      if (!socket.connected) return;

      const idleFor = Date.now() - lastActivityRef.current;
      if (idleFor < INACTIVITY_TIMEOUT_MS) {
        socket.emit(EVENTS.PRESENCE_HEARTBEAT);
      }
      // Otherwise: stop sending heartbeats. The backend's own inactivity
      // timeout (and sweep job) will naturally flip the user to Offline
      // without any extra signal needed from here.
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) =>
        window.removeEventListener(evt, markActive)
      );
      clearInterval(heartbeat);
    };
  }, [socket]);

  // ── send one heartbeat immediately whenever we (re)connect ──────────────
  useEffect(() => {
    const onConnect = () => {
      lastActivityRef.current = Date.now();
      socket.emit(EVENTS.PRESENCE_HEARTBEAT);
    };
    socket.on("connect", onConnect);
    return () => {
      socket.off("connect", onConnect);
    };
  }, [socket]);

  // ── listen for presence broadcasts ──────────────────────────────────────
  useEffect(() => {
    const onUpdate = (payload: {
      userId: string;
      status: ManualStatus | null;
    }) => {
      if (!payload?.userId) return;
      setStatusMap((prev) => ({ ...prev, [payload.userId]: payload.status }));
      setMyStatus((prev) =>
        prev && prev.userId === payload.userId && payload.status
          ? { ...prev, effective: payload.status }
          : prev
      );
    };

    socket.on(EVENTS.PRESENCE_UPDATE, onUpdate);
    return () => {
      socket.off(EVENTS.PRESENCE_UPDATE, onUpdate);
    };
  }, [socket]);

  // ── hydrate my own status ────────────────────────────────────────────────
  const loadMyStatus = useCallback(async () => {
    const data = await fetchMyStatus();
    if (!data) return;
    setMyStatus(data);
    knownIds.current.add(data.userId);
    setStatusMap((prev) => ({
      ...prev,
      [data.userId]: data.visible ? data.effective : null,
    }));
  }, []);

  useEffect(() => {
    loadMyStatus();
  }, [loadMyStatus]);

  // Re-hydrate on login/logout (token changes) so switching accounts
  // in the same tab doesn't keep showing the previous user's status.
  useEffect(() => {
    const onAuthChanged = () => loadMyStatus();
    window.addEventListener("user-updated", onAuthChanged);
    window.addEventListener("auth-changed", onAuthChanged);
    return () => {
      window.removeEventListener("user-updated", onAuthChanged);
      window.removeEventListener("auth-changed", onAuthChanged);
    };
  }, [loadMyStatus]);

  const ensureTracked = useCallback(
    (userIds: (string | null | undefined)[]) => {
      const missing = Array.from(
        new Set(
          userIds.filter(
            (id): id is string => !!id && !knownIds.current.has(id)
          )
        )
      );
      if (missing.length === 0) return;

      missing.forEach((id) => knownIds.current.add(id));

      fetchPresenceBulk(missing).then((map) => {
        if (Object.keys(map).length === 0) return;
        setStatusMap((prev) => ({ ...prev, ...map }));
      });
    },
    []
  );

  const getStatus = useCallback(
    (userId?: string | null) => {
      if (!userId) return null;
      return statusMap[userId] ?? null;
    },
    [statusMap]
  );

  const setStatus = useCallback(
    async (
      manualStatus: ManualStatus,
      duration?: DurationKey | "none",
      expiresAt?: string
    ) => {
      const data = await apiSetManualStatus(manualStatus, duration, expiresAt);
      if (!data) return;
      setMyStatus(data);
      setStatusMap((prev) => ({
        ...prev,
        [data.userId]: data.visible ? data.effective : null,
      }));
    },
    []
  );

  const resetStatus = useCallback(async () => {
    const data = await apiResetStatus();
    if (!data) return;
    setMyStatus(data);
    setStatusMap((prev) => ({
      ...prev,
      [data.userId]: data.visible ? data.effective : null,
    }));
  }, []);

  const setVisibility = useCallback(async (visible: boolean) => {
    const data = await apiSetStatusVisibility(visible);
    if (!data) return;
    setMyStatus(data);
    setStatusMap((prev) => ({
      ...prev,
      [data.userId]: data.visible ? data.effective : null,
    }));
  }, []);

  return (
    <PresenceContext.Provider
      value={{
        getStatus,
        myStatus,
        ensureTracked,
        setStatus,
        resetStatus,
        setVisibility,
      }}
    >
      {children}
    </PresenceContext.Provider>
  );
}

export const usePresence = () => useContext(PresenceContext);
