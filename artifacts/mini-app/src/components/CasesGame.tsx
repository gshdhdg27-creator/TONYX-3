import { useEffect, useState } from "react";
import { casesApi, type CaseListItem } from "@/lib/casesApi";
import { haptic, hapticNotify } from "@/lib/telegram";

type Lang = "ru" | "en";

function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  const bg = type === "success" ? "rgba(22,163,74,0.95)" : "rgba(220,38,38,0.95)";
  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        background: bg,
        color: "#fff",
        padding: "12px 20px",
        borderRadius: 12,
        fontSize: 14,
        fontWeight: 600,
        zIndex: 9999,
        maxWidth: "calc(100% - 32px)",
        boxShadow: "0 8px 28px rgba(0,0,0,0.5)",
      }}
    >
      {msg}
    </div>
  );
}

function costLabel(c: CaseListItem, lang: Lang): string {
  if (c.costType === "key") {
    return lang === "en"
      ? `Key Lv.${c.costValue} · have ${c.have}`
      : `Ключ ур.${c.costValue} · есть ${c.have}`;
  }
  if (c.costType === "ton") {
    return `${c.costValue} TON`;
  }
  return `${c.costValue} TONYX`;
}

export default function CasesGame({
  lang,
  onBalanceChange,
}: {
  lang: Lang;
  onBalanceChange: () => void;
}) {
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [bossKeys, setBossKeys] = useState<Record<number, number>>({});
  const [balances, setBalances] = useState({ ton: 0, tonyx: 0 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [lastReward, setLastReward] = useState<string | null>(null);

  const flash = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  const load = async () => {
    try {
      const data = await casesApi.list();
      setCases(data.cases);
      setBossKeys(data.bossKeys);
      setBalances(data.balances);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Error", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCase = async (c: CaseListItem) => {
    if (busyId || !c.canOpen) return;
    haptic("medium");
    setBusyId(c.id);
    setLastReward(null);
    try {
      const res = await casesApi.open(c.id);
      const r = res.rewards[0];
      let text = "";
      if (r?.type === "ton") text = `+${r.amount} TON`;
      else if (r?.type === "tonyx") text = `+${r.amount} TONYX`;
      else if (r?.type === "nft_fragment") text = `Fragment: ${r.nftId}`;
      setLastReward(text);
      setBalances(res.balances);
      setBossKeys(res.bossKeys);
      hapticNotify("success");
      flash(text || (lang === "en" ? "Opened!" : "Открыто!"), "success");
      onBalanceChange();
      await load();
    } catch (e) {
      hapticNotify("error");
      flash(e instanceof Error ? e.message : "Error", "error");
    } finally {
      setBusyId(null);
    }
  };

  const bossCases = cases.filter((c) => c.costType === "key");
  const paidCases = cases.filter((c) => c.costType !== "key");

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>
        {lang === "en" ? "Loading..." : "Загрузка..."}
      </div>
    );
  }

  return (
    <div style={{ padding: "0 16px 32px" 
