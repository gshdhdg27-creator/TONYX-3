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
    <div style={{ padding: "0 16px 32px" }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            background: "rgba(15,23,42,0.95)",
            border: "1px solid rgba(30,58,143,0.35)",
            borderRadius: 14,
            padding: "10px 14px",
            fontSize: 13,
            color: "#94a3b8",
          }}
        >
          {balances.ton.toFixed(3)} TON
        </div>
        <div
          style={{
            background: "rgba(15,23,42,0.95)",
            border: "1px solid rgba(30,58,143,0.35)",
            borderRadius: 14,
            padding: "10px 14px",
            fontSize: 13,
            color: "#94a3b8",
          }}
        >
          {balances.tonyx} TONYX
        </div>
      </div>

      <div style={{ marginBottom: 12, fontSize: 12, color: "#64748b" }}>
        {lang === "en" ? "Boss keys: " : "Ключи боссов: "}
        {[1, 2, 3, 4, 5].map((lv) => (
          <span key={lv} style={{ marginRight: 10 }}>
            Lv{lv}:{bossKeys[lv] ?? 0}
          </span>
        ))}
      </div>

      {lastReward && (
        <div
          style={{
            textAlign: "center",
            background: "rgba(22,163,74,0.12)",
            border: "1px solid rgba(74,222,128,0.3)",
            borderRadius: 16,
            padding: 16,
            marginBottom: 16,
            color: "#4ade80",
            fontWeight: 800,
            fontSize: 18,
          }}
        >
          {lastReward}
        </div>
      )}

      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "#94a3b8",
          marginBottom: 10,
          letterSpacing: "0.06em",
        }}
      >
        {lang === "en" ? "BOSS CASES" : "КЕЙСЫ БОССОВ"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
        {bossCases.map((c) => (
          <button
            key={c.id}
            onClick={() => openCase(c)}
            disabled={!c.canOpen || busyId === c.id}
            style={{
              textAlign: "left",
              background: "rgba(15,23,42,0.95)",
              border: `1px solid ${c.canOpen ? "rgba(245,158,11,0.45)" : "rgba(30,58,143,0.35)"}`,
              borderRadius: 16,
              padding: "14px 16px",
              color: "#e2e8f0",
              fontFamily: "inherit",
              cursor: c.canOpen ? "pointer" : "not-allowed",
              opacity: c.canOpen ? 1 : 0.55,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>
              {lang === "en" ? c.nameEn : c.nameRu}
            </div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{costLabel(c, lang)}</div>
            <div style={{ fontSize: 12, color: c.canOpen ? "#fbbf24" : "#475569", marginTop: 6 }}>
              {busyId === c.id
                ? lang === "en"
                  ? "Opening..."
                  : "Открываем..."
                : c.canOpen
                  ? lang === "en"
                    ? "Tap to open"
                    : "Нажми, чтобы открыть"
                  : lang === "en"
                    ? "Need a key — beat this boss"
                    : "Нужен ключ — победи этого босса"}
            </div>
          </button>
        ))}
      </div>

      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "#94a3b8",
          marginBottom: 10,
          letterSpacing: "0.06em",
        }}
      >
        {lang === "en" ? "PAID CASES" : "ПЛАТНЫЕ КЕЙСЫ"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {paidCases.map((c) => (
          <button
            key={c.id}
            onClick={() => openCase(c)}
            disabled={!c.canOpen || busyId === c.id}
            style={{
              textAlign: "left",
              background: "rgba(15,23,42,0.95)",
              border: `1px solid ${c.canOpen ? "rgba(34,211,238,0.4)" : "rgba(30,58,143,0.35)"}`,
              borderRadius: 16,
              padding: "14px 16px",
              color: "#e2e8f0",
              fontFamily: "inherit",
              cursor: c.canOpen ? "pointer" : "not-allowed",
              opacity: c.canOpen ? 1 : 0.55,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>
              {lang === "en" ? c.nameEn : c.nameRu}
            </div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{costLabel(c, lang)}</div>
            <div style={{ fontSize: 12, color: c.canOpen ? "#22d3ee" : "#475569", marginTop: 6 }}>
              {busyId === c.id
                ? lang === "en"
                  ? "Opening..."
                  : "Открываем..."
                : c.canOpen
                  ? lang === "en"
                    ? "Tap to open"
                    : "Нажми, чтобы открыть"
                  : lang === "en"
                    ? "Not enough balance"
                    : "Недостаточно средств"}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
