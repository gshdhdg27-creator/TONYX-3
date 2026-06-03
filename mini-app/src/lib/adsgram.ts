export const ADSGRAM_BLOCK_ID = import.meta.env.VITE_ADSGRAM_BLOCK_ID ?? "33819";

export type AdErrorReason =
  | "no_ads"      // AdsGram вернул "нет рекламы" — блок прогревается
  | "skipped"     // Пользователь закрыл рекламу до конца
  | "not_loaded"  // window.AdsGram не загружен (не Telegram или скрипт не подключён)
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
    console.warn("[AdsGram] window.AdsGram not available — script may not be loaded yet");
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
      // done=false means user skipped or no ad filled
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
