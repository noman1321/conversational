"use client";
import { useTranslation } from "react-i18next";
import { MessageCircle, Stethoscope, Scale, BookOpen, Headphones } from "lucide-react";

const PERSONAS = [
  {
    id: "general",
    icon: MessageCircle,
    color: "indigo",
    activeClass: "bg-indigo-500 text-white shadow-indigo-500/30",
    dotClass: "bg-indigo-400",
  },
  {
    id: "doctor",
    icon: Stethoscope,
    color: "emerald",
    activeClass: "bg-emerald-500 text-white shadow-emerald-500/30",
    dotClass: "bg-emerald-400",
  },
  {
    id: "legal",
    icon: Scale,
    color: "amber",
    activeClass: "bg-amber-500 text-white shadow-amber-500/30",
    dotClass: "bg-amber-400",
  },
  {
    id: "tutor",
    icon: BookOpen,
    color: "sky",
    activeClass: "bg-sky-500 text-white shadow-sky-500/30",
    dotClass: "bg-sky-400",
  },
  {
    id: "support",
    icon: Headphones,
    color: "rose",
    activeClass: "bg-rose-500 text-white shadow-rose-500/30",
    dotClass: "bg-rose-400",
  },
];

export default function PersonaSelector({ persona, setPersona }) {
  const { t } = useTranslation("common");

  return (
    <div className="w-full flex flex-col gap-2">
      <span className="text-xs text-white/40 uppercase tracking-widest text-center">
        {t("personaLabel")}
      </span>
      <div className="flex gap-2 flex-wrap justify-center">
        {PERSONAS.map(({ id, icon: Icon, activeClass, dotClass }) => {
          const isActive = persona === id;
          return (
            <button
              key={id}
              onClick={() => setPersona(id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all border
                ${
                  isActive
                    ? `${activeClass} shadow-lg border-transparent`
                    : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80 border-white/10"
                }`}
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{t(`persona_${id}`)}</span>
              {isActive && (
                <span className={`w-1.5 h-1.5 rounded-full ${dotClass} ml-0.5`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
