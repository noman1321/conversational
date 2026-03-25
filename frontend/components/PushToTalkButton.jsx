"use client";
import { useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Mic, Square, Loader2 } from "lucide-react";

const SUPPORTED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
];

function getSupportedMimeType() {
  return SUPPORTED_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

function mimeToExtension(mime) {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "mp4";
  return "webm";
}

const MIN_RECORD_MS = 500;

export default function PushToTalkButton({ onResult, onRecordStart, disabled }) {
  const { t } = useTranslation("common");
  const [status, setStatus] = useState("idle"); // idle | listening | processing
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const mimeTypeRef = useRef("");
  const startTimeRef = useRef(0);

  const startRecording = useCallback(async () => {
    if (disabled || status !== "idle") return;
    onRecordStart?.();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      mimeTypeRef.current = mimeType;
      chunksRef.current = [];

      const options = mimeType ? { mimeType } : {};
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      // Capture actual MIME the browser chose (important on iOS)
      const actualMime = (mediaRecorder.mimeType || mimeType || "audio/webm").split(";")[0];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, { type: actualMime });
        chunksRef.current = [];

        if (blob.size < 1000) {
          setStatus("idle");
          return;
        }

        const ext = mimeToExtension(actualMime);
        setStatus("processing");
        await onResult(blob, ext);
        setStatus("idle");
      };

      // 100ms timeslice ensures real audio frames are encoded per chunk
      mediaRecorder.start(100);
      startTimeRef.current = Date.now();
      setStatus("listening");
    } catch {
      setStatus("idle");
    }
  }, [disabled, status, onResult]);

  const stopRecording = useCallback(() => {
    if (status !== "listening") return;
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder || mediaRecorder.state === "inactive") return;

    // Enforce minimum recording time so at least one 100ms chunk is captured
    const elapsed = Date.now() - startTimeRef.current;
    const remaining = Math.max(0, MIN_RECORD_MS - elapsed);

    setTimeout(() => {
      if (mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
    }, remaining);

    if (remaining > 0) {
      // Keep showing listening state until the delay is done
    } else {
      setStatus("processing");
    }
  }, [status]);

  const handleClick = useCallback(() => {
    if (status === "idle") startRecording();
    else if (status === "listening") stopRecording();
  }, [status, startRecording, stopRecording]);

  const statusConfig = {
    idle: {
      label: t("holdToSpeak"),
      icon: <Mic className="w-7 h-7" />,
      ring: "ring-indigo-500/40",
      bg: "bg-indigo-600 hover:bg-indigo-500",
    },
    listening: {
      label: t("listening"),
      icon: <Square className="w-6 h-6 fill-white" />,
      ring: "ring-red-500/60",
      bg: "bg-red-500 hover:bg-red-400",
    },
    processing: {
      label: t("thinking"),
      icon: <Loader2 className="w-7 h-7 animate-spin" />,
      ring: "ring-violet-500/40",
      bg: "bg-violet-600 cursor-not-allowed",
    },
  };

  const cfg = statusConfig[status];

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <button
        onClick={handleClick}
        disabled={disabled || status === "processing"}
        className={`relative w-20 h-20 rounded-full flex items-center justify-center text-white
          ring-4 transition-all duration-200 shadow-2xl active:scale-95
          ${cfg.ring} ${cfg.bg}
          ${disabled || status === "processing" ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
        `}
      >
        {cfg.icon}
        {status === "listening" && (
          <span className="absolute inset-0 rounded-full bg-red-400/30 animate-ping" />
        )}
      </button>
      <span className="text-sm text-white/60 font-medium">
        {status === "listening" ? t("release") : cfg.label}
      </span>
    </div>
  );
}
