import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { Lang } from "./i18n";
import { translations } from "./i18n";

const LS_KEY = "tonyx_lang";

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, val: string): void {
  try { localStorage.setItem(key, val); } catch { /* ignore */ }
}

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

function isTelegramContext(): boolean {
  try {
    return !!(window as { Telegram?: { WebApp?: { initData?: string } } })?.Telegram?.WebApp?.initData;
  } catch { return false; }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = safeGet(LS_KEY) as Lang | null;
    return stored ?? "ru";
  });
  const [isChosen, setIsChosen] = useState<boolean>(() => {
    if (safeGet(LS_KEY)) return true;
    // In browser (non-Telegram) preview — auto-select RU so the UI is visible
    if (!isTelegramContext()) return true;
    return false;
  });

  const setLang = useCallback((l: Lang) => {
    safeSet(LS_KEY, l);
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
    <LanguageContext.Provider value={{ lang, t: translations[lang] as typeof translations.ru, setLang, isChosen }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  return useContext(LanguageContext);
}
