"use client";
import { useEffect, useState } from "react";
import i18n from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

const resources = {
  en: { translation: {} },
  hi: { translation: {} },
  mr: { translation: {} },
};

let initialized = false;

export default function I18nProvider({ children }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (initialized) { setReady(true); return; }
    initialized = true;
    i18n
      .use(LanguageDetector)
      .use(initReactI18next)
      .init({
        resources,
        fallbackLng: "en",
        interpolation: { escapeValue: false },
        detection: { order: ["navigator"] },
      })
      .then(() => setReady(true));
  }, []);

  if (!ready) return null;
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
