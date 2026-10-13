"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  ChatMessage,
  ICE_SERVERS,
  MEETING_EVENTS,
  MeetingPeer,
} from "@/lib/meeting/constants";

type UseMeetingWebRTCArgs = {
  socket: Socket;
  roomId: string;
  userId: string;
  username: string;
  enabled: boolean;
  onMeetingEnded?: () => void;
  onError?: (message: string) => void;
};

/** Survive React Strict Mode remounts without killing a fresh camera stream */
const mediaCache = new Map<string, MediaStream>();

export function useMeetingWebRTC({
  socket,
  roomId,
  userId,
  username,
  enabled,
  onMeetingEnded,
  onError,
}: UseMeetingWebRTCArgs) {
  const [peers, setPeers] = useState<MeetingPeer[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [handRaised, setHandRaised] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [joining, setJoining] = useState(true);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  /** Dedicated camera track kept aside while screen-sharing */
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const ignoreOfferRef = useRef<Map<string, boolean>>(new Map());
  const restoringCameraRef = useRef(false);
  const roomIdRef = useRef(roomId);
  const userIdRef = useRef(userId);
  roomIdRef.current = roomId;
  userIdRef.current = userId;

  const stopAllMedia = useCallback(() => {
    const key = `${roomIdRef.current}:${userIdRef.current}`;

    const stopTracks = (stream?: MediaStream | null) => {
      stream?.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
    };

    const cached = mediaCache.get(key);
    stopTracks(cached);
    mediaCache.delete(key);

    try {
      screenTrackRef.current?.stop();
    } catch {
      // ignore
    }
    screenTrackRef.current = null;

    try {
      cameraTrackRef.current?.stop();
    } catch {
      // ignore
    }
    cameraTrackRef.current = null;

    stopTracks(localStreamRef.current);
    stopTracks(cameraStreamRef.current);

    for (const pc of pcsRef.current.values()) {
      try {
        pc.getSenders().forEach((s) => {
          try {
            s.track?.stop();
          } catch {
            // ignore
          }
        });
        pc.close();
      } catch {
        // ignore
      }
    }
    pcsRef.current.clear();

    localStreamRef.current = null;
    cameraStreamRef.current = null;
    setLocalStream(null);
    setScreenSharing(false);
    setAudioEnabled(false);
    setVideoEnabled(false);
  }, []);

  const upsertPeer = useCallback((patch: MeetingPeer) => {
    setPeers((prev) => {
      const idx = prev.findIndex((p) => p.socketId === patch.socketId);
      if (idx === -1) return [...prev, patch];
      const cur = prev[idx];
      const next = [...prev];
      next[idx] = {
        ...cur,
        ...patch,
        userId: patch.userId || cur.userId,
        username:
          patch.username && patch.username !== "Participant"
            ? patch.username
            : cur.username || patch.username,
        stream: patch.stream ?? cur.stream,
        handRaised:
          typeof patch.handRaised === "boolean"
            ? patch.handRaised
            : cur.handRaised,
        audioEnabled:
          typeof patch.audioEnabled === "boolean"
            ? patch.audioEnabled
            : cur.audioEnabled,
        videoEnabled:
          typeof patch.videoEnabled === "boolean"
            ? patch.videoEnabled
            : cur.videoEnabled,
      };
      return next;
    });
  }, []);

  const removePeer = useCallback((socketId: string) => {
    const pc = pcsRef.current.get(socketId);
    if (pc) {
      pc.close();
      pcsRef.current.delete(socketId);
    }
    makingOfferRef.current.delete(socketId);
    ignoreOfferRef.current.delete(socketId);
    setPeers((prev) => prev.filter((p) => p.socketId !== socketId));
  }, []);

  const createPeerConnection = useCallback(
    (remoteSocketId: string, polite: boolean) => {
      if (pcsRef.current.has(remoteSocketId)) {
        return pcsRef.current.get(remoteSocketId)!;
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcsRef.current.set(remoteSocketId, pc);

      const stream = localStreamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) {
          pc.addTrack(track, stream);
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit(MEETING_EVENTS.ICE, {
            to: remoteSocketId,
            candidate: event.candidate,
          });
        }
      };

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        upsertPeer({
          socketId: remoteSocketId,
          userId: "",
          username: "Participant",
          stream: remoteStream,
        });
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed" ||
          pc.connectionState === "disconnected"
        ) {
          // keep peer tile briefly; cleanup on peer-left
        }
      };

      // Perfect negotiation: new joiner creates offer to existing peers
      if (!polite) {
        void (async () => {
          try {
            makingOfferRef.current.set(remoteSocketId, true);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit(MEETING_EVENTS.OFFER, {
              to: remoteSocketId,
              sdp: pc.localDescription,
            });
          } catch (err) {
            console.error("createOffer failed", err);
          } finally {
            makingOfferRef.current.set(remoteSocketId, false);
          }
        })();
      }

      return pc;
    },
    [socket, upsertPeer]
  );

  // Acquire media + join room (stable deps — avoid tearing down camera on re-renders)
  useEffect(() => {
    if (!enabled || !roomId || !userId) {
      setJoining(false);
      return;
    }

    let cancelled = false;
    let acquired: MediaStream | null = null;
    const cacheKey = `${roomId}:${userId}`;
    const usernameRef = { current: username };

    const start = async () => {
      setJoining(true);
      setMediaError(null);
      setVideoEnabled(true);
      setAudioEnabled(true);

      if (!navigator.mediaDevices?.getUserMedia) {
        setMediaError("Camera API not available in this browser.");
        setJoining(false);
        setVideoEnabled(false);
        setAudioEnabled(false);
        return;
      }

      // Reuse live stream if Strict Mode remounted us
      const cached = mediaCache.get(cacheKey);
      if (cached && cached.getTracks().some((t) => t.readyState === "live")) {
        acquired = cached;
        localStreamRef.current = cached;
        cameraStreamRef.current = cached;
        cameraTrackRef.current =
          cached.getVideoTracks().find((t) => t.readyState === "live") || null;
        setLocalStream(new MediaStream(cached.getTracks()));
        const hasVideo = cached
          .getVideoTracks()
          .some((t) => t.readyState === "live");
        setVideoEnabled(hasVideo);
        socket.emit(MEETING_EVENTS.JOIN, {
          roomId,
          userId,
          username: usernameRef.current,
          audioEnabled: cached.getAudioTracks().some((t) => t.enabled),
          videoEnabled: hasVideo,
        });
        setJoining(false);
        return;
      }

      // Prefer camera+mic; fall back step by step
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
      } catch (err) {
        console.warn("getUserMedia(audio+video) failed", err);
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: { facingMode: "user" },
          });
        } catch (err2) {
          console.warn("getUserMedia fallback failed", err2);
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setVideoEnabled(false);
            setMediaError(
              "Camera blocked or unavailable — joined with microphone only. Allow camera in the browser address bar and refresh."
            );
          } catch (err3) {
            console.error("getUserMedia all failed", err3);
            setMediaError(
              "Could not access camera/microphone. Allow permissions for this site, then refresh."
            );
            stream = new MediaStream();
            setAudioEnabled(false);
            setVideoEnabled(false);
          }
        }
      }

      if (cancelled) {
        // Don't stop immediately — Strict Mode remount may reclaim via cache
        if (stream && stream.getTracks().length) {
          mediaCache.set(cacheKey, stream);
        }
        return;
      }

      acquired = stream;
      mediaCache.set(cacheKey, stream);
      localStreamRef.current = stream;
      cameraStreamRef.current = stream;
      cameraTrackRef.current =
        stream.getVideoTracks().find((t) => t.readyState === "live") || null;
      setLocalStream(new MediaStream(stream.getTracks()));

      const hasVideo = stream.getVideoTracks().some((t) => t.readyState === "live");
      if (!hasVideo) setVideoEnabled(false);

      socket.emit(MEETING_EVENTS.JOIN, {
        roomId,
        userId,
        username: usernameRef.current,
        audioEnabled: stream.getAudioTracks().some((t) => t.enabled),
        videoEnabled: hasVideo,
      });
      setJoining(false);
    };

    void start();

    return () => {
      cancelled = true;
      socket.emit(MEETING_EVENTS.LEAVE);
      // Always release camera/mic when leaving the meeting page
      stopAllMedia();
      setPeers([]);
      setMessages([]);
      setJoining(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, roomId, userId, stopAllMedia]);

  // Socket signaling listeners
  useEffect(() => {
    if (!enabled) return;

    const onPeers = ({ peers: existing }: { peers: MeetingPeer[] }) => {
      for (const peer of existing) {
        upsertPeer(peer);
        // We are the new joiner → create offers (impolite toward existing? actually joiner offers)
        createPeerConnection(peer.socketId, false);
      }
    };

    const onPeerJoined = (peer: MeetingPeer) => {
      upsertPeer(peer);
      // Existing peer waits for offer from joiner (polite)
      createPeerConnection(peer.socketId, true);
    };

    const onPeerLeft = ({ socketId }: { socketId: string }) => {
      removePeer(socketId);
    };

    const onOffer = async ({
      from,
      sdp,
      userId: remoteUserId,
      username: remoteUsername,
    }: {
      from: string;
      sdp: RTCSessionDescriptionInit;
      userId?: string;
      username?: string;
    }) => {
      const pc = createPeerConnection(from, true);
      if (remoteUserId || remoteUsername) {
        upsertPeer({
          socketId: from,
          userId: remoteUserId || "",
          username: remoteUsername || "Participant",
        });
      }

      const offerCollision =
        makingOfferRef.current.get(from) ||
        pc.signalingState !== "stable";

      // Existing peer is polite — always accept
      ignoreOfferRef.current.set(from, false);

      if (offerCollision && ignoreOfferRef.current.get(from)) {
        return;
      }

      try {
        await pc.setRemoteDescription(sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit(MEETING_EVENTS.ANSWER, {
          to: from,
          sdp: pc.localDescription,
        });
      } catch (err) {
        console.error("handle offer failed", err);
      }
    };

    const onAnswer = async ({
      from,
      sdp,
    }: {
      from: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      const pc = pcsRef.current.get(from);
      if (!pc) return;
      try {
        await pc.setRemoteDescription(sdp);
      } catch (err) {
        console.error("handle answer failed", err);
      }
    };

    const onIce = async ({
      from,
      candidate,
    }: {
      from: string;
      candidate: RTCIceCandidateInit;
    }) => {
      const pc = pcsRef.current.get(from);
      if (!pc) return;
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        console.error("addIceCandidate failed", err);
      }
    };

    const onChat = (message: ChatMessage) => {
      setMessages((prev) => [...prev, message]);
    };

    const onHand = ({
      socketId,
      raised,
    }: {
      socketId: string;
      raised: boolean;
    }) => {
      setPeers((prev) =>
        prev.map((p) =>
          p.socketId === socketId ? { ...p, handRaised: raised } : p
        )
      );
      if (socketId === socket.id) setHandRaised(raised);
    };

    const onMedia = ({
      socketId,
      audioEnabled: a,
      videoEnabled: v,
    }: {
      socketId: string;
      audioEnabled: boolean;
      videoEnabled: boolean;
    }) => {
      setPeers((prev) =>
        prev.map((p) =>
          p.socketId === socketId
            ? { ...p, audioEnabled: a, videoEnabled: v }
            : p
        )
      );
    };

    const onEnded = () => {
      stopAllMedia();
      onMeetingEnded?.();
    };

    const handleSocketError = (payload: { message?: string }) => {
      onError?.(payload.message || "Meeting error");
    };

    socket.on(MEETING_EVENTS.PEERS, onPeers);
    socket.on(MEETING_EVENTS.PEER_JOINED, onPeerJoined);
    socket.on(MEETING_EVENTS.PEER_LEFT, onPeerLeft);
    socket.on(MEETING_EVENTS.OFFER, onOffer);
    socket.on(MEETING_EVENTS.ANSWER, onAnswer);
    socket.on(MEETING_EVENTS.ICE, onIce);
    socket.on(MEETING_EVENTS.CHAT, onChat);
    socket.on(MEETING_EVENTS.HAND, onHand);
    socket.on(MEETING_EVENTS.MEDIA, onMedia);
    socket.on(MEETING_EVENTS.ENDED, onEnded);
    socket.on(MEETING_EVENTS.ERROR, handleSocketError);

    return () => {
      socket.off(MEETING_EVENTS.PEERS, onPeers);
      socket.off(MEETING_EVENTS.PEER_JOINED, onPeerJoined);
      socket.off(MEETING_EVENTS.PEER_LEFT, onPeerLeft);
      socket.off(MEETING_EVENTS.OFFER, onOffer);
      socket.off(MEETING_EVENTS.ANSWER, onAnswer);
      socket.off(MEETING_EVENTS.ICE, onIce);
      socket.off(MEETING_EVENTS.CHAT, onChat);
      socket.off(MEETING_EVENTS.HAND, onHand);
      socket.off(MEETING_EVENTS.MEDIA, onMedia);
      socket.off(MEETING_EVENTS.ENDED, onEnded);
      socket.off(MEETING_EVENTS.ERROR, handleSocketError);
    };
  }, [
    enabled,
    socket,
    createPeerConnection,
    upsertPeer,
    removePeer,
    onMeetingEnded,
    onError,
    stopAllMedia,
  ]);

  const audioEnabledRef = useRef(audioEnabled);
  const videoEnabledRef = useRef(videoEnabled);
  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);
  useEffect(() => {
    videoEnabledRef.current = videoEnabled;
  }, [videoEnabled]);

  const refreshLocalPreview = useCallback(() => {
    const src = localStreamRef.current;
    if (!src) {
      setLocalStream(null);
      return;
    }
    setLocalStream(new MediaStream(src.getTracks()));
  }, []);

  const replaceVideoTrack = useCallback(async (track: MediaStreamTrack | null) => {
    for (const pc of pcsRef.current.values()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        await sender.replaceTrack(track);
      } else if (track && localStreamRef.current) {
        pc.addTrack(track, localStreamRef.current);
      }
    }
  }, []);

  const toggleAudio = useCallback(() => {
    setAudioEnabled((prev) => {
      const next = !prev;
      localStreamRef.current?.getAudioTracks().forEach((t) => {
        t.enabled = next;
      });
      socket.emit(MEETING_EVENTS.MEDIA, {
        audioEnabled: next,
        videoEnabled: videoEnabledRef.current,
      });
      refreshLocalPreview();
      return next;
    });
  }, [socket, refreshLocalPreview]);

  const toggleVideo = useCallback(() => {
    void (async () => {
      const turningOn = !videoEnabledRef.current;

      if (turningOn) {
        let track =
          (cameraTrackRef.current &&
          cameraTrackRef.current.readyState === "live"
            ? cameraTrackRef.current
            : null) ||
          localStreamRef.current
            ?.getVideoTracks()
            .find((t) => t.readyState === "live" && t !== screenTrackRef.current);

        if (!track) {
          try {
            const cam = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
            track = cam.getVideoTracks()[0];
            if (!track) throw new Error("No video track");

            cameraTrackRef.current = track;
            if (!localStreamRef.current) {
              localStreamRef.current = new MediaStream([track]);
            } else if (!localStreamRef.current.getVideoTracks().includes(track)) {
              localStreamRef.current.addTrack(track);
            }
            cameraStreamRef.current = new MediaStream([track]);
            await replaceVideoTrack(track);
            setMediaError(null);
          } catch (err) {
            console.error(err);
            setMediaError(
              "Could not start camera. Check browser permissions and that no other app is using it."
            );
            return;
          }
        } else {
          cameraTrackRef.current = track;
          track.enabled = true;
          if (
            localStreamRef.current &&
            !localStreamRef.current.getVideoTracks().includes(track)
          ) {
            localStreamRef.current.addTrack(track);
          }
          await replaceVideoTrack(track);
        }

        setVideoEnabled(true);
        refreshLocalPreview();
        socket.emit(MEETING_EVENTS.MEDIA, {
          audioEnabled: audioEnabledRef.current,
          videoEnabled: true,
        });
        return;
      }

      localStreamRef.current?.getVideoTracks().forEach((t) => {
        t.enabled = false;
      });
      setVideoEnabled(false);
      refreshLocalPreview();
      socket.emit(MEETING_EVENTS.MEDIA, {
        audioEnabled: audioEnabledRef.current,
        videoEnabled: false,
      });
    })();
  }, [socket, refreshLocalPreview, replaceVideoTrack]);

  const toggleHand = useCallback(() => {
    const next = !handRaised;
    setHandRaised(next);
    socket.emit(MEETING_EVENTS.HAND, { raised: next });
  }, [handRaised, socket]);

  const sendChat = useCallback(
    (text: string, mentions: string[] = []) => {
      socket.emit(MEETING_EVENTS.CHAT, { text, mentions });
    },
    [socket]
  );

  const restoreCameraAfterShare = useCallback(async () => {
    if (restoringCameraRef.current) return;
    restoringCameraRef.current = true;
    try {
      // Stop / remove any screen-share tracks
      const screen = screenTrackRef.current;
      if (screen) {
        try {
          screen.onended = null;
          screen.stop();
        } catch {
          // ignore
        }
        screenTrackRef.current = null;
      }

      if (localStreamRef.current) {
        for (const t of [...localStreamRef.current.getVideoTracks()]) {
          if (t !== cameraTrackRef.current) {
            localStreamRef.current.removeTrack(t);
            try {
              t.stop();
            } catch {
              // ignore
            }
          }
        }
      }

      // Re-acquire camera if the old track is gone / ended
      let cam = cameraTrackRef.current;
      if (!cam || cam.readyState === "ended") {
        try {
          const fresh = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
          cam = fresh.getVideoTracks()[0] || null;
          cameraTrackRef.current = cam;
          if (cam && cameraStreamRef.current) {
            // keep a clean camera-only reference stream for later restores
            cameraStreamRef.current.getVideoTracks().forEach((t) => {
              if (t !== cam) {
                try {
                  cameraStreamRef.current?.removeTrack(t);
                } catch {
                  // ignore
                }
              }
            });
            if (!cameraStreamRef.current.getVideoTracks().includes(cam)) {
              cameraStreamRef.current.addTrack(cam);
            }
          } else if (cam) {
            cameraStreamRef.current = new MediaStream([cam]);
          }
          setMediaError(null);
        } catch (err) {
          console.error("reload camera after share failed", err);
          setMediaError(
            "Could not reload camera after screen share. Click the camera icon to retry."
          );
          setScreenSharing(false);
          setVideoEnabled(false);
          refreshLocalPreview();
          return;
        }
      }

      if (cam) {
        cam.enabled = true;
        if (
          localStreamRef.current &&
          !localStreamRef.current.getVideoTracks().includes(cam)
        ) {
          localStreamRef.current.addTrack(cam);
        }
        await replaceVideoTrack(cam);
        setVideoEnabled(true);
      }

      setScreenSharing(false);
      refreshLocalPreview();
      socket.emit(MEETING_EVENTS.MEDIA, {
        audioEnabled: audioEnabledRef.current,
        videoEnabled: !!cam,
      });
    } finally {
      restoringCameraRef.current = false;
    }
  }, [refreshLocalPreview, replaceVideoTrack, socket]);

  const toggleScreenShare = useCallback(async () => {
    if (screenSharing) {
      await restoreCameraAfterShare();
      return;
    }

    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const screenTrack = display.getVideoTracks()[0];
      if (!screenTrack) return;

      // Preserve the live camera track separately (do NOT stop it)
      const currentCam =
        cameraTrackRef.current &&
        cameraTrackRef.current.readyState === "live"
          ? cameraTrackRef.current
          : localStreamRef.current
              ?.getVideoTracks()
              .find((t) => t.readyState === "live") || null;

      if (currentCam) {
        cameraTrackRef.current = currentCam;
        // Soft-disable while sharing so the device can stay allocated
        currentCam.enabled = false;
      }

      // Swap outgoing video to screen
      if (localStreamRef.current) {
        for (const t of [...localStreamRef.current.getVideoTracks()]) {
          localStreamRef.current.removeTrack(t);
          // Only stop if it's already a leftover screen track, never the camera
          if (t !== cameraTrackRef.current) {
            try {
              t.stop();
            } catch {
              // ignore
            }
          }
        }
        localStreamRef.current.addTrack(screenTrack);
      } else {
        localStreamRef.current = new MediaStream([
          ...(cameraTrackRef.current ? [] : []),
          screenTrack,
        ]);
        // keep mic tracks if any were on a previous stream — none here
      }

      screenTrackRef.current = screenTrack;
      await replaceVideoTrack(screenTrack);
      setScreenSharing(true);
      refreshLocalPreview();

      screenTrack.onended = () => {
        void restoreCameraAfterShare();
      };
    } catch (err) {
      console.error("screen share failed", err);
      setMediaError("Screen share was cancelled or blocked.");
    }
  }, [
    screenSharing,
    restoreCameraAfterShare,
    replaceVideoTrack,
    refreshLocalPreview,
  ]);

  const leave = useCallback(() => {
    socket.emit(MEETING_EVENTS.LEAVE);
    stopAllMedia();
  }, [socket, stopAllMedia]);

  const notifyEnded = useCallback(() => {
    socket.emit(MEETING_EVENTS.ENDED);
    stopAllMedia();
  }, [socket, stopAllMedia]);

  return {
    peers,
    localStream,
    messages,
    audioEnabled,
    videoEnabled,
    handRaised,
    screenSharing,
    joining,
    mediaError,
    toggleAudio,
    toggleVideo,
    toggleHand,
    toggleScreenShare,
    sendChat,
    leave,
    notifyEnded,
    stopAllMedia,
  };
}
