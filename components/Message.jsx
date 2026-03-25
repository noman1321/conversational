"use client";
import { useTranslation } from "react-i18next";

export default function Message({ role, text, isNew }) {
  const { t } = useTranslation("common");
  const isUser = role === "user";

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} ${
        isNew ? "animate-fade-in" : ""
      }`}
    >
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-1 ${
          isUser
            ? "bg-indigo-500 text-white"
            : "bg-violet-500 text-white"
        }`}
      >
        {isUser ? t("you")[0] : "AI"}
      </div>

      <div
        className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? "bg-indigo-500/20 border border-indigo-500/30 text-white rounded-tr-sm"
            : "bg-white/8 border border-white/10 text-white/90 rounded-tl-sm"
        }`}
        style={{ fontFamily: "'Noto Sans Devanagari', 'Inter', sans-serif" }}
      >
        {text}
      </div>
    </div>
  );
}
