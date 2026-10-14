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
  boss_1: { emoji: "🌑", gradient: "linear-gradient(145deg,#1e1b4b,#312e81 50%,#0f172a)", glow: "rgba(99,102,241,0.55)", image: "/cases/boss_1.jpg" },
  boss_2: { emoji: "🔥", gradient: "linear-gradient(145deg,#7f1d1d,#ea580c 50%,#1c1917)", glow: "rgba(249,115,22,0.6)", image: "/cases/boss_2.jpg" },
  boss_3: { emoji: "🌋", gradient: "linear-gradient(145deg,#7c2d12,#b91c1c 50%,#450a0a)", glow: "rgba(239,68,68,0.6)", image: "/cases/boss_3.jpg" },
  boss_4: { emoji: "⚡", gradient: "linear-gradient(145deg,#0c4a6e,#0369a1 50%,#082f49)", glow: "rgba(56,189,248,0.55)", image: "/cases/boss_4.jpg" },
  boss_5: { emoji: "👑", gradient: "linear-gradient(145deg,#713f12,#eab308 45%,#422006)", glow: "rgba(234,179,8,0.65)", image: "/cases/boss_5.jpg" },
  ton_basic: { emoji: "💎", gradient: "linear-gradient(145deg,#0e7490,#22d3ee 50%,#083344)", glow: "rgba(34,211,238,0.55)" },
  tonyx_basic: { emoji: "🪙", gradient: "linear-gradient(145deg,#3b0764,#a855f7 50%,#1e1b4b)", glow: "rgba(168,85,247,0.6)" },
};

function artFor(id: string) {
  return CASE_ART[id] ?? {
    emoji: "📦",
    gradient: "linear-gradient(145deg,#1e293b,#334155)",
    glow: "rgba(148,163,184,0.4)",
  };
}

function caseImage(c: { id: string; imageUrl?: string | null }): string | null {
  if (c.imageUrl) return c.imageUrl;
  return CASE_ART[c.id]?.image ?? null;
}

function costLabel(c: CaseListItem, lang: Lang): string {
  if (c.costType === "key") {
    return lang === "en" ? `Boss ${c.costValue} · ${c.have}` : `Босс ${c.costValue} · ${c.have}`;
  }
  if (c.costType === "ton") return `${c.costValue} TON`;
  return `${c.costValue}`;
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

const ITEM_W = 88;

function buildStrip(winner: Reward): Reward[] {
  const fillers: Reward[] = [
    { type: "tonyx", amount: 10 },
    { type: "tonyx", amount: 50 },
    { type: "ton", amount: 0.1 },
    { type: "tonyx", amount: 100 },
    { type: "nft_fragment", nftId: "common" },
    { type: "ton", amount: 0.5 },
    { type: "tonyx", amount: 25 },
  ];
  const strip: Reward[] = [];
  for (let i = 0; i < 40; i++) {
    strip.push(i === 34 ? winner : fillers[i % fillers.length]);
  }
  return strip;
}

export default function CasesGame({
  lang = "ru",
  onBalances,
}: {
  lang?: Lang;
  onBalances?: (b: { ton: number; tonyx: number }) => void;
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
    } finally {
      setLoading(false);
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

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={{ textAlign: "center", padding: 40, color: "#64748B" }}>⏳</div>
      </div>
    );
  }

  if (selected) {
    const art = artFor(selected.id);
    const heroImg = caseImage(selected);
    const rewards = selected.possibleRewards ?? [];
    const totalWeight = rewards.reduce((s, r) => s + r.weight, 0) || 1;

    return (
      <div style={pageStyle}>
        <style>{`
          @keyframes caseGlowPulse {
            0%, 100% { opacity: 0.45; transform: scale(1); }
            50% { opacity: 0.85; transform: scale(1.06); }
          }
          .drop-card { transition: transform 0.15s ease; }
          .drop-card:hover { transform: scale(1.03); }
          .info-btn { position: relative; }
          .info-btn:hover .tooltip { opacity: 1; visibility: visible; }
          .tooltip { opacity: 0; visibility: hidden; transition: opacity 0.15s; }
        `}</style>

        <button
          type="button"
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

        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 22, color: "#F8FAFC" }}>
            {lang === "en" ? selected.nameEn : selected.nameRu}
          </div>
        </div>

        {error && (
          <div style={errBox} onClick={() => setError(null)}>
            {error}
          </div>
        )}

        {!spinning && !won && (
          <div style={caseHero}>
            <div style={{
              position: "absolute",
              left: "50%",
              top: "55%",
              width: "80%",
              height: "50%",
              transform: "translate(-50%, -50%)",
              borderRadius: "50%",
              background: art.glow,
              filter: "blur(36px)",
              animation: "caseGlowPulse 2.8s ease-in-out infinite",
              pointerEvents: "none",
            }} />
            {heroImg ? (
              <img
                src={heroImg}
                alt=""
                style={{
                  position: "relative",
                  zIndex: 1,
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.6))",
                }}
              />
            ) : (
              <span style={{ position: "relative", zIndex: 1, fontSize: 90 }}>{art.emoji}</span>
            )}
          </div>
        )}

        {(spinning || won) && strip.length > 0 && (
          <div ref={stripRef} style={stripWrap}>
            <div style={stripMarker} />
            <div style={{ display: "flex", gap: 8, transform: `translateX(${-offset}px)`, willChange: "transform" }}>
              {strip.map((r, i) => (
                <div
                  key={i}
                  style={{
                    ...stripItem,
                    borderColor: won && i === 34 ? "rgba(250,204,21,0.95)" : "rgba(255,255,255,0.08)",
                    boxShadow: won && i === 34 ? "0 0 16px rgba(250,204,21,0.5)" : "none",
                  }}
                >
                  <div style={{ fontSize: 28 }}>{rewardEmoji(r)}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#E2E8F0", marginTop: 4, textAlign: "center", padding: "0 4px" }}>
                    {rewardLabel(r, lang)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {won && (
          <div style={winBox}>
            <div style={{ fontSize: 40 }}>{rewardEmoji(won)}</div>
            <div style={{ fontWeight: 900, fontSize: 18, color: "#FDE68A", marginTop: 6 }}>
              {rewardLabel(won, lang)}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "center" }}>
          {[1, 2, 3, 4, 5].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMultiplier(m)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "none",
                background: multiplier === m ? "#3b82f6" : "rgba(30,41,59,0.8)",
                color: multiplier === m ? "#fff" : "#94A3B8",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              x{m}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={!selected.canOpen || busy || spinning}
          onClick={() => openCase(selected)}
          style={{
            ...openBtn,
            background: selected.canOpen
              ? "linear-gradient(90deg,#16a34a,#22c55e)"
              : "linear-gradient(90deg,#7f1d1d,#991b1b)",
            opacity: selected.canOpen && !busy && !spinning ? 1 : 0.7,
          }}
        >
          {spinning
            ? lang === "en" ? "Opening..." : "Открываем..."
            : selected.canOpen
              ? lang === "en" ? "Open case" : "Открыть кейс"
              : lang === "en" ? "Not enough" : "Не хватает"}
          {" "}
          <span style={{ marginLeft: 6 }}>⭐ {selected.costValue * multiplier}</span>
        </button>

        <div style={{ marginTop: 24 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#E2E8F0", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>🎁</span>
            {lang === "en" ? "What's inside?" : "Что в кейсе?"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {rewards.map((r, i) => (
              <DropCard key={i} r={r} lang={lang} chance={((r.weight / totalWeight) * 100).toFixed(2)} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <style>{`
        @keyframes caseGlowPulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }
        .tonyx-case-card {
          transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), filter 0.2s ease;
          transform: scale(1);
        }
        .tonyx-case-card:hover {
          transform: scale(1.04);
          filter: brightness(1.1);
        }
        .tonyx-case-card:active {
          transform: scale(1.08);
          filter: brightness(1.15);
        }
      `}</style>

      <div style={{ fontWeight: 900, fontSize: 22, color: "#F8FAFC", marginBottom: 18, letterSpacing: "-0.02em" }}>
        {lang === "en" ? "Cases" : "Кейсы"}
      </div>

      {error && (
        <div style={errBox} onClick={() => setError(null)}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, rowGap: 20 }}>
        {cases.map((c) => {
          const art = artFor(c.id);
          const img = caseImage(c);
          return (
            <button
              key={c.id}
              type="button"
              className="tonyx-case-card"
              onClick={() => {
                haptic("light");
                setSelected(c);
                setWon(null);
                setStrip([]);
              }}
              style={cardBtn}
            >
              <div style={thumbWrap}>
                <div style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: "85%",
                  height: "55%",
                  transform: "translate(-50%, -50%)",
                  borderRadius: "50%",
                  background: art.glow,
                  filter: "blur(28px)",
                  animation: "caseGlowPulse 3s ease-in-out infinite",
                  pointerEvents: "none",
                }} />
                {img ? (
                  <img
                    src={img}
                    alt=""
                    draggable={false}
                    style={{
                      position: "relative",
                      zIndex: 1,
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      objectPosition: "center",
                      filter: "drop-shadow(0 14px 24px rgba(0,0,0,0.5))",
                      pointerEvents: "none",
                    }}
                  />
                ) : (
                  <div style={{
                    position: "relative",
                    zIndex: 1,
                    width: "100%",
                    height: "100%",
                    borderRadius: 20,
                    background: art.gradient,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: `0 0 40px ${art.glow}`,
                  }}>
                    <span style={{ fontSize: 56 }}>{art.emoji}</span>
                  </div>
                )}
              </div>

              <div style={{
                marginTop: 12,
                fontWeight: 800,
                fontSize: 15,
                lineHeight: 1.3,
                color: "#F1F5F9",
                minHeight: 40,
              }}>
                {lang === "en" ? c.nameEn : c.nameRu}
              </div>

              <div style={{
                marginTop: 10,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                borderRadius: 12,
                background: "rgba(15,23,42,0.9)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: c.canOpen ? "#FDE68A" : "#64748B",
                fontSize: 14,
                fontWeight: 800,
              }}>
                <span>⭐</span>
                {costLabel(c, lang)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DropCard({ r, lang, chance }: { r: CaseRewardPreview; lang: Lang; chance: string }) {
  const label =
    lang === "en"
      ? r.labelEn ?? (r.type === "nft_fragment" ? `Fragment ${r.nftId}` : `${r.minAmount}–${r.maxAmount}`)
      : r.labelRu ?? (r.type === "nft_fragment" ? `Фрагмент ${r.nftId}` : `${r.minAmount}–${r.maxAmount}`);
  const emoji = r.type === "ton" ? "💎" : r.type === "tonyx" ? "🪙" : "🧩";
  const tonPrice = r.type === "ton" ? (r.maxAmount ?? r.minAmount ?? 0) : 0;
  const starPrice = Math.round(tonPrice * 100) || (r.maxAmount ?? 0);

  return (
    <div className="drop-card" style={{
      background: "rgba(15,23,42,0.95)",
      border: "1px solid rgba(51,65,85,0.6)",
      borderRadius: 16,
      padding: 12,
      textAlign: "center",
      position: "relative",
    }}>
      <button
        type="button"
        className="info-btn"
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.2)",
          background: "rgba(30,41,59,0.8)",
          color: "#94A3B8",
          fontSize: 11,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        i
        <span className="tooltip" style={{
          position: "absolute",
          bottom: "130%",
          right: 0,
          background: "rgba(15,23,42,0.95)",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 8,
          padding: "6px 10px",
          fontSize: 11,
          fontWeight: 700,
          color: "#E2E8F0",
          whiteSpace: "nowrap",
          zIndex: 10,
        }}>
          {lang === "en" ? "Chance" : "Шанс"}: {chance}%
        </span>
      </button>

      {r.imageUrl ? (
        <img src={r.imageUrl} alt="" style={{ width: 64, height: 64, objectFit: "contain", margin: "8px auto" }} />
      ) : (
        <div style={{ fontSize: 40, margin: "8px 0" }}>{emoji}</div>
      )}
      <div style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0", marginTop: 6, lineHeight: 1.3 }}>{label}</div>
      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6, display: "flex", justifyContent: "center", gap: 8 }}>
        <span>💎 {tonPrice || "—"}</span>
        <span>⭐ {starPrice}</span>
      </div>
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
  color: "#fff",
  fontWeight: 900,
  fontSize: 16,
  fontFamily: "inherit",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
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
  background: "transparent",
  border: "none",
  borderRadius: 20,
  padding: "6px 4px 10px",
  color: "#E2E8F0",
  fontFamily: "inherit",
  cursor: "pointer",
  textAlign: "center",
  WebkitTapHighlightColor: "transparent",
};

const thumbWrap: React.CSSProperties = {
  position: "relative",
  height: 160,
  borderRadius: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "visible",
};

const caseHero: React.CSSProperties = {
  position: "relative",
  margin: "16px auto",
  width: 240,
  height: 240,
  borderRadius: 28,
  background: "transparent",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "visible",
};
