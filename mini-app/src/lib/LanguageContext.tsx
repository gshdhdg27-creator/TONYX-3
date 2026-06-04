import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { Lang } from "./i18n";
import { translations } from "./i18n";

const LS_KEY = "tonyx_lang";

interface LangCtx {
  lang: Lang;
  t: typeof translations.ru;
  setLang: (l: Lang) => void;
  isChosen: boolean;
}

const LanguageContext = createContext<LangCtx>({
  lang: "ru",
  t: translations.ru,
  setLang: () => {},
  isChosen: false,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const stored = localStorage.getItem(LS_KEY) as Lang | null;
  const [lang, setLangState] = useState<Lang>(stored ?? "ru");
  const [isChosen, setIsChosen] = useState<boolean>(!!stored);

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(LS_KEY, l);
    setLangState(l);
    setIsChosen(true);
  }, []);

  // Sync to backend when language changes (fire-and-forget)
  useEffect(() => {
    if (!isChosen) return;
    const telegramId = (window as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id?: number } } } } })
      ?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (!telegramId) return;
    fetch("/api/mini/language", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId: String(telegramId), language: lang }),
    }).catch(() => {});
  }, [lang, isChosen]);

  return (
    <LanguageContext.Provider value={{ lang, t: translations[lang], setLang, isChosen }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  return useContext(LanguageContext);
}
