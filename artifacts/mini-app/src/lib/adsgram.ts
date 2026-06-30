export const ADSGRAM_BLOCK_ID = import.meta.env.VITE_ADSGRAM_BLOCK_ID ?? "33819";

export interface AdError {
  reason: "no_ads" | "skipped" | "not_loaded" | "network" | "unknown";
  description?: string;
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

interface AdsGramStatic {
  init(config: { blockId: string; debug?: boolean }): AdsGramController;
}

declare global {
  interface Window {
    Adsgram?: AdsGramStatic; // official SDK name (lowercase g)
    AdsGram?: AdsGramStatic; // alias sometimes used
  }
}

function getAdsgram(): AdsGramStatic | null {
  // The official sad.min.js exposes window.Adsgram (lowercase g)
  return window.Adsgram ?? window.AdsGram ?? null;
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
  const sdk = getAdsgram();

  if (!sdk) {
    console.error("[AdsGram] window.Adsgram is not defined — script not loaded");
    onError({ reason: "not_loaded", description: "AdsGram SDK not available" });
    return;
  }

  const AdController = sdk.init({ blockId });

  try {
    const result = await AdController.show();

    console.log("[AdsGram] show() result:", result);

    if (result.done) {
      onReward();
    } else {
      // done=false → user closed before finishing
      if (onSkip) onSkip();
    }
  } catch (error) {
    console.error("[AdsGram] show() error:", error);

    const desc = String(
      (error as AdsGramResult)?.description ??
      (error as Error)?.message ??
      error
    ).toLowerCase();

    let reason: AdError["reason"] = "unknown";
    if (desc.includes("no ad") || desc.includes("no fill") || desc.includes("empty") || desc.includes("inventory")) {
      reason = "no_ads";
    } else if (desc.includes("network") || desc.includes("timeout") || desc.includes("fetch")) {
      reason = "network";
    } else if (desc.includes("skip") || desc.includes("cancel") || desc.includes("close")) {
      reason = "skipped";
    }

    if (reason === "skipped" && onSkip) {
      onSkip();
    } else {
      onError({
        reason,
        description: String((error as AdsGramResult)?.description ?? (error as Error)?.message ?? error),
      });
    }
  }
}
