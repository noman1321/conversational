"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, Volume2, AlertCircle } from "lucide-react";
import VoiceSelector from "@/components/VoiceSelector";
import PushToTalkButton from "@/components/PushToTalkButton";
import Message from "@/components/Message";
import PersonaSelector from "@/components/PersonaSelector";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Home() {
  const { t, i18n } = useTranslation("common");
  const [messages, setMessages] = useState([]);
  const [voice, setVoice] = useState("female");
  const [lang, setLang] = useState("en");
  const [persona, setPersona] = useState("general");
  const [botSpeaking, setBotSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    i18n.changeLanguage(lang);
  }, [lang, i18n]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isProcessing, botSpeaking]);

  const handlePersonaChange = useCallback((newPersona) => {
    if (newPersona === persona) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setBotSpeaking(false);
    setIsProcessing(false);
    setMessages([]);
    setError(null);
    setPersona(newPersona);
  }, [persona]);

  const getHistory = useCallback(() =>
    messages.map((m) => ({ role: m.role, content: m.text })),
    [messages]
  );

  const handleAudioResult = useCallback(async (audioBlob, ext = "webm") => {
    setError(null);
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, `recording.${ext}`);
      formData.append("history", JSON.stringify(getHistory()));
      formData.append("voice", voice);
      formData.append("persona", persona);

      const res = await fetch(`${API_URL}/chat/voice`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }

      const buffer = await res.arrayBuffer();
      const view = new DataView(buffer);

      const headerLen = view.getUint32(0, false);
      const headerBytes = new Uint8Array(buffer, 4, headerLen);
      const { user_text, reply_text } = JSON.parse(
        new TextDecoder().decode(headerBytes)
      );

      const audioBytes = new Uint8Array(buffer, 4 + headerLen);
      const audioBlob2 = new Blob([audioBytes], { type: "audio/mpeg" });
      const audioUrl = URL.createObjectURL(audioBlob2);

      setIsProcessing(false);
      setMessages((prev) => [
        ...prev,
        { role: "user", text: user_text, id: Date.now() },
        { role: "assistant", text: reply_text, id: Date.now() + 1 },
      ]);

      setBotSpeaking(true);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => {
        setBotSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };
      audio.play();
    } catch (err) {
      console.error("handleAudioResult error:", err);
      setIsProcessing(false);
      setError(err.message || "Something went wrong. Please try again.");
      setBotSpeaking(false);
    }
  }, [getHistory, voice, persona]);

  const clearChat = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setBotSpeaking(false);
    setIsProcessing(false);
    setMessages([]);
    setError(null);
  };

  return (
    <main className="min-h-screen bg-[#0d0d14] text-white flex flex-col">
      <header className="px-6 py-5 border-b border-white/8 flex items-center justify-between backdrop-blur-sm bg-black/20 sticky top-0 z-10">
        <div>
          <h1
            className="text-xl font-bold text-white"
            style={{ fontFamily: "'Noto Sans Devanagari', sans-serif" }}
          >
            {t("appTitle")}
          </h1>
          <p className="text-xs text-white/40 mt-0.5">{t("appSubtitle")}</p>
        </div>
        <button
          onClick={clearChat}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/80 text-sm transition-all"
        >
          <Trash2 className="w-4 h-4" />
          {t("clearChat")}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 max-w-2xl w-full mx-auto">
        {messages.length === 0 && !error && !isProcessing ? (
          <div className="flex items-center justify-center h-full min-h-[200px]">
            <p
              className="text-white/30 text-center text-sm max-w-xs leading-relaxed"
              style={{ fontFamily: "'Noto Sans Devanagari', sans-serif" }}
            >
              {t("noMessages")}
            </p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <Message
              key={msg.id}
              role={msg.role}
              text={msg.text}
              isNew={i === messages.length - 2 || i === messages.length - 1}
            />
          ))
        )}

        {isProcessing && (
          <div className="flex items-center gap-3 pl-11 animate-fade-in">
            <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl rounded-tl-sm bg-white/8 border border-white/10">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-2 h-2 bg-white/40 rounded-full animate-typing-dot"
                  style={{ animationDelay: `${i * 0.18}s` }}
                />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm animate-fade-in max-w-xl mx-auto">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {botSpeaking && (
          <div className="flex items-center gap-2 text-violet-400 text-sm pl-11 animate-fade-in">
            <Volume2 className="w-4 h-4 animate-pulse" />
            <span>{t("speaking")}</span>
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1 h-4 bg-violet-400 rounded-full animate-bar"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="sticky bottom-0 border-t border-white/8 bg-[#0d0d14]/95 backdrop-blur-sm px-4 py-5">
        <div className="max-w-2xl mx-auto flex flex-col items-center gap-4">
          <PersonaSelector persona={persona} setPersona={handlePersonaChange} />
          <div className="w-full h-px bg-white/8" />
          <VoiceSelector
            voice={voice}
            setVoice={setVoice}
            lang={lang}
            setLang={setLang}
          />
          <PushToTalkButton
            onResult={handleAudioResult}
            disabled={botSpeaking || isProcessing}
          />
        </div>
      </div>
    </main>
  );
}
