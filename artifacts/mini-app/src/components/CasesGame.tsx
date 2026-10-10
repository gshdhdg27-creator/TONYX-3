import { useEffect, useRef, useState } from "react";
import { casesApi, type CaseListItem, type CaseRewardPreview } from "@/lib/casesApi";
import { haptic, hapticNotify } from "@/lib/telegram";

type Lang = "ru" | "en";

type Reward = {
  type: "ton" | "tonyx" | "nft_fragment";
  amount?: number;
  nftId?: string;
};

const CASE_ART: Record<string, { emoji: string; gradient: string; glow: string; image?: string }> = {
  boss_1: { emoji: "🌑", gradient: "linear-gradient(145deg,#1e1b4b,#312e81 50%,#0f172a)", glow: "rgba(99,102,241,0.45)", image: "/cases/boss_1.jpg" },
  boss_2: { emoji: "🔥", gradient: "linear-gradient(145deg,#7f1d1d,#ea580c 50%,#1c1917)", glow: "rgba(249,115,22,0.5)", image: "/cases/boss_2.jpg" },
  boss_3: { emoji: "🌋", gradient: "linear-gradient(145deg,#7c2d12,#b91c1c 50%,#450a0a)", glow: "rgba(239,68,68,0.5)", image: "/cases/boss_3.jpg" },
  boss_4: { emoji: "⚡", gradient: "linear-gradient(145deg,#0c4a6e,#0369a1 50%,#082f49)", glow: "rgba(56,189,248,0.45)", image: "/cases/boss_4.jpg" },
  boss_5: { emoji: "👑", gradient: "linear-gradient(145deg,#713f12,#eab308 45%,#422006)", glow: "rgba(234,179,8,0.55)", image: "/cases/boss_5.jpg" },
  ton_basic: { emoji: "💎", gradient: "linear-gradient(145deg,#0e7490,#22d3ee 50%,#083344)", glow: "rgba(34,211,238,0.45)" },
  tonyx_basic: { emoji: "🪙", gradient: "linear-gradient(145deg,#3b0764,#a855f7 50%,#1e1b4b)", glow: "rgba(168,85,247,0.5)" },
};

function artFor(id: string) {
  return CASE_ART[id] ?? {
    emoji: "📦",
    gradient: "linear-gradient(145deg,#1e293b,#334155)",
    glow: "rgba(148,163,184,0.35)",
  };
}

function caseImage(c: { id: string; imageUrl?: string | null }): string | null {
  if (c.imageUrl) return c.imageUrl;
  return CASE_ART[c.id]?.image ?? null;
}

function costLabel(c: CaseListItem, lang: Lang): string {
  if (c.costType === "key") {
    return lang === "en" ? `🔑 Boss ${c.costValue} · ${c.have}` : `🔑 Босс ${c.costValue} · ${c.have}`;
  }
  if (c.costType === "ton") return `${c.costValue} TON`;
  return `${c.costValue} TONYX`;
}

function rewardLabel(r: Reward, lang: Lang): string {
  if (r.type === "ton") return `+${r.amount} TON`;
  if (r.type === "tonyx") return `+${r.amount} TONYX`;
  return lang === "en" ? `Fragment: ${r.nftId ?? "NFT"}` : `Фрагмент: ${r.nftId ?? "NFT"}`;
}

function rewardEmoji(r: Reward): string {
  if (r.type === "ton") return "💎";
  if (r.type === "tonyx") return "🪙";
  return "🧩";
}

const ITEM_W = 88; // 80 + 8 gap

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
  for (let i = 0; i < 42; i++) strip.push(fillers[i % fillers.length]);
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CaseListItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [strip, setStrip] = useState<Reward[]>([]);
  const [offset, setOffset] = useState(0);
  const [won, setWon] = useState<Reward | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<number | null>(null);

  const load = async () => {
    setError(null);
    try {
      const data = await casesApi.list();
      setCases(data.cases ?? []);
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
      const reward: Reward = res.rewards?.[0] ?? { type: "tonyx", amount: 0 };

      // баланс сразу после ответа сервера (не ждать конца анимации)
      onBalanceChange();
      setCases((prev) =>
        prev.map((x) => {
          if (x.id !== c.id) return x;
          if (x.costType === "key") {
            const have = Math.max(0, x.have - 1);
            return { ...x, have, canOpen: have >= 1 };
          }
          if (x.costType === "ton") {
            const have = res.balances.ton;
            return { ...x, have, canOpen: have >= x.costValue };
          }
          const have = res.balances.tonyx;
          return { ...x, have, canOpen: have >= x.costValue };
        }),
      );
      if (selected?.id === c.id) {
        setSelected((s) => {
          if (!s) return s;
          if (s.costType === "key") {
            const have = Math.max(0, s.have - 1);
            return { ...s, have, canOpen: have >= 1 };
          }
          if (s.costType === "ton") {
            return { ...s, have: res.balances.ton, canOpen: res.balances.ton >= s.costValue };
          }
          return { ...s, have: res.balances.tonyx, canOpen: res.balances.tonyx >= s.costValue };
        });
      }

      const items = buildStrip(reward);
      setStrip(items);
      setSpinning(true);
      setOffset(0);

      const box = stripRef.current;
      const viewW = box?.clientWidth ?? 320;
      // центр предмета 34 под маркером по центру
      const target = 34 * ITEM_W + 40 - viewW / 2;
      const duration = 4200;
      const start = performance.now();

      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        setOffset(Math.max(0, target * eased));
        if (t < 1) {
          animRef.current = requestAnimationFrame(tick);
        } else {
          setSpinning(false);
          setWon(reward);
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

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={{ color: "#94A3B8", textAlign: "center", padding: 40 }}>
          {lang === "en" ? "Loading..." : "Загрузка..."}
        </div>
      </div>
    );
  }

  // ── Экран кейса ──
  if (selected) {
    const art = artFor(selected.id);
    const rewards = selected.possibleRewards ?? [];

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

        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 20, color: "#F8FAFC" }}>
            {lang === "en" ? selected.nameEn : selected.nameRu}
          </div>
          <div style={{ color: "#94A3B8", fontSize: 13, marginTop: 4 }}>
            {costLabel(selected, lang)}
          </div>
        </div>

        {error && (
          <div style={errBox} onClick={() => setError(null)}>
            {error}
          </div>
        )}

        {!spinning && !won && (
          <div style={caseHero(art)}>
            {selected.imageUrl ? (
              <img
                src={selected.imageUrl}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 24 }}
              />
            ) : (
              <span style={{ fontSize: 80 }}>{art.emoji}</span>
            )}
          </div>
        )}

        {(spinning || won) && strip.length > 0 && (
          <div ref={stripRef} style={stripWrap}>
            <div style={stripMarker} />
            <div
              style={{
                display: "flex",
                gap: 8,
                transform: `translateX(${-offset}px)`,
                willChange: "transform",
              }}
            >
              {strip.map((r, i) => (
                <div
                  key={i}
                  style={{
                    ...stripItem,
                    borderColor:
                      won && i === 34 ? "rgba(250,204,21,0.95)" : "rgba(255,255,255,0.08)",
                    boxShadow: won && i === 34 ? "0 0 18px rgba(250,204,21,0.55)" : "none",
                  }}
                >
                  <div style={{ fontSize: 28 }}>{rewardEmoji(r)}</div>
                  <div style={{ fontSize: 10, color: "#CBD5E1", marginTop: 4 }}>
                    {r.type === "nft_fragment" ? "NFT" : r.type === "ton" ? `${r.amount} T` : `${r.amount}`}
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

        {/* Что может выпасть */}
        <div style={{ marginTop: 22 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#E2E8F0", marginBottom: 10 }}>
            🎁 {lang === "en" ? "What's inside?" : "Что в кейсе?"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {rewards.map((r, i) => (
              <RewardCard key={i} r={r} lang={lang} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Сетка кейсов ──
  return (
    <div style={pageStyle}>
      <div style={{ fontWeight: 900, fontSize: 20, color: "#F8FAFC", marginBottom: 14 }}>
        {lang === "en" ? "Cases" : "Кейсы"}
      </div>

      {error && (
        <div style={errBox} onClick={() => setError(null)}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
              style={cardBtn}
            >
              <div style={thumb(art)}>
                {c.imageUrl ? (
                  <img
                    src={c.imageUrl}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 14 }}
                  />
                ) : (
                  <span style={{ fontSize: 44 }}>{art.emoji}</span>
                )}
              </div>
              <div style={{ fontWeight: 800, fontSize: 13, minHeight: 34, lineHeight: 1.25 }}>
                {lang === "en" ? c.nameEn : c.nameRu}
              </div>
              <div
                style={{
                  marginTop: 8,
                  display: "inline-block",
                  padding: "5px 10px",
                  borderRadius: 999,
                  background: c.canOpen ? "rgba(34,197,94,0.15)" : "rgba(51,65,85,0.5)",
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
    </div>
  );
}

function RewardCard({ r, lang }: { r: CaseRewardPreview; lang: Lang }) {
  const label =
    lang === "en"
      ? r.labelEn ??
        (r.type === "nft_fragment" ? `Fragment ${r.nftId}` : `${r.minAmount}–${r.maxAmount}`)
      : r.labelRu ??
        (r.type === "nft_fragment" ? `Фрагмент ${r.nftId}` : `${r.minAmount}–${r.maxAmount}`);
  const emoji = r.type === "ton" ? "💎" : r.type === "tonyx" ? "🪙" : "🧩";
  const chance = r.weight;

  return (
    <div
      style={{
        background: "rgba(15,23,42,0.95)",
        border: "1px solid rgba(51,65,85,0.7)",
        borderRadius: 14,
        padding: 10,
        textAlign: "center",
      }}
    >
      {r.imageUrl ? (
        <img src={r.imageUrl} alt="" style={{ width: 48, height: 48, objectFit: "contain" }} />
      ) : (
        <div style={{ fontSize: 32 }}>{emoji}</div>
      )}
      <div style={{ fontSize: 11, fontWeight: 700, color: "#E2E8F0", marginTop: 6 }}>{label}</div>
      <div style={{ fontSize: 10, color: "#64748B", marginTop: 4 }}>~{chance}%</div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "70vh",
  background: "#0B0F14",
  padding: "8px 14px 40px",
  color: "#E5E7EB",
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
  cursor: "pointer",
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

const cardBtn: React.CSSProperties = {
  background: "rgba(15,23,42,0.9)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 18,
  padding: 10,
  color: "#E2E8F0",
  fontFamily: "inherit",
  cursor: "pointer",
  textAlign: "center",
};

function caseHero(art: { gradient: string; glow: string }): React.CSSProperties {
  return {
    margin: "12px auto",
    width: 200,
    height: 200,
    borderRadius: 24,
    background: art.gradient,
    boxShadow: `0 0 40px ${art.glow}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(255,255,255,0.08)",
    overflow: "hidden",
  };
}

function thumb(art: { gradient: string; glow: string }): React.CSSProperties {
  return {
    height: 110,
    borderRadius: 14,
    background: art.gradient,
    boxShadow: `0 8px 24px ${art.glow}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    overflow: "hidden",
  };
}
