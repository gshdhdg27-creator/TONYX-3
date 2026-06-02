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

const DEV_USER: TelegramUser = {
  id: 99999999,
  username: "dev_user",
  first_name: "Dev",
  last_name: "User",
};

export function useTelegram() {
  const tg = getTg();
  const user = tg?.initDataUnsafe?.user;
  // initData is non-empty string only inside real Telegram WebApp
  const isInTelegram = !!(tg?.initData && tg.initData.length > 0);

  const isDev = import.meta.env.DEV && !isInTelegram;
  const effectiveUser = user ?? (isDev ? DEV_USER : undefined);

  return {
    telegramId: effectiveUser?.id?.toString() ?? null,
    username: effectiveUser?.username ?? null,
    firstName: effectiveUser?.first_name ?? null,
    lastName: effectiveUser?.last_name ?? null,
    photoUrl: effectiveUser?.photo_url ?? null,
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
