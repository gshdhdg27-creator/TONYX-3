/**
 * Igromanya uses the same premium Mines game as Solo.
 */
import MinesGame from "@/components/MinesGame";
import { useLang } from "@/lib/LanguageContext";

interface Props {
  telegramId: string;
  tonBalance: number;
  onBalanceChange: () => void;
}

export default function IgromanyaGame({
  telegramId,
  tonBalance,
  onBalanceChange,
}: Props) {
  const { lang } = useLang();

  return (
    <MinesGame
      telegramId={telegramId}
      balance={tonBalance}
      lang={lang}
      onBalanceChange={onBalanceChange}
    />
  );
}
