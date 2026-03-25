"use client";
import { useRef, useState, useCallback } from "react";
import { Mic, MicOff } from "lucide-react";

const MIN_RECORDING_MS = 500;

export default function PushToTalkButton({ onResult, onRecordStart, disabled }) {
  const [recording, setRecording] = useState(false);
  const [tooShort, setTooShort] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const startTimeRef = useRef(null);
  const tooShortTimerRef = useRef(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const ext = mimeType.startsWith("audio/webm") ? "webm" : "mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const duration = Date.now() - (startTimeRef.current ?? 0);
        if (duration < MIN_RECORDING_MS) {
          setTooShort(true);
          clearTimeout(tooShortTimerRef.current);
          tooShortTimerRef.current = setTimeout(() => setTooShort(false), 2000);
          return;
        }

        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size > 0) onResult?.(blob, ext);
      };

      recorder.start();
      startTimeRef.current = Date.now();
      setRecording(true);
      setTooShort(false);
      onRecordStart?.();
    } catch (err) {
      console.error("Microphone access error:", err);
    }
  }, [onResult, onRecordStart]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }, []);

  const handleClick = useCallback(() => {
    if (disabled) return;
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [disabled, recording, startRecording, stopRecording]);

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={handleClick}
        disabled={disabled}
        aria-label={recording ? "Stop recording" : "Start recording"}
        className={`
          w-20 h-20 rounded-full flex items-center justify-center
          transition-all select-none
          ${recording
            ? "bg-red-500 shadow-xl shadow-red-500/40 scale-110"
            : disabled
            ? "bg-white/10 text-white/30 cursor-not-allowed"
            : "bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/30 active:scale-95"
          }
        `}
      >
        {recording
          ? <MicOff className="w-8 h-8 animate-pulse" />
          : <Mic className="w-8 h-8" />
        }
      </button>
      <p className="text-white/30 text-xs text-center">
        {recording ? "Tap to send" : "Tap to speak"}
      </p>
      {tooShort && (
        <p className="text-yellow-400 text-xs text-center animate-fade-in">
          Speak a bit longer before stopping
        </p>
      )}
    </div>
  );
}
