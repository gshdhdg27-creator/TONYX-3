/**
 * Igromanya was a duplicate of Mines with a separate API (/games/igro).
 * It now reuses the same MinesGame UI + /api/mini/games/mines backend
 * so Solo / any entry that opens Igromanya behaves exactly like Mines.
 */
import { MinesGame } from "@/pages/games";
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
