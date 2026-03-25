"use client";
import { useTranslation } from "react-i18next";

export default function VoiceSelector({ voice, setVoice, lang, setLang }) {
  const { t } = useTranslation("common");

  return (
    <div className="flex flex-wrap items-center gap-4 px-4 py-3 bg-white/5 border border-white/10 rounded-2xl">
      <div className="flex items-center gap-2">
        <span className="text-xs text-white/50 uppercase tracking-widest">{t("voiceLabel")}</span>
        <div className="flex gap-1">
          {["female", "male"].map((v) => (
            <button
              key={v}
              onClick={() => setVoice(v)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                voice === v
                  ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
            >
              {v === "female" ? t("voiceFemale") : t("voiceMale")}
            </button>
          ))}
        </div>
      </div>

      <div className="h-5 w-px bg-white/10 hidden sm:block" />

      <div className="flex items-center gap-2">
        <span className="text-xs text-white/50 uppercase tracking-widest">{t("langLabel")}</span>
        <div className="flex gap-1">
          {[
            { code: "en", label: t("langEn") },
            { code: "hi", label: t("langHi") },
            { code: "mr", label: t("langMr") },
          ].map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                lang === l.code
                  ? "bg-violet-500 text-white shadow-lg shadow-violet-500/30"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
