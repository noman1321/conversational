"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { Phone, PhoneOff, Volume2 } from "lucide-react";
import PushToTalkButton from "@/components/PushToTalkButton";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/backend";

const AGENT = {
  female: { name: "Priya", initial: "P", color: "from-violet-500 to-indigo-600", shadow: "shadow-violet-500/30" },
};

async function parseBinaryResponse(res) {
  const buffer = await res.arrayBuffer();
  const view = new DataView(buffer);
  const headerLen = view.getUint32(0, false);
  const headerBytes = new Uint8Array(buffer, 4, headerLen);
  const meta = JSON.parse(new TextDecoder().decode(headerBytes));
  const audioBytes = new Uint8Array(buffer, 4 + headerLen);
  return { meta, audioBlob: new Blob([audioBytes], { type: "audio/mpeg" }) };
}

export default function Home() {
  const [callState, setCallState]     = useState("idle");
  const [agentGender]                 = useState("female");
  const [messages, setMessages]       = useState([]);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [isProcessing, setIsProcessing]   = useState(false);
  const [error, setError]             = useState(null);
  const [callDuration, setCallDuration]   = useState(0);

  const audioRef       = useRef(null);
  const callStartRef   = useRef(null);
  const timerRef       = useRef(null);
  const messagesEndRef = useRef(null);
  const agentGenderRef = useRef(agentGender);
  agentGenderRef.current = agentGender;

  const playAudio = useCallback((blob) =>
    new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = audioRef.current || new Audio();
      audioRef.current = audio;
      audio.src = url;
      audio.load();
      setAgentSpeaking(true);
      audio.onended = () => { setAgentSpeaking(false); URL.revokeObjectURL(url); resolve(); };
      audio.onerror = () => { setAgentSpeaking(false); URL.revokeObjectURL(url); resolve(); };
      audio.play().catch(() => { setAgentSpeaking(false); resolve(); });
    }), []);

  const handleAudioResult = useCallback(async (audioBlob, ext) => {
    setError(null);
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, `recording.${ext}`);
      formData.append("history", JSON.stringify(
        messages.map((m) => ({ role: m.role, content: m.text }))
      ));
      formData.append("persona", "insurance");
      formData.append("voice", agentGenderRef.current);

      const res = await fetch(`${API_URL}/chat/voice`, { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(err.detail);
      }

      const { meta, audioBlob: replyAudio } = await parseBinaryResponse(res);
      setMessages((prev) => [
        ...prev,
        { role: "user",      text: meta.user_text,  id: Date.now() },
        { role: "assistant", text: meta.reply_text, id: Date.now() + 1 },
      ]);
      setIsProcessing(false);
      await playAudio(replyAudio);
    } catch (err) {
      console.error(err);
      setIsProcessing(false);
      setError(err.message || "Something went wrong. Please try again.");
    }
  }, [messages, playAudio]);

  const startCall = useCallback(async () => {
    setCallState("connecting");
    setError(null);
    setMessages([]);

    // Unlock iOS audio in user gesture context
    const unlock = new Audio();
    unlock.play().catch(() => {});
    unlock.pause();
    audioRef.current = unlock;

    try {
      const res = await fetch(`${API_URL}/chat/greet`, {
        method: "POST",
        body: new URLSearchParams({ gender: agentGenderRef.current }),
      });
      if (!res.ok) throw new Error("Failed to get greeting");

      const { meta, audioBlob } = await parseBinaryResponse(res);
      setMessages([{ role: "assistant", text: meta.reply_text, id: Date.now() }]);
      setCallState("active");

      callStartRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000));
      }, 1000);

      await playAudio(audioBlob);
    } catch (err) {
      console.error(err);
      setError("Could not connect. Please try again.");
      setCallState("idle");
    }
  }, [playAudio]);

  const endCall = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    clearInterval(timerRef.current);
    setAgentSpeaking(false);
    setIsProcessing(false);
    setCallState("ended");
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => clearInterval(timerRef.current), []);

  const fmt = (s) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const agent = AGENT[agentGender];

  return (
    <main className="min-h-screen bg-[#0a0a12] text-white flex flex-col items-center justify-center px-4">

      {/* ── IDLE / ENDED ── */}
      {(callState === "idle" || callState === "ended") && (
        <div className="flex flex-col items-center gap-8 animate-fade-in">
          <div className="relative">
            <div className={`w-28 h-28 rounded-full bg-gradient-to-br ${agent.color} flex items-center justify-center text-4xl font-bold shadow-2xl ${agent.shadow}`}>
              {agent.initial}
            </div>
            {callState === "ended" && (
              <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-red-500 flex items-center justify-center">
                <PhoneOff className="w-4 h-4" />
              </div>
            )}
          </div>

          <div className="text-center">
            <h1 className="text-2xl font-semibold">{agent.name}</h1>
            <p className="text-white/50 text-sm mt-1">SecureLife Insurance</p>
            {callState === "ended" && (
              <p className="text-white/30 text-xs mt-2">Call ended · {fmt(callDuration)}</p>
            )}
          </div>


          {error && <p className="text-red-400 text-sm text-center max-w-xs">{error}</p>}

          <button
            onClick={startCall}
            className="flex items-center gap-3 px-8 py-4 rounded-full bg-green-500 hover:bg-green-400 text-white font-semibold text-lg shadow-lg shadow-green-500/30 transition-all active:scale-95"
          >
            <Phone className="w-5 h-5" />
            {callState === "ended" ? "Call Again" : `Call ${agent.name}`}
          </button>

          {callState === "idle" && (
            <p className="text-white/20 text-xs text-center max-w-xs">
              Tap to speak · Release to send
            </p>
          )}
        </div>
      )}

      {/* ── CONNECTING ── */}
      {callState === "connecting" && (
        <div className="flex flex-col items-center gap-6 animate-fade-in">
          <div className={`w-28 h-28 rounded-full bg-gradient-to-br ${agent.color} flex items-center justify-center text-4xl font-bold shadow-2xl animate-pulse`}>
            {agent.initial}
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-semibold">{agent.name}</h1>
            <p className="text-white/50 text-sm mt-1">Connecting…</p>
          </div>
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <span key={i} className="w-2 h-2 bg-white/40 rounded-full animate-typing-dot"
                style={{ animationDelay: `${i * 0.18}s` }} />
            ))}
          </div>
        </div>
      )}

      {/* ── ACTIVE CALL ── */}
      {callState === "active" && (
        <div className="w-full max-w-md flex flex-col h-screen animate-fade-in">

          {/* Header */}
          <div className="flex flex-col items-center pt-10 pb-4 gap-3">
            <div className="relative">
              <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${agent.color} flex items-center justify-center text-3xl font-bold shadow-xl`}>
                {agent.initial}
              </div>
              {agentSpeaking && (
                <span className="absolute inset-0 rounded-full bg-white/20 animate-ping" />
              )}
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold">{agent.name} · SecureLife Insurance</h2>
              <p className="text-white/40 text-sm tabular-nums">{fmt(callDuration)}</p>
            </div>
          </div>

          {/* Transcript */}
          <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white rounded-br-sm"
                    : "bg-white/8 border border-white/10 text-white/90 rounded-bl-sm"
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}

            {isProcessing && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl rounded-bl-sm bg-white/8 border border-white/10">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="w-2 h-2 bg-white/40 rounded-full animate-typing-dot"
                      style={{ animationDelay: `${i * 0.18}s` }} />
                  ))}
                </div>
              </div>
            )}

            {agentSpeaking && (
              <div className="flex items-center gap-2 text-violet-400 text-sm pl-2">
                <Volume2 className="w-4 h-4 animate-pulse" />
                <span>{agent.name} is speaking…</span>
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="w-1 h-4 bg-violet-400 rounded-full animate-bar"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </span>
              </div>
            )}

            {error && <p className="text-center text-red-400 text-xs">{error}</p>}
            <div ref={messagesEndRef} />
          </div>

          {/* Controls */}
          <div className="pb-10 pt-4 flex flex-col items-center gap-5 border-t border-white/8">
            <PushToTalkButton
              onResult={handleAudioResult}
              onRecordStart={() => {
                const a = audioRef.current || new Audio();
                a.play().catch(() => {}); a.pause();
                audioRef.current = a;
              }}
              disabled={agentSpeaking || isProcessing}
            />
            <button
              onClick={endCall}
              className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center shadow-lg shadow-red-500/30 transition-all active:scale-95"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>

        </div>
      )}
    </main>
  );
}
