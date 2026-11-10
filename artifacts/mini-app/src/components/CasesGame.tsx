import { useEffect, useRef, useState, type CSSProperties } from "react";
import { casesApi, type CaseListItem, type CaseRewardPreview } from "@/lib/casesApi";
import { haptic, hapticNotify } from "@/lib/telegram";
import { getCasesCache, setCasesCache, refreshCasesInBackground } from "@/lib/dataCache";

type Lang = "ru" | "en";
type Reward = {
  type: string;
  amount?: number;
  nftId?: string;
  imageUrl?: string | null;
  valueTon?: number | null;
  label?: string;
};

const TON_IMG = "https://ton.org/download/ton_symbol.png";
const TONYX_IMG = "/tonyx-coin.png";

function costLabel(c: CaseListItem, lang: Lang): string {
  if (c.costType === "key") {
    return lang === "en" ? `Boss ${c.costValue} · ${c.have}` : `Босс ${c.costValue} · ${c.have}`;
  }
  if (c.costType === "ton") return `${c.costValue} TON`;
  return `${c.costValue} TX`;
}

export default function CasesGame({
  lang = "ru",
  onBalances,
}: {
  lang?: Lang;
  onBalances?: (b: { ton: number; tonyx: number }) => void;
}) {
  const [cases, setCases] = useState<CaseListItem[]>(() => getCasesCache()?.cases ?? []);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CaseListItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [won, setWon] = useState<Reward | null>(null);
  const [filter, setFilter] = useState<"all" | "key" | "ton">("all");

  const load = async () => {
    setError(null);
    try {
      const data = await casesApi.list();
      setCasesCache(data);
      setCases(data.cases ?? []);
      onBalances?.(data.balances);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
      setCases([]);
    }
  };

  useEffect(() => {
    const hit = getCasesCache();
    if (hit?.cases?.length) {
      setCases(hit.cases);
      onBalances?.(hit.balances);
      void refreshCasesInBackground().then(() => {
        const next = getCasesCache();
        if (next?.cases) {
          setCases(next.cases);
          onBalances?.(next.balances);
        }
      });
    } else {
      void load();
    }
  }, []);

  const openCase = async (c: CaseListItem) => {
    if (busy || spinning || !c.canOpen) return;
    setBusy(true);
    setError(null);
    haptic("medium");
    try {
      // Server deducts cost + credits reward immediately (safe if client leaves).
      const res = await casesApi.open(c.id);
      const raw = (res as { rewards?: Reward[]; reward?: Reward }).rewards?.[0]
        ?? (res as { reward?: Reward }).reward
        ?? { type: "tonyx", amount: 0 };
      const reward: Reward = {
        type: raw.type,
        amount: raw.amount,
        nftId: raw.nftId,
        imageUrl: (raw as Reward).imageUrl,
        valueTon: (raw as Reward).valueTon ?? null,
        label: (raw as Reward).label,
      };

      const finalBal = res.balances;
      const midBal = { ton: finalBal.ton, tonyx: finalBal.tonyx };
      if (reward.type === "ton" && reward.amount) {
        midBal.ton = Math.round((finalBal.ton - Number(reward.amount)) * 1e8) / 1e8;
      } else if (reward.type === "tonyx" && reward.amount) {
        midBal.tonyx = Math.max(0, finalBal.tonyx - Math.floor(Number(reward.amount)));
      }
      // Show cost deducted immediately
      onBalances?.(midBal);

      setCases((prev) =>
        prev.map((x) => {
          if (x.id !== c.id) return x;
          if (x.costType === "key") {
            const have = Math.max(0, x.have - 1);
            return { ...x, have, canOpen: have >= 1 };
          }
          if (x.costType === "ton") {
            return { ...x, have: midBal.ton, canOpen: midBal.ton >= x.costValue };
          }
          return { ...x, have: midBal.tonyx, canOpen: midBal.tonyx >= x.costValue };
        }),
      );
      setSelected((s) => {
        if (!s || s.id !== c.id) return s;
        if (s.costType === "key") {
          const have = Math.max(0, s.have - 1);
          return { ...s, have, canOpen: have >= 1 };
        }
        if (s.costType === "ton") return { ...s, have: midBal.ton, canOpen: midBal.ton >= s.costValue };
        return { ...s, have: midBal.tonyx, canOpen: midBal.tonyx >= s.costValue };
      });

      setSpinning(true);
      setWon(null);
      // Short spin then reveal reward on balance after 1s
      window.setTimeout(() => {
        setSpinning(false);
        setWon(reward);
        hapticNotify("success");
        window.setTimeout(() => {
          onBalances?.(finalBal);
          setCases((prev) =>
            prev.map((x) => {
              if (x.costType === "ton") return { ...x, have: finalBal.ton, canOpen: finalBal.ton >= x.costValue };
              if (x.costType === "tonyx") return { ...x, have: finalBal.tonyx, canOpen: finalBal.tonyx >= x.costValue };
              return x;
            }),
          );
        }, 1000);
      }, 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Open failed");
      hapticNotify("error");
    } finally {
      setBusy(false);
    }
  };

  const visible = cases.filter((c) => {
    if (filter === "all") return true;
    if (filter === "key") return c.costType === "key";
    return c.costType === "ton" || c.costType === "tonyx";
  });

  if (selected) {
    const rewards = selected.possibleRewards ?? [];
    return (
      <div style={pageStyle}>
        <button type="button" onClick={() => { if (!spinning) { setSelected(null); setWon(null); } }} style={backBtn}>
          ← {lang === "en" ? "Back" : "Назад"}
        </button>
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 22, color: "#F8FAFC" }}>
            {lang === "en" ? selected.nameEn : selected.nameRu}
          </div>
          <div style={{ marginTop: 6, color: "#FDE68A", fontWeight: 800, fontSize: 13 }}>
            {costLabel(selected, lang)}
          </div>
        </div>
        {error && <div style={errBox} onClick={() => setError(null)}>{error}</div>}
        {won && (
          <div style={{ textAlign: "center", padding: 20, marginBottom: 12, borderRadius: 16, background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)" }}>
            <div style={{ fontWeight: 900, fontSize: 18, color: "#4ade80" }}>
              {won.type === "ton" ? `+${won.amount} TON` : won.type === "tonyx" ? `+${won.amount} TONYX` : (lang === "en" ? "NFT reward" : "Награда NFT")}
            </div>
          </div>
        )}
        <button
          type="button"
          disabled={!selected.canOpen || busy || spinning}
          onClick={() => openCase(selected)}
          style={{
            width: "100%", padding: "14px 0", borderRadius: 14, border: "none",
            background: selected.canOpen ? "linear-gradient(135deg,#7c3aed,#a855f7)" : "#3f3f46",
            color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit",
            opacity: selected.canOpen && !busy && !spinning ? 1 : 0.65,
          }}
        >
          {spinning ? (lang === "en" ? "Opening..." : "Открываем...") : selected.canOpen ? (lang === "en" ? "Open case" : "Открыть кейс") : (lang === "en" ? "Not enough" : "Не хватает")}
          {" · "}{costLabel(selected, lang)}
        </button>
        <div style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#E2E8F0", marginBottom: 10 }}>
            {lang === "en" ? "Possible rewards" : "Возможные награды"}
          </div>
          {rewards.map((r, i) => (
            <div key={i} style={{ padding: "8px 10px", marginBottom: 6, borderRadius: 10, background: "rgba(15,23,42,0.6)", fontSize: 13, color: "#cbd5e1" }}>
              {lang === "en" ? (r.labelEn ?? r.type) : (r.labelRu ?? r.type)} · {r.weight}%
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ fontWeight: 900, fontSize: 26, color: "#F8FAFC" }}>
        {lang === "en" ? "Cases" : "Кейсы"}
      </div>
      <div style={{ display: "flex", gap: 8, margin: "14px 0" }}>
        {([
          ["all", lang === "en" ? "All" : "Все"],
          ["key", lang === "en" ? "Boss keys" : "Ключи"],
          ["ton", "TON"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 12,
              border: filter === id ? "1px solid rgba(168,85,247,0.5)" : "1px solid rgba(255,255,255,0.08)",
              background: filter === id ? "rgba(124,58,237,0.35)" : "rgba(15,23,42,0.55)",
              color: filter === id ? "#f5f3ff" : "#94a3b8",
              fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <div style={errBox} onClick={() => setError(null)}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {visible.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => { haptic("light"); setSelected(c); setWon(null); }}
            style={{
              textAlign: "left", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16,
              background: "rgba(15,23,42,0.8)", padding: 12, cursor: "pointer",
              color: "inherit", fontFamily: "inherit",
            }}
          >
            <div style={{ fontWeight: 800, color: "#F8FAFC", fontSize: 14 }}>
              {lang === "en" ? c.nameEn : c.nameRu}
            </div>
            <div style={{ marginTop: 6, color: c.canOpen ? "#4ade80" : "#f87171", fontWeight: 700, fontSize: 12 }}>
              {costLabel(c, lang)}
            </div>
          </button>
        ))}
      </div>
      {visible.length === 0 && (
        <div style={{ textAlign: "center", color: "#64748b", padding: 40, fontSize: 13 }}>
          {lang === "en" ? "No cases" : "Нет кейсов"}
        </div>
      )}
    </div>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100%", color: "#e2e8f0", fontFamily: "inherit",
  padding: "16px 14px 28px",
};
const backBtn: CSSProperties = {
  marginBottom: 12, background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12,
  padding: "9px 14px", color: "#c4b5fd", fontSize: 13, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit",
};
const errBox: CSSProperties = {
  marginBottom: 12, padding: "10px 12px", borderRadius: 12,
  background: "rgba(239,68,68,0.15)", color: "#fca5a5", fontSize: 13,
  fontWeight: 600, cursor: "pointer",
};
