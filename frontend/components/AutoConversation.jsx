"use client";
import { useRef, useState, useCallback, useEffect } from "react";

const SILENCE_MS = 1500;
const MIN_SPEECH_MS = 500;
const MAX_RECORD_MS = 20000; // force-stop after 20s no matter what
const WARMUP_MS = 700;       // let AudioContext stabilize before calibrating
const CALIBRATION_MS = 800;  // measure background noise for this long

const MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
];

function getMimeType() {
  return MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

function mimeExt(mime) {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4") || mime.includes("aac") || mime.includes("m4a")) return "mp4";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

// RMS energy over voice-frequency bins (more accurate than simple average)
function getRMS(data) {
  const bins = data.slice(0, 100);
  return Math.sqrt(bins.reduce((s, v) => s + v * v, 0) / bins.length);
}

// Measure ambient noise floor after AudioContext has warmed up
async function calibrate(analyser) {
  // Wait for AudioContext to produce real readings
  await new Promise((r) => setTimeout(r, WARMUP_MS));

  const data = new Uint8Array(analyser.frequencyBinCount);
  const samples = [];
  await new Promise((resolve) => {
    const interval = setInterval(() => {
      analyser.getByteFrequencyData(data);
      const rms = getRMS(data);
      if (rms > 0) samples.push(rms); // ignore zero warmup frames
    }, 40);
    setTimeout(() => { clearInterval(interval); resolve(); }, CALIBRATION_MS);
  });

  const floor = samples.length
    ? samples.reduce((s, v) => s + v, 0) / samples.length
    : 8;

  // Use higher margin so ambient noise never triggers "voice"
  const startThreshold = Math.max(32, floor * 3.0);
  const stopThreshold  = Math.max(18, floor * 1.8);

  console.log(`[VAD] floor=${floor.toFixed(1)} start=${startThreshold.toFixed(1)} stop=${stopThreshold.toFixed(1)}`);
  return { startThreshold, stopThreshold };
}

export default function useAutoConversation(onResult) {
  const [status, setStatus] = useState("idle");

  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const R = useRef({
    active: false,
    busy: false,
    recording: false,
    stream: null,
    ctx: null,
    analyser: null,
    mr: null,
    chunks: [],
    mime: "",
    speechAt: 0,
    silenceAt: null,
    rafId: null,
    startThreshold: 32,
    stopThreshold: 18,
  });

  const runLoop = useCallback(() => {
    const r = R.current;
    if (!r.analyser || !r.active) return;

    const data = new Uint8Array(r.analyser.frequencyBinCount);

    function tick() {
      if (!r.active) return;

      r.analyser.getByteFrequencyData(data);
      const rms = getRMS(data);

      if (!r.busy) {
        const now = Date.now();

        // Force-stop if recording too long (safety net)
        if (r.recording && now - r.speechAt > MAX_RECORD_MS) {
          if (r.mr?.state !== "inactive") r.mr.stop();
          return;
        }

        if (rms > r.startThreshold && !r.recording) {
          // ── Start recording ──
          r.recording = true;
          r.speechAt = now;
          r.silenceAt = null;
          r.chunks = [];

          const mr = new MediaRecorder(
            r.stream,
            r.mime ? { mimeType: r.mime } : {}
          );
          r.mr = mr;
          // Use the actual MIME type the browser chose, not what we requested
          const actualMime = (mr.mimeType || r.mime || "audio/webm").split(";")[0];
          mr.ondataavailable = (e) => { if (e.data.size > 0) r.chunks.push(e.data); };
          mr.onstop = async () => {
            r.recording = false;
            const blob = new Blob(r.chunks, { type: actualMime });
            r.chunks = [];
            if (blob.size < 1000) {
              setStatus("listening");
              r.rafId = requestAnimationFrame(tick);
              return;
            }
            r.busy = true;
            setStatus("processing");
            await onResultRef.current(blob, mimeExt(actualMime));
          };
          mr.start(100);
          setStatus("recording");

        } else if (rms <= r.stopThreshold && r.recording) {
          // ── Silence while recording ──
          r.silenceAt ??= now;
          if (now - r.silenceAt > SILENCE_MS && now - r.speechAt > MIN_SPEECH_MS) {
            if (r.mr?.state !== "inactive") r.mr.stop();
            return; // exit — resume via resumeListening()
          }

        } else if (rms > r.stopThreshold && r.recording) {
          // ── Still speaking ──
          r.silenceAt = null;
        }
      }

      r.rafId = requestAnimationFrame(tick);
    }

    r.rafId = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(async () => {
    const r = R.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      r.stream = stream;
      r.active = true;
      r.busy = false;

      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") await ctx.resume();
      r.ctx = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.3;
      r.analyser = analyser;

      ctx.createMediaStreamSource(stream).connect(analyser);
      r.mime = getMimeType();

      setStatus("listening");

      // Calibrate after warmup
      const { startThreshold, stopThreshold } = await calibrate(analyser);
      r.startThreshold = startThreshold;
      r.stopThreshold  = stopThreshold;

      runLoop();
    } catch (err) {
      console.error("AutoConversation start error:", err);
    }
  }, [runLoop]);

  const resumeListening = useCallback(() => {
    const r = R.current;
    if (!r.active) return;
    r.busy = false;
    r.recording = false;
    if (r.rafId) cancelAnimationFrame(r.rafId);
    setStatus("listening");
    runLoop();
  }, [runLoop]);

  const stop = useCallback(() => {
    const r = R.current;
    r.active = false;
    if (r.rafId) cancelAnimationFrame(r.rafId);
    if (r.mr?.state !== "inactive") r.mr?.stop();
    r.stream?.getTracks().forEach((t) => t.stop());
    if (r.ctx?.state !== "closed") r.ctx?.close();
    r.stream = null;
    r.ctx = null;
    r.analyser = null;
    setStatus("idle");
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { status, start, stop, resumeListening };
}
