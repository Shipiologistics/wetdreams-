"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, MicOff, Video, VideoOff } from "lucide-react";
import type {
  IAgoraRTCClient,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
  IRemoteVideoTrack,
} from "agora-rtc-sdk-ng";
import type { ChatRoom as Room } from "@/lib/view-models";
import type { Database } from "@/lib/database.types";

type Call = Database["public"]["Tables"]["calls"]["Row"];
type AgoraTokenPayload = {
  appId: string;
  channel: string;
  token: string;
  uid: string;
  expiresAt: number;
};

export function AgoraCallSession({
  call,
  room,
  tipControl,
  endControl,
}: {
  call: Call;
  room: Room;
  tipControl?: ReactNode;
  endControl?: ReactNode;
}) {
  const localVideoRef = useRef<HTMLDivElement>(null);
  const remoteVideoRef = useRef<HTMLDivElement>(null);
  const [localAudioTrack, setLocalAudioTrack] = useState<IMicrophoneAudioTrack | null>(null);
  const [localVideoTrack, setLocalVideoTrack] = useState<ICameraVideoTrack | null>(null);
  const [remoteVideoTrack, setRemoteVideoTrack] = useState<IRemoteVideoTrack | null>(null);
  const [status, setStatus] = useState("Connecting");
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const videoEnabled = call.call_type === "video";

  useEffect(() => {
    if (!videoEnabled || typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) return;
    const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getDisplayMedia = (() => Promise.reject(new DOMException("Private video calls cannot be screen recorded from this browser tab.", "NotAllowedError"))) as typeof navigator.mediaDevices.getDisplayMedia;

    return () => {
      navigator.mediaDevices.getDisplayMedia = originalGetDisplayMedia;
    };
  }, [videoEnabled]);

  useEffect(() => {
    let cancelled = false;
    let client: IAgoraRTCClient | null = null;
    let audioTrack: IMicrophoneAudioTrack | null = null;
    let videoTrack: ICameraVideoTrack | null = null;

    async function fetchToken() {
      const response = await fetch("/api/agora/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId: call.id }),
      });
      const payload = await response.json() as Partial<AgoraTokenPayload> & { error?: string };
      if (!response.ok || !payload.appId || !payload.channel || !payload.token || !payload.uid) {
        throw new Error(payload.error ?? "AGORA_TOKEN_FAILED");
      }
      return payload as AgoraTokenPayload;
    }

    async function renewToken() {
      if (!client) return;
      const tokenPayload = await fetchToken();
      await client.renewToken(tokenPayload.token);
    }

    async function joinCall() {
      try {
        setStatus("Requesting microphone");
        const [{ default: AgoraRTC }, tokenPayload] = await Promise.all([
          import("agora-rtc-sdk-ng"),
          fetchToken(),
        ]);

        if (cancelled) return;
        client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        client.on("user-published", async (user, mediaType) => {
          if (!client) return;
          await client.subscribe(user, mediaType);
          if (mediaType === "audio") user.audioTrack?.play();
          if (mediaType === "video" && user.videoTrack) setRemoteVideoTrack(user.videoTrack);
        });
        client.on("user-unpublished", (_user, mediaType) => {
          if (mediaType === "video") setRemoteVideoTrack(null);
        });
        client.on("user-left", () => setRemoteVideoTrack(null));
        client.on("token-privilege-will-expire", () => { void renewToken(); });
        client.on("token-privilege-did-expire", () => { void renewToken(); });

        await client.join(tokenPayload.appId, tokenPayload.channel, tokenPayload.token, tokenPayload.uid);
        if (cancelled) return;

        const tracks: Array<IMicrophoneAudioTrack | ICameraVideoTrack> = [];
        audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        setLocalAudioTrack(audioTrack);
        tracks.push(audioTrack);
        if (videoEnabled) {
          setStatus("Requesting camera");
          videoTrack = await AgoraRTC.createCameraVideoTrack({ encoderConfig: "480p_1" });
          setLocalVideoTrack(videoTrack);
          tracks.push(videoTrack);
        }

        await client.publish(tracks);
        setStatus(videoEnabled ? "Video call connected" : "Audio call connected");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not join Agora call.");
        setStatus("Call connection failed");
      }
    }

    void joinCall();

    return () => {
      cancelled = true;
      setLocalAudioTrack(null);
      setLocalVideoTrack(null);
      setRemoteVideoTrack(null);
      setMicOn(true);
      setCameraOn(true);
      audioTrack?.close();
      videoTrack?.close();
      client?.removeAllListeners();
      void client?.leave();
    };
  }, [call.call_type, call.id, room.id, videoEnabled]);

  useEffect(() => {
    if (!localVideoTrack || !localVideoRef.current) return;
    localVideoTrack.play(localVideoRef.current);
    return () => localVideoTrack.stop();
  }, [localVideoTrack]);

  useEffect(() => {
    if (!remoteVideoTrack || !remoteVideoRef.current) return;
    remoteVideoTrack.play(remoteVideoRef.current);
    return () => remoteVideoTrack.stop();
  }, [remoteVideoTrack]);

  async function toggleMic() {
    if (!localAudioTrack) return;
    const nextValue = !micOn;
    await localAudioTrack.setEnabled(nextValue);
    setMicOn(nextValue);
  }

  async function toggleCamera() {
    if (!localVideoTrack) return;
    const nextValue = !cameraOn;
    await localVideoTrack.setEnabled(nextValue);
    setCameraOn(nextValue);
  }

  return (
    <div className="agora-call-session">
      <div className="agora-video-stage">
        {videoEnabled ? (
          <>
            <div className="agora-remote-video" ref={remoteVideoRef}>
              {!remoteVideoTrack && <span>Waiting for video</span>}
            </div>
            <div className="agora-local-video" ref={localVideoRef}>
              {!localVideoTrack && <Video size={20} />}
            </div>
          </>
        ) : (
          <div className="agora-audio-only">
            <Mic size={34} />
            <span>Audio is live</span>
          </div>
        )}
      </div>
      <div className="agora-session-controls" aria-label="Call controls">
        <button
          className={`call-round-control ${micOn ? "" : "off"}`}
          type="button"
          onClick={() => void toggleMic()}
          disabled={!localAudioTrack}
          title={micOn ? "Mute microphone" : "Unmute microphone"}
        >
          {micOn ? <Mic size={22} /> : <MicOff size={22} />}
        </button>
        {videoEnabled && (
          <button
            className={`call-round-control ${cameraOn ? "" : "off"}`}
            type="button"
            onClick={() => void toggleCamera()}
            disabled={!localVideoTrack}
            title={cameraOn ? "Turn camera off" : "Turn camera on"}
          >
            {cameraOn ? <Video size={22} /> : <VideoOff size={22} />}
          </button>
        )}
        {tipControl}
        {endControl}
      </div>
      <p className="agora-call-status">
        {status === "Connecting" && <LoaderCircle className="spin" size={15} />}
        {status}
      </p>
      {error && <p className="agora-call-error" role="alert">{error}</p>}
    </div>
  );
}
