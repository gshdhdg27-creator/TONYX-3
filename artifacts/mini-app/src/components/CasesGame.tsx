import { useEffect, useRef, useState } from "react";
import { casesApi, type CaseListItem, type CaseRewardPreview } from "@/lib/casesApi";
import { haptic, hapticNotify } from "@/lib/telegram";

type Reward = { type: string; amount?: number; nftId?: string; name?: string };

const ITEM_W = 88;

function caseImage(c: CaseListItem): string | null {
  return (c as { imageUrl?: string }).imageUrl ?? null;
}

function artFor(id: string) {
  return { emoji: "📦", glow: "rgba(168,85,247,0.35)" };
}

function buildStrip(reward: Reward): Reward[] {
  const pool: Reward[] = [
    { type: "tonyx", amount: 50 },
    { type: "tonyx", amount: 100 },
    { type: "ton", amount: 0.1 },
    { type: "tonyx", amount: 200 },
    { type: "key", amount: 1 },
    { type: "tonyx", amount: 500 },
    { type: "ton", amount: 0.5 },
    { type: "tonyx", amount: 80 },
  ];
  const items: Reward[] = [];
  for (let i = 0; i < 40; i++) items.push(pool[i % pool.length]!);
  items[34] = reward;
  return items;
}

function rewardLabel(r: Reward) {
  if (r.type === "ton") return `${r.amount ?? 0} TON`;
  if (r.type === "tonyx") return `${r.amount ?? 0} TX`;
  if (r.type === "key") return `🔑 ${r.amount ?? 1}`;
  return r.name ?? r.nftId ?? r.type;
}

export default function CasesGame({
  lang,
  onBalanceChange,
  onBalances,
}: {
  lang: string;
  onBalanceChange?: () => void;
  onBalances?: (b: { ton: number; tonyx: number }) => void;
}) {
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CaseListItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [strip, setStrip] = useState<Reward[]>([]);
  const [offset, setOffset] = useState(0);
  const [won, setWon] = useState<Reward | null>(null);
  const [multiplier, setMultiplier] = useState(1);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<number | null>(null);

  const load = async () => {
    setError(null);
    try {
      const data = await casesApi.list();
      setCases(data.cases ?? []);
      onBalances?.(data.balances);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
      setCases([]);
    }
  };

  useEffect(() => {
    load();
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const openCase = async (c: CaseListItem) => {
    if (busy || spinning || !c.canOpen) return;
    setBusy(true);
    setError(null);
    haptic("medium");
    try {
      const res = await casesApi.open(c.id);
      const reward: Reward = res.rewards?.[0] ?? { type: "tonyx", amount: 0 };
      onBalances?.(res.balances);
      setCases((prev) =>
        prev.map((x) => {
          if (x.id !== c.id) return x;
          if (x.costType === "key") {
            const have = Math.max(0, x.have - 1);
            return { ...x, have, canOpen: have >= x.costValue };
          }
          if (x.costType === "ton") {
            const have = res.balances.ton;
            return { ...x, have, canOpen: have >= x.costValue };
          }
          const have = res.balances.tonyx;
          return { ...x, have, canOpen: have >= x.costValue };
        })
      );
      setSelected((s) => {
        if (!s || s.id !== c.id) return s;
        if (s.costType === "key") {
          const have = Math.max(0, s.have - 1);
          return { ...s, have, canOpen: have >= s.costValue };
        }
        if (s.costType === "ton") return { ...s, have: res.balances.ton, canOpen: res.balances.ton >= s.costValue };
        return { ...s, have: res.balances.tonyx, canOpen: res.balances.tonyx >= s.costValue };
      });

      const items = buildStrip(reward);
      setStrip(items);
      setOffset(0);
      setSpinning(true);
      setWon(null);

      const box = stripRef.current;
      const viewW = box?.clientWidth ?? 320;
      const target = 34 * ITEM_W + 40 - viewW / 2;
      const duration = 4200;
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const ease = 1 - Math.pow(1 - t, 3);
        setOffset(target * ease);
        if (t < 1) {
          animRef.current = requestAnimationFrame(tick);
        } else {
          setSpinning(false);
          setWon(reward);
          hapticNotify("success");
          onBalanceChange?.();
        }
      };
      animRef.current = requestAnimationFrame(tick);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Open failed");
      hapticNotify("error");
    } finally {
      setBusy(false);
    }
  };

  if (selected) {
    const art = artFor(selected.id);
    const heroImg = caseImage(selected);
    const rewards = selected.possibleRewards ?? [];
    const totalWeight = rewards.reduce((s, r) => s + r.weight, 0) || 1;

    return (
      <div style={pageStyle}>
        <button type="button" onClick={() => { setSelected(null); setWon(null); setSpinning(false); }} style={backBtn}>
          ← Назад
        </button>
        <div style={{ textAlign: "center", padding: "8px 16px" }}>
          <div style={{ fontSize: 22, fontWeight: 900 }}>{selected.nameRu}</div>
          <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
            {selected.costType === "key" ? `🔑 ${selected.costValue}` : selected.costType === "ton" ? `${selected.costValue} TON` : `${selected.costValue} TX`}
          </div>
        </div>

        <div ref={stripRef} style={{ overflow: "hidden", margin: "16px 0", position: "relative", height: 100 }}>
          <div style={{ display: "flex", transform: `translateX(${-offset}px)`, gap: 8, paddingLeft: 16 }}>
            {strip.map((r, i) => (
              <div key={i} style={{ width: ITEM_W, height: 88, borderRadius: 12, background: "rgba(30,41,59,0.9)", border: "1px solid rgba(148,163,184,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 12, fontWeight: 800, color: "#e2e8f0" }}>
                {rewardLabel(r)}
              </div>
            ))}
          </div>
          <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, background: "#a855f7", transform: "translateX(-50%)", zIndex: 2 }} />
        </div>

        {won && (
          <div style={{ textAlign: "center", padding: 16, color: "#4ade80", fontWeight: 900, fontSize: 18 }}>
            Выигрыш: {rewardLabel(won)}
          </div>
        )}

        <div style={{ padding: 16 }}>
          <button
            type="button"
            disabled={busy || spinning || !selected.canOpen}
            onClick={() => void openCase(selected)}
            style={{
              width: "100%",
              padding: "14px 0",
              borderRadius: 14,
              border: "none",
              background: selected.canOpen && !busy && !spinning ? "linear-gradient(135deg,#7c3aed,#a855f7)" : "rgba(51,65,85,0.5)",
              color: "#fff",
              fontWeight: 900,
              fontSize: 15,
              cursor: selected.canOpen ? "pointer" : "not-allowed",
              fontFamily: "inherit",
            }}
          >
            {spinning ? "Крутится…" : busy ? "…" : "Открыть"}
          </button>
        </div>

        {error && <div style={{ color: "#f87171", textAlign: "center", padding: 8 }}>{error}</div>}
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ padding: "16px 16px 8px" }}>
        <div style={{ fontSize: 24, fontWeight: 900 }}>Кейсы</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>Открывай и выигрывай</div>
      </div>

      {error && <div style={{ color: "#f87171", padding: "0 16px 8px" }}>{error}</div>}

      <div style={{ padding: "8px 16px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {cases.map((c) => {
          const img = caseImage(c);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelected(c)}
              style={{
                textAlign: "left",
                borderRadius: 18,
                border: "1px solid rgba(168,85,247,0.3)",
                background: "linear-gradient(160deg, rgba(30,20,50,0.95), rgba(15,23,42,0.98))",
                padding: 12,
                cursor: "pointer",
                fontFamily: "inherit",
                color: "#e2e8f0",
              }}
            >
              <div style={{ height: 72, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                {img ? (
                  <img src={img} alt="" style={{ maxHeight: 64, maxWidth: "100%", objectFit: "contain" }} />
                ) : (
                  <span style={{ fontSize: 36 }}>📦</span>
                )}
              </div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{c.nameRu}</div>
              <div style={{ fontSize: 11, color: "#a78bfa", marginTop: 4 }}>
                {c.costType === "key" ? `🔑 ${c.costValue}` : c.costType === "ton" ? `${c.costValue} TON` : `${c.costValue} TX`}
              </div>
            </button>
          );
        })}
      </div>

      {cases.length === 0 && (
        <div style={{ textAlign: "center", color: "#64748b", padding: 32, fontSize: 13 }}>Пока нет кейсов</div>
      )}
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100%",
  background: "radial-gradient(ellipse at 50% 0%, #2e1065 0%, #0a0612 55%)",
  color: "#e2e8f0",
  fontFamily: "inherit",
  paddingBottom: 24,
};

const backBtn: React.CSSProperties = {
  margin: "12px 16px",
  background: "rgba(255,255,255,0.06)",
  border: "none",
  borderRadius: 10,
  padding: "8px 14px",
  color: "#94a3b8",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};
