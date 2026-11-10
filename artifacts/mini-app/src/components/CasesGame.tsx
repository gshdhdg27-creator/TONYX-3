import { useEffect, useRef, useState, type CSSProperties } from "react";
import { casesApi, type CaseListItem, type CaseRewardPreview } from "@/lib/casesApi";
import { haptic, hapticNotify } from "@/lib/telegram";
import { getCasesCache, setCasesCache, refreshCasesInBackground } from "@/lib/dataCache";

type Lang = "ru" | "en";

type Reward = {
  type: "ton" | "tonyx" | "nft_fragment" | "nft_full" | string;
  amount?: number;
  nftId?: string;
  imageUrl?: string | null;
  valueTon?: number | null;
  label?: string;
};

const TON_IMG = "https://ton.org/download/ton_symbol.png";
const TONYX_IMG = "/tonyx-coin.png";
const TG_PHOTOS = "https://raw.githubusercontent.com/ssamy2/TG_Photos/main/webp/by_name/";

const CASE_ART: Record<string, { emoji: string; gradient: string; glow: string; image?: string }> = {
  boss_1: { emoji: "🌑", gradient: "linear-gradient(145deg,#1e1b4b,#312e81 50%,#0f172a)", glow: "rgba(99,102,241,0.55)", image: "/cases/boss_1.jpg" },
  boss_2: { emoji: "🔥", gradient: "linear-gradient(145deg,#7f1d1d,#ea580c 50%,#1c1917)", glow: "rgba(249,115,22,0.6)", image: "/cases/boss_2.jpg" },
  boss_3: { emoji: "🌋", gradient: "linear-gradient(145deg,#7c2d12,#b91c1c 50%,#450a0a)", glow: "rgba(239,68,68,0.6)", image: "/cases/boss_3.jpg" },
  boss_4: { emoji: "⚡", gradient: "linear-gradient(145deg,#0c4a6e,#0369a1 50%,#082f49)", glow: "rgba(56,189,248,0.55)", image: "/cases/boss_4.jpg" },
  boss_5: { emoji: "👑", gradient: "linear-gradient(145deg,#713f12,#eab308 45%,#422006)", glow: "rgba(234,179,8,0.65)", image: "/cases/boss_5.jpg" },
  ton_0_1: { emoji: "💎", gradient: "linear-gradient(145deg,#0e7490,#22d3ee 50%,#083344)", glow: "rgba(34,211,238,0.55)" },
  ton_1: { emoji: "🪙", gradient: "linear-gradient(145deg,#334155,#94a3b8 45%,#1e293b)", glow: "rgba(148,163,184,0.55)" },
  ton_2_5: { emoji: "✨", gradient: "linear-gradient(145deg,#854d0e,#eab308 45%,#422006)", glow: "rgba(234,179,8,0.6)" },
  ton_5: { emoji: "💠", gradient: "linear-gradient(145deg,#1e3a5f,#67e8f9 45%,#0c4a6e)", glow: "rgba(103,232,249,0.55)" },
  ton_10: { emoji: "👑", gradient: "linear-gradient(145deg,#4c1d95,#c084fc 40%,#2e1065)", glow: "rgba(192,132,252,0.65)" },
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
  return `${c.costValue} TX`;
}

function rewardImage(r: { type: string; imageUrl?: string | null; nftId?: string }): string {
  if (r.imageUrl) return r.imageUrl;
  if (r.type === "ton") return TON_IMG;
  if (r.type === "tonyx") return TONYX_IMG;
  if (r.nftId) return `${TG_PHOTOS}${r.nftId}.webp`;
  return TON_IMG;
}

function rewardLabel(r: Reward, lang: Lang): string {
  if (r.type === "ton") return `+${r.amount ?? 0} TON`;
  if (r.type === "tonyx") return `+${r.amount ?? 0} TONYX`;
  if (r.type === "nft_fragment") return lang === "en" ? `Fragment` : `Фрагмент`;
  return r.label ?? r.nftId ?? r.type;
}

function rarityFromChance(pct: number): "common" | "rare" | "epic" | "legendary" {
  if (pct <= 5) return "legendary";
  if (pct <= 12) return "epic";
  if (pct <= 25) return "rare";
  return "common";
}

/** CS2-style strip: item width includes gap */
const ITEM_W = 108;
const ITEM_GAP = 8;
const STRIP_LEN = 70;
const WIN_INDEX = 52;

/** CS2 rarity colors */
function stripRarity(r: Reward): "blue" | "purple" | "pink" | "red" | "gold" {
  if (r.type === "nft_full") return "gold";
  if (r.type === "nft_fragment") {
    const v = r.valueTon ?? 0;
    if (v >= 100) return "gold";
    if (v >= 30) return "red";
    if (v >= 15) return "pink";
    if (v >= 7) return "purple";
    return "blue";
  }
  if (r.type === "ton") {
    const a = r.amount ?? 0;
    if (a >= 5) return "gold";
    if (a >= 2) return "red";
    if (a >= 0.5) return "pink";
    if (a >= 0.15) return "purple";
    return "blue";
  }
  // tonyx
  const a = r.amount ?? 0;
  if (a >= 2000) return "red";
  if (a >= 500) return "pink";
  if (a >= 100) return "purple";
  return "blue";
}

function cs2EaseFixed(t: number): number {
  // Tuned CS2 feel: rapid scroll, long slowdown, soft settle
  // Approximation of cubic-bezier(0.15, 0.85, 0.12, 1) with extra late brake
  const c1 = 1 - Math.pow(1 - t, 2.8);
  const c2 = 1 - Math.pow(1 - t, 5.5);
  // weight toward harder brake in second half
  const w = t * t;
  return c1 * (1 - w) + c2 * w;
}

function buildStrip(winner: Reward, pool: CaseRewardPreview[]): Reward[] {
  const fillers: Reward[] = pool.length
    ? pool.map((p) => ({
        type: p.type,
        amount: p.maxAmount ?? p.minAmount,
        nftId: p.nftId,
        imageUrl: p.imageUrl,
        valueTon: p.valueTon,
        label: p.labelRu,
      }))
    : [
        { type: "tonyx", amount: 50 },
        { type: "ton", amount: 0.1 },
        { type: "nft_fragment", nftId: "hypno_lollipop" },
      ];
  // Shuffle-ish variety so consecutive items differ
  const shuffled = [...fillers];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const strip: Reward[] = [];
  for (let i = 0; i < STRIP_LEN; i++) {
    if (i === WIN_INDEX) {
      strip.push(winner);
    } else {
      // pick random filler, avoid same as previous when possible
      let pick = shuffled[i % shuffled.length]!;
      if (i > 0 && strip[i - 1]?.type === pick.type && shuffled.length > 1) {
        pick = shuffled[(i + 1) % shuffled.length]!;
      }
      strip.push({ ...pick });
    }
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
  const [cases, setCases] = useState<CaseListItem[]>(() => getCasesCache()?.cases ?? []);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CaseListItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [strip, setStrip] = useState<Reward[]>([]);
  const [offset, setOffset] = useState(0);
  const [won, setWon] = useState<Reward | null>(null);
  const [lightOn, setLightOn] = useState(false);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<number | null>(null);
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
      onBalances?.(res.balances);
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
        })
      );
      setSelected((s) => {
        if (!s || s.id !== c.id) return s;
        if (s.costType === "key") {
          const have = Math.max(0, s.have - 1);
          return { ...s, have, canOpen: have >= 1 };
        }
        if (s.costType === "ton") return { ...s, have: res.balances.ton, canOpen: res.balances.ton >= s.costValue };
        return { ...s, have: res.balances.tonyx, canOpen: res.balances.tonyx >= s.costValue };
      });

      const items = buildStrip(reward, c.possibleRewards ?? []);
      setStrip(items);
      setOffset(0);
      setSpinning(true);
      setWon(null);
      setLightOn(false);

      // Light appears from the drum after a short beat (CS2 feel)
      window.setTimeout(() => setLightOn(true), 180);

      // Wait one frame so stripRef has layout
      requestAnimationFrame(() => {
        const box = stripRef.current;
        const viewW = box?.clientWidth ?? 320;
        const step = ITEM_W + ITEM_GAP;
        // CS2 lands slightly off-center inside the winning tile
        const jitter = (Math.random() - 0.5) * (ITEM_W * 0.55);
        const target = WIN_INDEX * step + ITEM_W / 2 - viewW / 2 + jitter;
        const duration = 7200; // CS2-like long spin
        const start = performance.now();
        let lastTick = -1;

        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          const ease = cs2EaseFixed(t);
          const pos = target * ease;
          setOffset(pos);

          // light haptic every ~item pass while still fast
          if (t < 0.72) {
            const idx = Math.floor((pos + viewW / 2) / step);
            if (idx !== lastTick && idx >= 0) {
              lastTick = idx;
              if (idx % 2 === 0) haptic("light");
            }
          }

          if (t < 1) {
            animRef.current = requestAnimationFrame(tick);
          } else {
            setSpinning(false);
            setWon(reward);
            hapticNotify("success");
            // tiny settle pulse via class is CSS-driven
          }
        };
        animRef.current = requestAnimationFrame(tick);
      });
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
    const art = artFor(selected.id);
    const heroImg = caseImage(selected);
    const rewards = selected.possibleRewards ?? [];
    const totalWeight = rewards.reduce((s, r) => s + r.weight, 0) || 1;

    return (
      <div style={pageStyle}>
        <style>{CSS}</style>
        <div className="cx-bg" />

        <button
          type="button"
          onClick={() => {
            if (spinning) return;
            setSelected(null);
            setWon(null);
            setStrip([]);
            setLightOn(false);
          }}
          style={backBtn}
        >
          ← {lang === "en" ? "Back" : "Назад"}
        </button>

        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 900, fontSize: 22, color: "#F8FAFC", letterSpacing: "-0.02em" }}>
            {lang === "en" ? selected.nameEn : selected.nameRu}
          </div>
          <div style={{ marginTop: 6, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 999, background: "rgba(15,23,42,0.85)", border: "1px solid rgba(255,255,255,0.1)", color: "#FDE68A", fontWeight: 800, fontSize: 13 }}>
            ⭐ {costLabel(selected, lang)}
          </div>
        </div>

        {error && (
          <div style={errBox} onClick={() => setError(null)}>{error}</div>
        )}

        {!spinning && !won && (
          <div className="cx-hero">
            <div className="cx-hero-glow" style={{ background: art.glow }} />
            {heroImg ? (
              <img src={heroImg} alt="" className="cx-hero-img" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <div className="cx-hero-fallback" style={{ background: art.gradient }}>
                <span style={{ fontSize: 72 }}>{art.emoji}</span>
              </div>
            )}
          </div>
        )}

        {(spinning || won) && strip.length > 0 && (
          <div ref={stripRef} className={`cx-strip ${lightOn ? "cx-strip-lit" : ""} ${spinning ? "cx-strip-spinning" : ""} ${won ? "cx-strip-done" : ""}`}>
            {/* CS2 dual pointers */}
            <div className={`cx-pointer cx-pointer-top ${lightOn ? "cx-pointer-on" : ""}`} />
            <div className={`cx-pointer cx-pointer-bot ${lightOn ? "cx-pointer-on" : ""}`} />
            <div className={`cx-marker ${lightOn ? "cx-marker-on" : ""}`} />
            <div className={`cx-beam ${lightOn ? "cx-beam-on" : ""}`} />
            <div
              className="cx-strip-track"
              style={{
                transform: `translate3d(${-offset}px,0,0)`,
                gap: ITEM_GAP,
              }}
            >
              {strip.map((r, i) => {
                const rar = stripRarity(r);
                const isWin = !!won && i === WIN_INDEX;
                const dim = !!won && i !== WIN_INDEX;
                return (
                  <div
                    key={i}
                    className={[
                      "cx-strip-item",
                      `cx-rarity-${rar}`,
                      isWin ? "cx-strip-win" : "",
                      dim ? "cx-strip-dim" : "",
                    ].filter(Boolean).join(" ")}
                  >
                    <div className="cx-strip-body">
                      <img src={rewardImage(r)} alt="" className="cx-strip-img" onError={(e) => { (e.target as HTMLImageElement).src = TON_IMG; }} />
                      <div className="cx-strip-lbl">{rewardLabel(r, lang)}</div>
                    </div>
                    <div className={`cx-rarity-bar cx-rarity-bar-${rar}`} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {won && (
          <div className={`cx-win cx-win-${stripRarity(won)}`}>
            <div className="cx-win-glow" />
            <img src={rewardImage(won)} alt="" className="cx-win-img" />
            <div className="cx-win-title">{rewardLabel(won, lang)}</div>
            {won.valueTon != null && (
              <div className="cx-win-price">≈ {won.valueTon} TON</div>
            )}
            {won.type === "nft_fragment" && (
              <div className="cx-win-sub">{lang === "en" ? "Fragment added to collection" : "Фрагмент добавлен в коллекцию"}</div>
            )}
          </div>
        )}

        <button
          type="button"
          disabled={!selected.canOpen || busy || spinning}
          onClick={() => openCase(selected)}
          className="cx-open"
          style={{
            background: selected.canOpen
              ? "linear-gradient(135deg,#7c3aed,#a855f7 50%,#ec4899)"
              : "linear-gradient(90deg,#3f3f46,#27272a)",
            opacity: selected.canOpen && !busy && !spinning ? 1 : 0.65,
          }}
        >
          {spinning
            ? lang === "en" ? "Opening..." : "Открываем..."
            : selected.canOpen
              ? lang === "en" ? "Open case" : "Открыть кейс"
              : lang === "en" ? "Not enough" : "Не хватает"}
          {" · "}{costLabel(selected, lang)}
        </button>

        <div style={{ marginTop: 22 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#E2E8F0", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span>🎁</span>
            {lang === "en" ? "Possible rewards" : "Возможные награды"}
          </div>
          <div className="cx-rewards">
            {rewards.map((r, i) => (
              <DropCard key={i} r={r} lang={lang} chance={((r.weight / totalWeight) * 100).toFixed(1)} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <style>{CSS}</style>
      <div className="cx-bg" />

      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ fontWeight: 900, fontSize: 26, color: "#F8FAFC", letterSpacing: "-0.03em" }}>
          {lang === "en" ? "Cases" : "Кейсы"}
        </div>
        <div style={{ fontSize: 13, color: "#a78bfa", marginTop: 4, fontWeight: 600 }}>
          {lang === "en" ? "Open & win TON, TONYX, NFT fragments" : "Открывай · TON · TONYX · фрагменты NFT"}
        </div>

        <div className="cx-tabs">
          {([
            ["all", lang === "en" ? "All" : "Все"],
            ["key", lang === "en" ? "Boss keys" : "Ключи боссов"],
            ["ton", "TON"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`cx-tab ${filter === id ? "cx-tab-on" : ""}`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <div style={errBox} onClick={() => setError(null)}>{error}</div>}

        <div className="cx-grid">
          {visible.map((c, idx) => {
            const art = artFor(c.id);
            const img = caseImage(c);
            return (
              <button
                key={c.id}
                type="button"
                className="cx-card"
                style={{ animationDelay: `${idx * 50}ms` }}
                onClick={() => {
                  haptic("light");
                  setSelected(c);
                  setWon(null);
                  setStrip([]);
                  setLightOn(false);
                  setOffset(0);
                }}
              >
                <div className="cx-card-art">
                  <div className="cx-card-glow" style={{ background: art.glow }} />
                  {img ? (
                    <img src={img} alt="" className="cx-card-img" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <div className="cx-card-fallback" style={{ background: art.gradient }}>
                      <span style={{ fontSize: 48 }}>{art.emoji}</span>
                    </div>
                  )}
                  {c.costType === "ton" && <span className="cx-pill ton">TON</span>}
                  {c.costType === "key" && <span className="cx-pill key">KEY</span>}
                </div>
                <div className="cx-card-name">{lang === "en" ? c.nameEn : c.nameRu}</div>
                <div className={`cx-card-cost ${c.canOpen ? "ok" : "no"}`}>
                  ⭐ {costLabel(c, lang)}
                </div>
              </button>
            );
          })}
        </div>

        {visible.length === 0 && (
          <div style={{ textAlign: "center", color: "#64748b", padding: 40, fontSize: 13 }}>
            {lang === "en" ? "No cases" : "Нет кейсов"}
          </div>
        )}
      </div>
    </div>
  );
}

function DropCard({ r, lang, chance }: { r: CaseRewardPreview; lang: Lang; chance: string }) {
  const label =
    lang === "en"
      ? r.labelEn ?? (r.type === "nft_fragment" ? `Fragment ${r.nftId}` : `${r.minAmount}–${r.maxAmount}`)
      : r.labelRu ?? (r.type === "nft_fragment" ? `Фрагмент ${r.nftId}` : `${r.minAmount}–${r.maxAmount}`);
  const img = rewardImage(r);
  const price =
    r.type === "nft_fragment" || r.type === "nft_full"
      ? r.valueTon != null
        ? `≈ ${r.valueTon} TON`
        : null
      : r.type === "ton"
        ? `${r.minAmount ?? 0}–${r.maxAmount ?? 0} TON`
        : `${r.minAmount ?? 0}–${r.maxAmount ?? 0} TX`;

  const rarity = rarityFromChance(Number(chance) || 0);
  return (
    <div className={`cx-drop cx-drop-${rarity}`}>
      <div className="cx-drop-img-wrap">
        <img src={img} alt="" className="cx-drop-img" onError={(e) => { (e.target as HTMLImageElement).src = TON_IMG; }} />
        {r.type === "nft_fragment" && <span className="cx-frag">🧩</span>}
      </div>
      <div className="cx-drop-label">{label}</div>
      {price && <div className="cx-drop-price">{price}</div>}
      <div className="cx-drop-chance">{chance}%</div>
    </div>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100%",
  position: "relative",
  color: "#e2e8f0",
  fontFamily: "inherit",
  padding: "16px 14px 28px",
  overflow: "hidden",
};

const backBtn: CSSProperties = {
  marginBottom: 12,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: "9px 14px",
  color: "#c4b5fd",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  position: "relative",
  zIndex: 2,
};

const errBox: CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(239,68,68,0.15)",
  color: "#fca5a5",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  position: "relative",
  zIndex: 2,
};

const CSS = `
  .cx-bg {
    position: absolute; inset: 0; pointer-events: none; z-index: 0;
    background:
      radial-gradient(ellipse 100% 55% at 50% -8%, rgba(124,58,237,0.5), transparent 58%),
      radial-gradient(ellipse 55% 40% at 95% 25%, rgba(236,72,153,0.22), transparent 52%),
      radial-gradient(ellipse 50% 38% at 5% 75%, rgba(14,165,233,0.18), transparent 50%),
      radial-gradient(ellipse 40% 30% at 70% 90%, rgba(234,179,8,0.08), transparent 45%),
      linear-gradient(180deg, #140a24 0%, #0b0614 42%, #05030a 100%);
  }
  .cx-bg::after {
    content: ""; position: absolute; inset: 0;
    background-image: radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px);
    background-size: 18px 18px; opacity: 0.5;
  }
  .cx-tabs { display: flex; gap: 8px; margin: 16px 0 14px; position: relative; z-index: 1; }
  .cx-tab {
    flex: 1; padding: 10px 0; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08);
    background: rgba(15,23,42,0.55); color: #94a3b8; font-weight: 800; font-size: 12px;
    cursor: pointer; font-family: inherit; transition: all 0.2s ease;
  }
  .cx-tab-on {
    background: linear-gradient(135deg, rgba(124,58,237,0.45), rgba(168,85,247,0.25));
    border-color: rgba(168,85,247,0.5); color: #f5f3ff;
    box-shadow: 0 0 16px rgba(124,58,237,0.25);
  }
  .cx-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 14px; row-gap: 16px;
    position: relative; z-index: 1;
  }
  .cx-card {
    text-align: left; border: none; background: transparent; padding: 0; cursor: pointer;
    font-family: inherit; color: inherit;
    animation: cxIn 0.5s cubic-bezier(0.22,1,0.36,1) both;
    transition: transform 0.2s ease, filter 0.2s ease;
  }
  .cx-card:hover { transform: translateY(-4px) scale(1.02); filter: brightness(1.08); }
  .cx-card:active { transform: scale(0.98); }
  @keyframes cxIn {
    from { opacity: 0; transform: translateY(14px) scale(0.96); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .cx-card-art {
    position: relative; height: 124px; border-radius: 18px; overflow: hidden;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(15,23,42,0.8);
    box-shadow: 0 12px 28px rgba(0,0,0,0.4);
  }
  .cx-card-glow {
    position: absolute; left: 50%; top: 55%; width: 90%; height: 60%;
    transform: translate(-50%,-50%); border-radius: 50%; filter: blur(28px);
    animation: cxGlow 3s ease-in-out infinite; pointer-events: none;
  }
  @keyframes cxGlow {
    0%,100% { opacity: 0.45; transform: translate(-50%,-50%) scale(1); }
    50% { opacity: 0.85; transform: translate(-50%,-50%) scale(1.08); }
  }
  .cx-card-img {
    position: relative; z-index: 1; width: 100%; height: 100%; object-fit: contain;
    filter: drop-shadow(0 12px 20px rgba(0,0,0,0.5));
  }
  .cx-card-fallback {
    position: relative; z-index: 1; width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
  }
  .cx-pill {
    position: absolute; top: 8px; left: 8px; z-index: 2;
    font-size: 9px; font-weight: 900; letter-spacing: 0.06em;
    padding: 3px 7px; border-radius: 999px; color: #fff;
  }
  .cx-pill.ton { background: linear-gradient(135deg,#0ea5e9,#22d3ee); }
  .cx-pill.key { background: linear-gradient(135deg,#7c3aed,#a855f7); }
  .cx-card-name {
    margin-top: 10px; font-weight: 800; font-size: 14px; line-height: 1.25; color: #f1f5f9;
    min-height: 36px;
  }
  .cx-card-cost {
    margin-top: 8px; display: inline-flex; align-items: center; gap: 5px;
    padding: 7px 12px; border-radius: 11px; font-size: 13px; font-weight: 800;
    border: 1px solid rgba(255,255,255,0.1); background: rgba(15,23,42,0.9);
  }
  .cx-card-cost.ok { color: #fde68a; }
  .cx-card-cost.no { color: #64748b; }

  .cx-hero {
    position: relative; height: 200px; display: flex; align-items: center; justify-content: center;
    margin: 8px 0 12px; z-index: 1;
  }
  .cx-hero-glow {
    position: absolute; left: 50%; top: 55%; width: 80%; height: 55%;
    transform: translate(-50%,-50%); border-radius: 50%; filter: blur(36px);
    animation: cxGlow 2.8s ease-in-out infinite; pointer-events: none;
  }
  .cx-hero-img {
    position: relative; z-index: 1; max-height: 180px; max-width: 90%; object-fit: contain;
    filter: drop-shadow(0 20px 40px rgba(0,0,0,0.55));
    animation: cxFloat 3s ease-in-out infinite;
  }
  .cx-hero-fallback {
    position: relative; z-index: 1; width: 160px; height: 160px; border-radius: 28px;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 16px 40px rgba(0,0,0,0.45);
  }
  @keyframes cxFloat {
    0%,100% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
  }

  /* ── CS2-style case strip ── */
  .cx-strip {
    position: relative; overflow: hidden; height: 148px; margin: 14px 0; z-index: 1;
    border-radius: 4px;
    background: linear-gradient(180deg, #0b0e14 0%, #12161f 40%, #0b0e14 100%);
    border: 1px solid rgba(255,255,255,0.07);
    box-shadow: inset 0 0 40px rgba(0,0,0,0.65);
  }
  .cx-strip::before, .cx-strip::after {
    content: ""; position: absolute; top: 0; bottom: 0; width: 48px; z-index: 4; pointer-events: none;
  }
  .cx-strip::before {
    left: 0;
    background: linear-gradient(90deg, rgba(11,14,20,0.95), transparent);
  }
  .cx-strip::after {
    right: 0;
    background: linear-gradient(270deg, rgba(11,14,20,0.95), transparent);
  }
  .cx-strip-spinning .cx-strip-track {
    filter: blur(0.4px);
  }
  .cx-strip-track {
    display: flex; align-items: stretch; height: 100%;
    will-change: transform;
    padding: 10px 0 10px 16px;
  }
  .cx-marker {
    position: absolute; left: 50%; top: 0; bottom: 0; width: 2px;
    background: rgba(255,255,255,0.85); transform: translateX(-50%);
    z-index: 5; opacity: 0.35; transition: opacity 0.35s ease, box-shadow 0.35s ease;
    pointer-events: none;
  }
  .cx-marker-on {
    opacity: 0.95 !important;
    box-shadow: 0 0 10px rgba(255,255,255,0.55), 0 0 22px rgba(250,204,21,0.35);
  }
  .cx-pointer {
    position: absolute; left: 50%; z-index: 6; width: 0; height: 0;
    transform: translateX(-50%);
    opacity: 0; transition: opacity 0.3s ease;
    pointer-events: none;
  }
  .cx-pointer-on { opacity: 1; }
  .cx-pointer-top {
    top: -1px;
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-top: 12px solid #f0c14b;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
  }
  .cx-pointer-bot {
    bottom: -1px;
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-bottom: 12px solid #f0c14b;
    filter: drop-shadow(0 -2px 4px rgba(0,0,0,0.5));
  }
  .cx-strip-item {
    width: 108px; flex-shrink: 0;
    display: flex; flex-direction: column;
    border-radius: 3px;
    background: linear-gradient(180deg, #1a1f2b 0%, #12161f 100%);
    border: 1px solid rgba(255,255,255,0.06);
    overflow: hidden;
    transition: transform 0.35s cubic-bezier(0.22,1,0.36,1), opacity 0.35s ease, box-shadow 0.35s ease, border-color 0.35s ease;
  }
  .cx-strip-body {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 6px; padding: 10px 6px 6px;
  }
  .cx-strip-img {
    width: 56px; height: 56px; object-fit: contain;
    filter: drop-shadow(0 4px 10px rgba(0,0,0,0.45));
  }
  .cx-strip-lbl {
    font-size: 10px; font-weight: 700; color: #c8d0dc;
    text-align: center; line-height: 1.2; max-width: 100%;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    padding: 0 4px;
  }
  .cx-rarity-bar {
    height: 5px; width: 100%; flex-shrink: 0;
  }
  .cx-rarity-bar-blue { background: linear-gradient(90deg, #4b69ff, #6a8dff); }
  .cx-rarity-bar-purple { background: linear-gradient(90deg, #8847ff, #a86bff); }
  .cx-rarity-bar-pink { background: linear-gradient(90deg, #d32ce6, #e85af5); }
  .cx-rarity-bar-red { background: linear-gradient(90deg, #eb4b4b, #ff6b6b); }
  .cx-rarity-bar-gold { background: linear-gradient(90deg, #ffae00, #ffd700, #ffae00); box-shadow: 0 0 10px rgba(255,174,0,0.45); }

  .cx-rarity-blue { box-shadow: inset 0 -1px 0 rgba(75,105,255,0.25); }
  .cx-rarity-purple { box-shadow: inset 0 -1px 0 rgba(136,71,255,0.3); }
  .cx-rarity-pink { box-shadow: inset 0 -1px 0 rgba(211,44,230,0.35); }
  .cx-rarity-red { box-shadow: inset 0 -1px 0 rgba(235,75,75,0.4); }
  .cx-rarity-gold { box-shadow: inset 0 -1px 0 rgba(255,174,0,0.45); }

  .cx-strip-win {
    transform: scale(1.06);
    z-index: 2;
    border-color: rgba(255,215,0,0.85) !important;
    box-shadow:
      0 0 0 2px rgba(255,215,0,0.55),
      0 0 28px rgba(255,174,0,0.45),
      0 12px 28px rgba(0,0,0,0.5) !important;
    animation: cxWinPulse 0.9s ease-out both;
  }
  .cx-strip-dim {
    opacity: 0.28;
    filter: grayscale(0.35) brightness(0.7);
  }
  @keyframes cxWinPulse {
    0% { transform: scale(1); }
    40% { transform: scale(1.1); }
    100% { transform: scale(1.06); }
  }

  .cx-win {
    text-align: center; padding: 18px 12px; margin: 10px 0; z-index: 1; position: relative;
    animation: cxIn 0.5s cubic-bezier(0.22,1,0.36,1) both;
  }
  .cx-win-glow {
    position: absolute; left: 50%; top: 40%; width: 160px; height: 100px;
    transform: translate(-50%,-50%); border-radius: 50%; filter: blur(36px);
    pointer-events: none; opacity: 0.55;
  }
  .cx-win-blue .cx-win-glow { background: #4b69ff; }
  .cx-win-purple .cx-win-glow { background: #8847ff; }
  .cx-win-pink .cx-win-glow { background: #d32ce6; }
  .cx-win-red .cx-win-glow { background: #eb4b4b; }
  .cx-win-gold .cx-win-glow { background: #ffae00; opacity: 0.7; }
  .cx-win-img {
    position: relative; z-index: 1;
    width: 96px; height: 96px; object-fit: contain;
    filter: drop-shadow(0 0 24px rgba(255,255,255,0.25));
    animation: cxWinImg 0.6s cubic-bezier(0.22,1,0.36,1) both;
  }
  @keyframes cxWinImg {
    from { transform: scale(0.7); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
  .cx-win-title { position: relative; z-index: 1; font-weight: 900; font-size: 22px; color: #f8fafc; margin-top: 10px; letter-spacing: -0.02em; }
  .cx-win-price { position: relative; z-index: 1; font-size: 14px; font-weight: 800; color: #fbbf24; margin-top: 4px; }
  .cx-win-sub { position: relative; z-index: 1; font-size: 12px; color: #94a3b8; margin-top: 6px; }
  .cx-win-gold .cx-win-title { color: #ffd700; }
  .cx-win-red .cx-win-title { color: #ff8a8a; }
  .cx-win-pink .cx-win-title { color: #f0a0ff; }
  .cx-win-purple .cx-win-title { color: #c4b5fd; }

  .cx-open {
    width: 100%; margin-top: 14px; padding: 15px 0; border-radius: 16px; border: none;
    color: #fff; font-weight: 900; font-size: 15px; cursor: pointer; font-family: inherit;
    box-shadow: 0 10px 28px rgba(124,58,237,0.35);
    position: relative; z-index: 1;
  }

  .cx-rewards {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
    position: relative; z-index: 1;
  }
  .cx-drop {
    background: rgba(15,23,42,0.92); border: 1px solid rgba(51,65,85,0.65);
    border-radius: 16px; padding: 12px; text-align: center;
    transition: transform 0.15s ease, border-color 0.15s ease;
  }
  .cx-drop:hover { transform: scale(1.03); border-color: rgba(168,85,247,0.45); }
  .cx-drop-img-wrap { position: relative; height: 64px; display: flex; align-items: center; justify-content: center; margin-bottom: 6px; }
  .cx-drop-img { width: 56px; height: 56px; object-fit: contain; filter: drop-shadow(0 6px 12px rgba(0,0,0,0.35)); }
  .cx-frag {
    position: absolute; right: 8px; bottom: 0; font-size: 14px;
    background: rgba(15,23,42,0.9); border-radius: 8px; padding: 2px 4px;
  }
  .cx-drop-label { font-size: 11px; font-weight: 700; color: #e2e8f0; line-height: 1.3; min-height: 28px; }
  .cx-drop-price { font-size: 11px; font-weight: 800; color: #fbbf24; margin-top: 4px; }
  .cx-drop-chance { font-size: 11px; color: #94a3b8; margin-top: 4px; font-weight: 600; }

  .cx-strip-lit {
    border-color: rgba(168,85,247,0.45);
    box-shadow: inset 0 0 40px rgba(0,0,0,0.45), 0 0 28px rgba(124,58,237,0.25);
  }
  .cx-marker-on {
    opacity: 1 !important;
    box-shadow: 0 0 16px rgba(168,85,247,0.9), 0 0 32px rgba(124,58,237,0.5);
  }
  .cx-beam {
    position: absolute; left: 50%; top: 0; bottom: 0; width: 64px;
    transform: translateX(-50%);
    background: linear-gradient(90deg, transparent, rgba(168,85,247,0.2), transparent);
    z-index: 2; opacity: 0; pointer-events: none; transition: opacity 0.6s ease;
  }
  .cx-beam-on { opacity: 1; }
  .cx-drop-common { border-color: rgba(148,163,184,0.25); }
  .cx-drop-rare {
    border-color: rgba(56,189,248,0.4);
    box-shadow: 0 8px 20px rgba(0,0,0,0.3), 0 0 16px rgba(14,165,233,0.12);
  }
  .cx-drop-epic {
    border-color: rgba(168,85,247,0.5);
    box-shadow: 0 8px 20px rgba(0,0,0,0.3), 0 0 18px rgba(124,58,237,0.18);
  }
  .cx-drop-legendary {
    border-color: rgba(250,204,21,0.55);
    box-shadow: 0 8px 20px rgba(0,0,0,0.3), 0 0 22px rgba(234,179,8,0.2);
  }
  .cx-card-shine {
    position: absolute; inset: 0; z-index: 2; pointer-events: none;
    background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.14) 48%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0.12) 52%, transparent 65%);
    background-size: 220% 100%;
    animation: cxShine 4.5s ease-in-out infinite;
  }
  @keyframes cxShine {
    0% { background-position: 120% 0; }
    40%,100% { background-position: -120% 0; }
  }
`;
