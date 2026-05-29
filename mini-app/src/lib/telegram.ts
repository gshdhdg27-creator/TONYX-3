export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
  photo_url?: string;
}

export interface TelegramWebApp {
  initData?: string;
  initDataUnsafe?: { user?: TelegramUser; start_param?: string };
  ready(): void;
  expand(): void;
  close(): void;
  MainButton: {
    text: string;
    show(): void;
    hide(): void;
    onClick(fn: () => void): void;
  };
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy"): void;
    notificationOccurred(type: "success" | "warning" | "error"): void;
  };
  colorScheme?: "light" | "dark";
}

function getTg(): TelegramWebApp | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } })
    .Telegram?.WebApp;
}

export function useTelegram() {
  const tg = getTg();
  const user = tg?.initDataUnsafe?.user;
  // initData is non-empty string only inside real Telegram WebApp
  const isInTelegram = !!(tg?.initData && tg.initData.length > 0);
  return {
    telegramId: user?.id?.toString() ?? null,
    username: user?.username ?? null,
    firstName: user?.first_name ?? null,
    lastName: user?.last_name ?? null,
    photoUrl: user?.photo_url ?? null,
    startParam: tg?.initDataUnsafe?.start_param ?? null,
    isInTelegram,
    tg,
  };
}

export function initTelegram() {
  const tg = getTg();
  if (tg) {
    tg.ready();
    tg.expand();
  }
}

export function haptic(type: "light" | "medium" | "heavy" = "medium") {
  getTg()?.HapticFeedback?.impactOccurred(type);
}

export function hapticNotify(type: "success" | "warning" | "error") {
  getTg()?.HapticFeedback?.notificationOccurred(type);
}
