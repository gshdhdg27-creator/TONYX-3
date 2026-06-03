export const ADSGRAM_BLOCK_ID = import.meta.env.VITE_ADSGRAM_BLOCK_ID ?? "33819";

export type AdErrorReason =
  | "no_ads"      // AdsGram вернул "нет рекламы" — блок прогревается
  | "skipped"     // Пользователь закрыл рекламу до конца
  | "not_loaded"  // window.AdsGram не загружен — скрипт ещё не инициализировался
  | "network"     // Сетевая ошибка / таймаут
  | "unknown";    // Всё остальное

export interface AdError {
  reason: AdErrorReason;
  description?: string;
}

interface AdsGramResult {
  done: boolean;
  description?: string;
}

interface AdsGramController {
  show(): Promise<AdsGramResult>;
  destroy(): void;
}

interface AdsGramInitConfig {
  blockId: string;
  debug?: boolean;
  debugBannerType?: string;
}

interface AdsGramStatic {
  init(config: AdsGramInitConfig): AdsGramController;
}

declare global {
  interface Window {
    AdsGram?: AdsGramStatic;
  }
}

/**
 * Ждёт появления window.AdsGram с поллингом каждые 100мс.
 * Возвращает true если загрузился, false если истёк таймаут.
 */
export function waitForAdsGram(timeoutMs = 3000): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.AdsGram) return Promise.resolve(true);

  return new Promise((resolve) => {
    const interval = 100;
    let elapsed = 0;
    const timer = setInterval(() => {
      if (window.AdsGram) {
        clearInterval(timer);
        resolve(true);
        return;
      }
      elapsed += interval;
      if (elapsed >= timeoutMs) {
        clearInterval(timer);
        console.warn("[AdsGram] window.AdsGram not available after", timeoutMs, "ms");
        resolve(false);
      }
    }, interval);
  });
}

function classifyError(raw: unknown): AdErrorReason {
  const desc = (
    (raw as AdsGramResult)?.description ??
    (raw as Error)?.message ??
    String(raw)
  ).toLowerCase();

  if (desc.includes("no ad") || desc.includes("no_ad") || desc.includes("no fill") || desc.includes("empty")) {
    return "no_ads";
  }
  if (desc.includes("skip") || desc.includes("close") || desc.includes("dismiss") || desc.includes("cancel")) {
    return "skipped";
  }
  if (desc.includes("network") || desc.includes("timeout") || desc.includes("fetch") || desc.includes("connection")) {
    return "network";
  }
  return "unknown";
}

export function initAdController(blockId: string = ADSGRAM_BLOCK_ID): AdsGramController | null {
  if (typeof window === "undefined" || !window.AdsGram) {
    return null;
  }
  return window.AdsGram.init({ blockId });
}

export async function showRewardedAd({
  blockId = ADSGRAM_BLOCK_ID,
  onReward,
  onError,
  onSkip,
}: {
  blockId?: string;
  onReward: () => void;
  onError: (err: AdError) => void;
  onSkip?: () => void;
}): Promise<void> {
  // Wait up to 10s for script to initialise — mobile can be slow
  const loaded = await waitForAdsGram(10000);
  if (!loaded) {
    onError({ reason: "not_loaded" });
    return;
  }

  const AdController = initAdController(blockId);
  if (!AdController) {
    onError({ reason: "not_loaded" });
    return;
  }

  try {
    const result = await AdController.show();
    if (result.done) {
      onReward();
    } else {
      const reason = classifyError(result);
      if (reason === "skipped" && onSkip) {
        onSkip();
      } else {
        onError({ reason: reason === "unknown" ? "no_ads" : reason, description: result.description });
      }
    }
  } catch (raw) {
    const reason = classifyError(raw);
    console.warn("[AdsGram] Ad error:", reason, raw);
    if (reason === "skipped" && onSkip) {
      onSkip();
    } else {
      onError({ reason, description: (raw as AdsGramResult)?.description ?? (raw as Error)?.message });
    }
  }
}
