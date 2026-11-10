import { useEffect, useRef, useState, type CSSProperties } from "react";
import { casesApi, type CaseListItem, type CaseRewardPreview } from "@/lib/casesApi";
import { haptic, hapticNotify } from "@/lib/telegram";
import { getCasesCache, setCasesCache, refreshCasesInBackground } from "@/lib/dataCache";
import { CASES_CSS } from "./casesGameCss";

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
  ton_0_1: { emoji: "💎", gradient: "linear-gradient(145deg,#0e7490,#22d3ee 50%,#083344)", glow: "rgba(34,211,238,0.55)", image: "/cases/ton_0_1.svg" },
  ton_1: { emoji: "🪙", gradient: "linear-gradient(145deg,#334155,#94a3b8 45%,#1e293b)", glow: "rgba(148,163,184,0.55)", image: "/cases/ton_1.svg" },
  ton_2_5: { emoji: "✨", gradient: "linear-gradient(145deg,#854d0e,#eab308 45%,#422006)", glow: "rgba(234,179,8,0.6)", image: "/cases/ton_2_5.svg" },
  ton_5: { emoji: "💠", gradient: "linear-gradient(145deg,#1e3a5f,#67e8f9 45%,#0c4a6e)", glow: "rgba(103,232,249,0.55)", image: "/cases/ton_5.svg" },
  ton_10: { emoji: "👑", gradient: "linear-gradient(145deg,#4c1d95,#c084fc 40%,#2e1065)", glow: "rgba(192,132,252,0.65)", image: "/cases/ton_10.svg" },
  ton_basic: { emoji: "💎", gradient: "linear-gradient(145deg,#0e7490,#22d3ee 50%,#083344)", glow: "rgba(34,211,238,0.55)", image: "/cases/ton_0_1.svg" },
  tonyx_basic: { emoji: "🪙", gradient: "linear-gradient(145deg,#3b0764,#a855f7 50%,#1e1b4b)", glow: "rgba(168,85,247,0.6)", image: "/cases/ton_1.svg" },
};

function costLabel(c: CaseListItem, lang: Lang): string {
  if (c.costType === "key") {
    return lang === "en" ? `Boss ${c.costValue} · ${c.have}` : `Босс ${c.costValue} · ${c.have}`;
  }
  if (c.costType === "ton") return `${c.costValue} TON`;
  return `${c.costValue} TX`;
}

function caseImage(c: { id: string; imageUrl?: string | null }): string | null {
  // Prefer local CASE_ART (boss jpg / ton svg). Server may still send missing .jpg paths.
  const art = CASE_ART[c.id]?.image;
  if (art) return art;
  if (c.imageUrl) return c.imageUrl;
  return null;
}

function rewardImage(r: { type?: string; nftId?: string; imageUrl?: string | null }): string {
  if (r.imageUrl) return r.imageUrl;
  if (r.type === "ton") return TON_IMG;
  if (r.type === "tonyx") return TONYX_IMG;
  if (r.nftId) return `${TG_PHOTOS}${r.nftId}.webp`;
  return TON_IMG;
}

function rewardLabel(r: Reward, lang: Lang): string {
  if (r.label) return r.label;
  if (r.type === "ton") return `+${r.amount ?? 0} TON`;
  if (r.type === "tonyx") return `+${r.amount ?? 0} TONYX`;
  if (r.type === "nft_fragment") return lang === "en" ? `Fragment` : `Фрагмент`;
  if (r.type === "nft_full") return lang === "en" ? `NFT` : `NFT`;
  return String(r.type);
}

function rarityFromChance(pct: number): string {
  if (pct >= 30) return "common";
  if (pct >= 15) return "uncommon";
  if (pct >= 7) return "rare";
  if (pct >= 2) return "epic";
  return "legendary";
}

function stripRarity(r: Reward | CaseRewardPreview): "blue" | "purple" | "pink" | "red" | "gold" {
  if (r.type === "nft_full") return "gold";
  if (r.type === "nft_fragment") {
    const v = (r as Reward).valueTon ?? 0;
    if (v >= 100) return "gold";
    if (v >= 30) return "red";
    if (v >= 15) return "pink";
    if (v >= 7) return "purple";
    return "blue";
  }
  if (r.type === "ton") {
    const a = (r as Reward).amount ?? 0;
    if (a >= 5) return "gold";
    if (a >= 2) return "red";
    if (a >= 0.5) return "pink";
    if (a >= 0.15) return "purple";
    return "blue";
  }
  const a = (r as Reward).amount ?? 0;
  if (a >= 2000) return "red";
  if (a >= 500) return "pink";
  if (a >= 100) return "purple";
  return "blue";
}

const ITEM_W = 108;
const ITEM_GAP = 8;
const WIN_INDEX = 52;
const STRIP_LEN = 70;

function buildStrip(win: Reward, pool: CaseRewardPreview[]): Reward[] {
  const items: Reward[] = [];
  const base = pool.length
    ? pool
    : [{ type: "tonyx", weight: 1, minAmount: 1, maxAmount: 1 } as CaseRewardPreview];
  for (let i = 0; i < STRIP_LEN; i++) {
    if (i === WIN_INDEX) {
      items.push(win);
      continue;
    }
    const p = base[Math.floor(Math.random() * base.length)];
    const amt =
      p.minAmount != null && p.maxAmount != null && p.minAmount === p.maxAmount
        ? p.minAmount
        : p.minAmount != null
          ? p.minAmount + Math.random() * ((p.maxAmount ?? p.minAmount) - p.minAmount)
          : undefined;
    items.push({
      type: p.type,
      amount: amt != null ? Math.round(amt * 10000) / 10000 : undefined,
      nftId: p.nftId,
      imageUrl: (p as CaseRewardPreview & { imageUrl?: string }).imageUrl ?? null,
      valueTon: p.valueTon ?? null,
      label: undefined,
    });
  }
  return items;
}

function cs2EaseFixed(t: number): number {
  const c1 = 1 - Math.pow(1 - t, 2.8);
  const c2 = 1 - Math.pow(1 - t, 5.5);
  const w = t * t;
  return c1 * (1 - w) + c2 * w;
}

function artFor(id: string) {
  return CASE_ART[id] ?? {
    emoji: "📦",
    gradient: "linear-gradient(145deg,#1e293b,#334155)",
    glow: "rgba(148,163,184,0.4)",
  };
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
  const [strip, setStrip] = useState<Reward[]>([]);
  const [offset, setOffset] = useState(0);
  const [lightOn, setLightOn] = useState(false);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<number | null>(null);

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

      const finalBal = res.balances;
      const midBal = { ton: finalBal.ton, tonyx: finalBal.tonyx };
      if (reward.type === "ton" && reward.amount) {
        midBal.ton = Math.round((finalBal.ton - Number(reward.amount)) * 1e8) / 1e8;
      } else if (reward.type === "tonyx" && reward.amount) {
        midBal.tonyx = Math.max(0, finalBal.tonyx - Math.floor(Number(reward.amount)));
      }
      onBalances?.(midBal);
      (window as any).__casesFinalBal = finalBal;

      setCases((prev) =>
        prev.map((x) => {
          if (x.id !== c.id) return x;
          if (x.costType === "key") {
            const have = Math.max(0, x.have - 1);
            return { ...x, have, canOpen: have >= 1 };
          }
          if (x.costType === "ton") return { ...x, have: midBal.ton, canOpen: midBal.ton >= x.costValue };
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

      const items = buildStrip(reward, c.possibleRewards ?? []);
      setStrip(items);
      setOffset(0);
      setSpinning(true);
      setWon(null);
      setLightOn(false);
      window.setTimeout(() => setLightOn(true), 180);

      requestAnimationFrame(() => {
        const box = stripRef.current;
        const viewW = box?.clientWidth ?? 320;
        const step = ITEM_W + ITEM_GAP;
        const jitter = (Math.random() - 0.5) * (ITEM_W * 0.55);
        const target = WIN_INDEX * step + ITEM_W / 2 - viewW / 2 + jitter;
        const duration = 7200;
        const start = performance.now();
        let lastTick = -1;

        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          const ease = cs2EaseFixed(t);
          const pos = target * ease;
          setOffset(pos);

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
            window.setTimeout(() => {
              const fb = (window as any).__casesFinalBal as { ton: number; tonyx: number } | undefined;
              if (fb) {
                onBalances?.(fb);
                setCases((prev) =>
                  prev.map((x) => {
                    if (x.costType === "ton") return { ...x, have: fb.ton, canOpen: fb.ton >= x.costValue };
                    if (x.costType === "tonyx") return { ...x, have: fb.tonyx, canOpen: fb.tonyx >= x.costValue };
                    return x;
                  }),
                );
              }
            }, 1000);
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
        <style>{CASES_CSS}</style>
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
            {costLabel(selected, lang)}
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
            <div className={`cx-pointer cx-pointer-top ${lightOn ? "cx-pointer-on" : ""}`} />
            <div className={`cx-pointer cx-pointer-bot ${lightOn ? "cx-pointer-on" : ""}`} />
            <div className={`cx-marker ${lightOn ? "cx-marker-on" : ""}`} />
            <div className={`cx-beam ${lightOn ? "cx-beam-on" : ""}`} />
            <div
              className="cx-strip-track"
              style={{ transform: `translate3d(${-offset}px,0,0)`, gap: ITEM_GAP }}
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
      <style>{CASES_CSS}</style>
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
                  {costLabel(c, lang)}
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
