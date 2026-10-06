import { useEffect, useMemo, useRef, useState } from "react";
import { casesApi, type CaseListItem } from "@/lib/casesApi";
import { haptic, hapticNotify } from "@/lib/telegram";

type Lang = "ru" | "en";

type Reward = {
  type: "ton" | "tonyx" | "nft_fragment";
  amount?: number;
  nftId?: string;
};

const CASE_ART: Record<
  string,
  { emoji: string; gradient: string; glow: string }
> = {
  boss_1: {
    emoji: "🌑",
    gradient: "linear-gradient(145deg,#1e1b4b,#312e81 50%,#0f172a)",
    glow: "rgba(99,102,241,0.45)",
  },
  boss_2: {
    emoji: "🔥",
    gradient: "linear-gradient(145deg,#7f1d1d,#ea580c 50%,#1c1917)",
    glow: "rgba(249,115,22,0.5)",
  },
  boss_3: {
    emoji: "🌋",
    gradient: "linear-gradient(145deg,#7c2d12,#b91c1c 50%,#450a0a)",
    glow: "rgba(239,68,68,0.5)",
  },
  boss_4: {
    emoji: "⚡",
    gradient: "linear-gradient(145deg,#0c4a6e,#0369a1 50%,#082f49)",
    glow: "rgba(56,189,248,0.45)",
  },
  boss_5: {
    emoji: "👑",
    gradient: "linear-gradient(145deg,#713f12,#eab308 45%,#422006)",
    glow: "rgba(234,179,8,0.55)",
  },
  ton_basic: {
    emoji: "💎",
    gradient: "linear-gradient(145deg,#0e7490,#22d3ee 50%,#083344)",
    glow: "rgba(34,211,238,0.45)",
  },
  tonyx_basic: {
    emoji: "🪙",
    gradient: "linear-gradient(145deg,#3b0764,#a855f7 50%,#1e1b4b)",
    glow: "rgba(168,85,247,0.5)",
  },
};

function artFor(id: string) {
  return (
    CASE_ART[id] ?? {
      emoji: "📦",
      gradient: "linear-gradient(145deg,#1e293b,#334155)",
      glow: "rgba(148,163,184,0.35)",
    }
  );
}

function costLabel(c: CaseListItem, lang: Lang): string {
  if (c.costType === "key") {
    return lang === "en"
      ? `🔑 Boss ${c.costValue} · ${c.have}`
      : `🔑 Босс ${c.costValue} · ${c.have}`;
  }
  if (c.costType === "ton") return `${c.costValue} TON`;
  return `${c.costValue} TONYX`;
}

function rewardLabel(r: Reward, lang: Lang): string {
  if (r.type === "ton") return `+${r.amount} TON`;
  if (r.type === "tonyx") return `+${r.amount} TONYX`;
  return lang === "en"
    ? `Fragment: ${r.nftId ?? "NFT"}`
    : `Фрагмент: ${r.nftId ?? "NFT"}`;
}

function rewardEmoji(r: Reward): string {
  if (r.type === "ton") return "💎";
  if (r.type === "tonyx") return "🪙";
  return "🧩";
}

/** CS2-style strip items (visual only; winner is from server) */
function buildStrip(winner: Reward): Reward[] {
  const fillers: Reward[] = [
    { type: "ton", amount: 0.01 },
    { type: "tonyx", amount: 50 },
    { type: "nft_fragment", nftId: "???" },
    { type: "ton", amount: 0.05 },
    { type: "tonyx", amount: 200 },
    { type: "ton", amount: 0.02 },
    { type: "tonyx", amount: 100 },
  ];
  const strip: Reward[] = [];
  for (let i = 0; i < 40; i++) {
    strip.push(fillers[i % fillers.length]);
  }
  // winner lands near the end under the center marker
  strip[34] = winner;
  return strip;
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
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CaseListItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [strip, setStrip] = useState<Reward[]>([]);
  const [offset, setOffset] = useState(0);
  const [won, setWon] = useState<Reward | null>(null);
  const animRef = useRef<number | null>(null);

  const load = async () => {
    setError(null);
    try {
      const data = await casesApi.list();
      setCases(data.cases ?? []);
      setBossKeys(data.bossKeys ?? {});
      setBalances(data.balances ?? { ton: 0, tonyx: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
      setCases([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const openCase = async (c: CaseListItem) => {
    if (busy || spinning || !c.canOpen) return;
    haptic("medium");
    setBusy(true);
    setWon(null);
    setError(null);
    try {
      const res = await casesApi.open(c.id);
      const reward = res.rewards?.[0] ?? { type: "tonyx" as const, amount: 0 };
      const items = buildStrip(reward);
      setStrip(items);
      setSpinning(true);
      setOffset(0);

      // animate strip (CS2-like ease-out)
      const itemW = 88;
      const target = 34 * itemW - 120; // center-ish
      const duration = 4200;
      const start = performance.now();

      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        // easeOutCubic
        const eased = 1 - Math.pow(1 - t, 3);
        setOffset(target * eased);
        if (t < 1) {
          animRef.current = requestAnimationFrame(tick);
        } else {
          setSpinning(false);
          setWon(reward);
          setBalances(res.balances);
          setBossKeys(res.bossKeys ?? {});
          hapticNotify("success");
          onBalanceChange();
          void load();
          setBusy(false);
        }
      };
      animRef.current = requestAnimationFrame(tick);
    } catch (e) {
      hapticNotify("error");
      setError(e instanceof Error ? e.message : "Open failed");
      setBusy(false);
      setSpinning(false);
    }
  };

  const title = lang === "en" ? "Cases" : "Кейсы";

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={{ color: "#94A3B8", textAlign: "center", padding: 40 }}>
          {lang === "en" ? "Loading..." : "Загрузка..."}
        </div>
      </div>
    );
  }

  // ── Detail + open animation ──
  if (selected) {
    const art = artFor(selected.id);
    return (
      <div style={pageStyle}>
        <button
          onClick={() => {
            if (spinning) return;
            setSelected(null);
            setWon(null);
            setStrip([]);
          }}
          style={backBtn}
        >
          ← {lang === "en" ? "Back" : "Назад"}
        </button>

        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 900, fontSize: 20, color: "#F8FAFC" }}>
            {lang === "en" ? selected.nameEn : selected.nameRu}
          </div>
          <div style={{ color: "#94A3B8", fontSize: 13, marginTop: 4 }}>
            {costLabel(selected, lang)}
          </div>
        </div>

        {/* balances */}
        <div style={balanceRow}>
          <span style={chip}>💎 {balances.ton}</span>
          <span style={chip}>🪙 {balances.tonyx}</span>
        </div>

        {error && (
          <div style={errBox} onClick={() => setError(null)}>
            {error}
          </div>
        )}

        {/* Case art or spin strip */}
        {!spinning && !won && (
          <div
            style={{
              margin: "16px auto",
              width: 200,
              height: 200,
              borderRadius: 24,
              background: art.gradient,
              boxShadow: `0 0 40px ${art.glow}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 80,
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {art.emoji}
          </div>
        )}

        {(spinning || won) && strip.length > 0 && (
          <div style={stripWrap}>
            <div style={stripMarker} />
            <div
              style={{
                display: "flex",
                gap: 8,
                transform: `translateX(-${offset}px)`,
                transition: "none",
                paddingLeft: 140,
              }}
            >
              {strip.map((r, i) => (
                <div
                  key={i}
                  style={{
                    ...stripItem,
                    borderColor:
                      won && i === 34
                        ? "rgba(250,204,21,0.9)"
                        : "rgba(255,255,255,0.08)",
                    boxShadow:
                      won && i === 34 ? "0 0 20px rgba(250,204,21,0.5)" : "none",
                  }}
                >
                  <div style={{ fontSize: 28 }}>{rewardEmoji(r)}</div>
                  <div style={{ fontSize: 10, color: "#CBD5E1", marginTop: 4 }}>
                    {r.type === "nft_fragment"
                      ? "NFT"
                      : r.type === "ton"
                        ? `${r.amount} T`
                        : `${r.amount}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {won && (
          <div style={winBox}>
            <div style={{ fontSize: 36 }}>{rewardEmoji(won)}</div>
            <div style={{ fontWeight: 900, fontSize: 18, marginTop: 6 }}>
              {rewardLabel(won, lang)}
            </div>
          </div>
        )}

        <button
          disabled={!selected.canOpen || busy || spinning}
          onClick={() => openCase(selected)}
          style={{
            ...openBtn,
            opacity: selected.canOpen && !busy && !spinning ? 1 : 0.5,
            cursor:
              selected.canOpen && !busy && !spinning ? "pointer" : "not-allowed",
          }}
        >
          {spinning
            ? lang === "en"
              ? "Opening..."
              : "Открываем..."
            : selected.canOpen
              ? lang === "en"
                ? "Open case"
                : "Открыть кейс"
              : selected.costType === "key"
                ? lang === "en"
                  ? "Need boss key"
                  : "Нужен ключ босса"
                : lang === "en"
                  ? "Not enough balance"
                  : "Недостаточно средств"}
        </button>

        <div style={{ marginTop: 20, color: "#64748B", fontSize: 12 }}>
          {lang === "en"
            ? "Reward is rolled on the server. Animation is visual."
            : "Награда считается на сервере. Анимация — только визуал."}
        </div>
      </div>
    );
  }

  // ── Grid list (Gifts Battle style) ──
  return (
    <div style={pageStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 20, color: "#F8FAFC" }}>
          {title}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={chip}>💎 {balances.ton}</span>
          <span style={chip}>🪙 {balances.tonyx}</span>
        </div>
      </div>

      {Object.keys(bossKeys).length > 0 && (
        <div style={{ ...chip, marginBottom: 12, display: "inline-block" }}>
          🔑{" "}
          {Object.entries(bossKeys)
            .map(([lvl, n]) => `B${lvl}:${n}`)
            .join(" · ")}
        </div>
      )}

      {error && (
        <div style={errBox} onClick={() => setError(null)}>
          {error}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        {cases.map((c) => {
          const art = artFor(c.id);
          return (
            <button
              key={c.id}
              onClick={() => {
                haptic("light");
                setSelected(c);
                setWon(null);
                setStrip([]);
              }}
              style={{
                background: "rgba(15,23,42,0.9)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 18,
                padding: 10,
                color: "#E2E8F0",
                fontFamily: "inherit",
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  height: 110,
                  borderRadius: 14,
                  background: art.gradient,
                  boxShadow: `0 8px 24px ${art.glow}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 48,
                  marginBottom: 10,
                }}
              >
                {art.emoji}
              </div>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 13,
                  lineHeight: 1.25,
                  minHeight: 34,
                }}
              >
                {lang === "en" ? c.nameEn : c.nameRu}
              </div>
              <div
                style={{
                  marginTop: 8,
                  display: "inline-block",
                  padding: "5px 10px",
                  borderRadius: 999,
                  background: c.canOpen
                    ? "rgba(34,197,94,0.15)"
                    : "rgba(51,65,85,0.5)",
                  color: c.canOpen ? "#4ADE80" : "#94A3B8",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {costLabel(c, lang)}
              </div>
            </button>
          );
        })}
      </div>

      {cases.length === 0 && (
        <div style={{ textAlign: "center", color: "#64748B", marginTop: 40 }}>
          {lang === "en" ? "No cases" : "Нет кейсов"}
        </div>
      )}
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "70vh",
  background: "#0B0F14",
  padding: "10px 14px 40px",
  color: "#E5E7EB",
  fontFamily: "inherit",
};

const chip: React.CSSProperties = {
  background: "rgba(30,41,59,0.9)",
  border: "1px solid rgba(51,65,85,0.8)",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 700,
  color: "#E2E8F0",
};

const balanceRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  gap: 8,
  marginBottom: 8,
};

const backBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#94A3B8",
  fontWeight: 700,
  fontSize: 14,
  padding: "4px 0 12px",
  cursor: "pointer",
  fontFamily: "inherit",
};

const openBtn: React.CSSProperties = {
  width: "100%",
  marginTop: 16,
  padding: "14px 16px",
  borderRadius: 14,
  border: "none",
  background: "linear-gradient(90deg,#7c3aed,#db2777)",
  color: "#fff",
  fontWeight: 900,
  fontSize: 16,
  fontFamily: "inherit",
};

const errBox: React.CSSProperties = {
  background: "rgba(127,29,29,0.4)",
  border: "1px solid rgba(248,113,113,0.4)",
  color: "#FECACA",
  borderRadius: 12,
  padding: "10px 12px",
  marginBottom: 12,
  fontSize: 13,
};

const stripWrap: React.CSSProperties = {
  position: "relative",
  overflow: "hidden",
  height: 100,
  margin: "12px 0",
  borderRadius: 16,
  background: "rgba(15,23,42,0.95)",
  border: "1px solid rgba(51,65,85,0.6)",
};

const stripMarker: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  top: 0,
  bottom: 0,
  width: 3,
  marginLeft: -1.5,
  background: "#FBBF24",
  zIndex: 2,
  boxShadow: "0 0 12px #FBBF24",
};

const stripItem: React.CSSProperties = {
  flex: "0 0 80px",
  width: 80,
  height: 84,
  marginTop: 8,
  borderRadius: 12,
  background: "rgba(30,41,59,0.95)",
  border: "1px solid rgba(255,255,255,0.08)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
};

const winBox: React.CSSProperties = {
  textAlign: "center",
  marginTop: 12,
  padding: 14,
  borderRadius: 16,
  background: "rgba(234,179,8,0.12)",
  border: "1px solid rgba(250,204,21,0.35)",
};
