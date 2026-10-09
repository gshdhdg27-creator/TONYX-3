import { useState } from "react";
import { useLang } from "@/lib/LanguageContext";
import CasesGame from "@/components/CasesGame";

export default function CasesPage() {
  const { lang } = useLang();
  const [, setTick] = useState(0);
  return (
    <div style={{ minHeight: "100dvh", paddingBottom: 110 }}>
      <CasesGame lang={lang} onBalanceChange={() => setTick((n) => n + 1)} />
    </div>
  );
}
