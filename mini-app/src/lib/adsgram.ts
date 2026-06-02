export const ADSGRAM_BLOCK_ID = import.meta.env.VITE_ADSGRAM_BLOCK_ID ?? "33819";

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
}: {
  blockId?: string;
  onReward: () => void;
  onError: (result?: AdsGramResult) => void;
}): Promise<void> {
  const AdController = initAdController(blockId);
  if (!AdController) {
    onError();
    return;
  }

  try {
    const result = await AdController.show();
    if (result.done) {
      onReward();
    } else {
      onError(result);
    }
  } catch (result) {
    console.error("[AdsGram] Ad error or skipped", result);
    onError(result as AdsGramResult);
  }
}
