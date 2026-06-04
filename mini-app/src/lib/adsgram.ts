// ─── TEST MODE ────────────────────────────────────────────────────────────────
// Set IS_TEST_MODE = true to use AdsGram's built-in debug banner (no real inventory
// needed). Switch to false in production once block 33819 has live inventory.
export const IS_TEST_MODE = true;

export const ADSGRAM_BLOCK_ID = import.meta.env.VITE_ADSGRAM_BLOCK_ID ?? "33819";

// AdsGram official test block ID — works even with empty inventory
const TEST_BLOCK_ID = "33819"; // same block, but debug:true forces a test banner

export type AdErrorReason =
  | "no_ads"      // AdsGram вернул "нет рекламы" — блок прогревается
  | "skipped"     // Пользователь закрыл рекламу до конца
  | "not_loaded"  // window.AdsGram не загружен — скрипт ещё не инициализировался
  | "network"     // Сетевая ошибка / таймаут
  | "unknown";    // Всё остальное

export interface AdError {
  reason: AdErrorReason;
  description?: string;
  raw?: string; // raw error text for debugging
}

interface AdsGramResult {
  done: boolean;
  description?: string;
  [key: string]: unknown;
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
    const step = 100;
    let elapsed = 0;
    const timer = setInterval(() => {
      if (window.AdsGram) {
        clearInterval(timer);
        resolve(true);
        return;
      }
      elapsed += step;
      if (elapsed >= timeoutMs) {
        clearInterval(timer);
        console.warn("[AdsGram] window.AdsGram not available after", timeoutMs, "ms");
        resolve(false);
      }
    }, step);
  });
}

function rawText(raw: unknown): string {
  try {
    if (raw === null || raw === undefined) return String(raw);
    if (typeof raw === "string") return raw;
    // Prefer description field (AdsGram result shape)
    if (typeof (raw as AdsGramResult).description === "string") return (raw as AdsGramResult).description as string;
    if (raw instanceof Error) return raw.message;
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

function classifyError(raw: unknown): AdErrorReason {
  const desc = rawText(raw).toLowerCase();

  console.error("[AdsGram] Raw error text:", rawText(raw));
  console.error("[AdsGram] Full error object:", JSON.stringify(raw, null, 2));

  if (desc.includes("no ad") || desc.includes("no_ad") || desc.includes("no fill") ||
      desc.includes("empty") || desc.includes("not found") || desc.includes("404") ||
      desc.includes("блок") || desc.includes("inventory") || desc.includes("show limit")) {
    return "no_ads";
  }
  if (desc.includes("skip") || desc.includes("close") || desc.includes("dismiss") ||
      desc.includes("cancel") || desc.includes("closed") || desc.includes("stopped")) {
    return "skipped";
  }
  if (desc.includes("network") || desc.includes("timeout") || desc.includes("fetch") ||
      desc.includes("connection") || desc.includes("failed to fetch")) {
    return "network";
  }
  return "unknown";
}

export function initAdController(blockId: string = ADSGRAM_BLOCK_ID): AdsGramController | null {
  if (typeof window === "undefined" || !window.AdsGram) {
    return null;
  }
  if (IS_TEST_MODE) {
    console.info("[AdsGram] 🧪 TEST MODE — using debug banner");
    return window.AdsGram.init({ blockId: TEST_BLOCK_ID, debug: true, debugBannerType: "FullscreenMedia" });
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
    console.error("[AdsGram] Script never loaded (window.AdsGram missing after 10s)");
    onError({ reason: "not_loaded", description: "AdsGram script not available" });
    return;
  }

  const AdController = initAdController(blockId);
  if (!AdController) {
    console.error("[AdsGram] initAdController returned null — window.AdsGram exists but init failed");
    onError({ reason: "not_loaded", description: "Controller init failed" });
    return;
  }

  try {
    console.info("[AdsGram] Calling AdController.show() for block:", IS_TEST_MODE ? TEST_BLOCK_ID + " (test)" : blockId);
    const result = await AdController.show();

    console.info("[AdsGram] show() result:", JSON.stringify(result));

    if (result.done) {
      console.info("[AdsGram] ✅ Ad watched successfully");
      onReward();
    } else {
      // done=false: user closed early or no fill
      const reason = classifyError(result);
      console.warn("[AdsGram] done=false, classified as:", reason);
      if (reason === "skipped" && onSkip) {
        onSkip();
      } else {
        onError({ reason: reason === "unknown" ? "no_ads" : reason, description: result.description, raw: rawText(result) });
      }
    }
  } catch (raw) {
    const reason = classifyError(raw);
    console.error("[AdsGram] show() threw, classified as:", reason);
    if (reason === "skipped" && onSkip) {
      onSkip();
    } else {
      onError({ reason, description: rawText(raw), raw: rawText(raw) });
    }
  }
}
