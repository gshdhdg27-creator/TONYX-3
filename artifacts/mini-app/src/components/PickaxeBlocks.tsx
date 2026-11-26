import type { CSSProperties, ReactNode } from "react";

export type BlockKind =
  | "air" | "dirt" | "stone" | "copper" | "redstone" | "gold"
  | "diamond" | "emerald" | "bench" | "arrow" | "tnt" | "slime";

export type PickTier = "wood" | "iron" | "gold" | "diamond" | null;

export const TIER_HP = { wood: 100, iron: 150, gold: 200, diamond: 400 } as const;
export const TIER_ORDER: Exclude<PickTier, null>[] = ["wood", "iron", "gold", "diamond"];
export const TIER_LABEL = { wood: "Деревянная", iron: "Железная", gold: "Золотая", diamond: "Алмазная" } as const;
export const TIER_COLOR = { wood: "#c47a3a", iron: "#a8b0b8", gold: "#f5c542", diamond: "#5eead4" } as const;

export const BLOCK_DEF: Record<BlockKind, { maxHp: number; mult: number }> = {
  air: { maxHp: 0, mult: 0 }, dirt: { maxHp: 1, mult: 0 }, stone: { maxHp: 1, mult: 0 },
  copper: { maxHp: 5, mult: 0.01 }, redstone: { maxHp: 10, mult: 0.05 }, gold: { maxHp: 15, mult: 0.2 },
  diamond: { maxHp: 20, mult: 1 }, emerald: { maxHp: 30, mult: 5 },
  bench: { maxHp: 1, mult: 0 }, arrow: { maxHp: 1, mult: 0 }, tnt: { maxHp: 1, mult: 0 }, slime: { maxHp: 999, mult: 0 },
};

function StoneBase({ children }: { children?: ReactNode }) {
  return (
    <div style={{
      width: "100%", height: "100%", position: "relative", boxSizing: "border-box",
      imageRendering: "pixelated", overflow: "hidden",
      background: `repeating-linear-gradient(0deg, transparent 0 6px, rgba(0,0,0,.18) 6px 7px),
        repeating-linear-gradient(90deg, transparent 0 8px, rgba(0,0,0,.12) 8px 9px),
        linear-gradient(180deg, #9aa3ad 0%, #7d8793 40%, #6b7480 70%, #5a636e 100%)`,
      border: "1px solid #3d4450",
      boxShadow: "inset 1px 1px 0 #c5ccd4, inset -1px -1px 0 #3d4450",
    }}>{children}</div>
  );
}

function OreDots({ colors }: { colors: string[] }) {
  const spots = [
    { l: "18%", t: "22%", s: 5 }, { l: "55%", t: "18%", s: 4 }, { l: "72%", t: "38%", s: 5 },
    { l: "28%", t: "52%", s: 4 }, { l: "48%", t: "62%", s: 6 }, { l: "68%", t: "72%", s: 4 },
    { l: "22%", t: "78%", s: 3 }, { l: "82%", t: "58%", s: 4 },
  ];
  return (
    <>
      {spots.map((p, i) => (
        <div key={i} style={{
          position: "absolute", left: p.l, top: p.t, width: p.s, height: p.s,
          background: colors[i % colors.length],
          boxShadow: `1px 1px 0 ${colors[(i + 1) % colors.length]}`,
          imageRendering: "pixelated",
        }} />
      ))}
    </>
  );
}

function CrackOverlay({ ratio }: { ratio: number }) {
  return (
    <div style={{
      position: "absolute", inset: 0, pointerEvents: "none", opacity: 1 - ratio,
      background: `linear-gradient(135deg, transparent 40%, rgba(0,0,0,.35) 42%, transparent 44%),
        linear-gradient(45deg, transparent 55%, rgba(0,0,0,.3) 57%, transparent 59%)`,
    }} />
  );
}

export function BlockFace({ kind, cracked, hp, maxHp }: { kind: BlockKind; cracked: boolean; hp: number; maxHp: number }) {
  const base: CSSProperties = {
    width: "100%", height: "100%", position: "relative", boxSizing: "border-box",
    imageRendering: "pixelated", overflow: "hidden",
  };
  if (kind === "air") return null;
  if (kind === "dirt") {
    return (
      <div style={{
        ...base,
        background: `linear-gradient(180deg, #6fbf3a 0 22%, #5a9e2e 22% 28%, transparent 28%),
          repeating-linear-gradient(90deg, #7a5230 0 3px, #6b4423 3px 6px, #8a5a38 6px 9px), #6b4423`,
        border: "1px solid #3e2723",
        boxShadow: "inset 1px 1px 0 #a07850, inset -1px -1px 0 #3e2723",
      }}>{cracked && <CrackOverlay ratio={hp / maxHp} />}</div>
    );
  }
  if (kind === "stone") return <StoneBase>{cracked && <CrackOverlay ratio={hp / maxHp} />}</StoneBase>;
  if (kind === "copper") return <StoneBase><OreDots colors={["#e07a3a", "#c4682e", "#f0a060", "#d47840"]} />{cracked && <CrackOverlay ratio={hp / maxHp} />}</StoneBase>;
  if (kind === "redstone") return <StoneBase><OreDots colors={["#e02020", "#ff4040", "#c01010", "#ff6060"]} />{cracked && <CrackOverlay ratio={hp / maxHp} />}</StoneBase>;
  if (kind === "gold") return <StoneBase><OreDots colors={["#f8c820", "#f0a010", "#ffe040", "#e09000"]} />{cracked && <CrackOverlay ratio={hp / maxHp} />}</StoneBase>;
  if (kind === "diamond") {
    return (
      <div style={{
        ...base,
        background: "linear-gradient(145deg, #7ef0ff 0%, #3dd0f0 30%, #20b8e0 60%, #1890c0 100%)",
        border: "1px solid #0a6080", boxShadow: "inset 1px 1px 0 #c8f8ff, inset -1px -1px 0 #0a6080",
      }}>
        <div style={{ position: "absolute", left: "12%", top: "15%", width: 8, height: 8, background: "#e8fcff", opacity: 0.9, transform: "rotate(45deg)" }} />
        <div style={{ position: "absolute", left: "55%", top: "25%", width: 6, height: 6, background: "#b0f0ff", opacity: 0.85, transform: "rotate(45deg)" }} />
        <div style={{ position: "absolute", left: "30%", top: "55%", width: 7, height: 7, background: "#d0f8ff", opacity: 0.8, transform: "rotate(45deg)" }} />
        {cracked && <CrackOverlay ratio={hp / maxHp} />}
      </div>
    );
  }
  if (kind === "emerald") {
    return (
      <div style={{
        ...base,
        background: "linear-gradient(145deg, #6ef080 0%, #30d050 35%, #18b038 65%, #0e9030 100%)",
        border: "1px solid #0a6020", boxShadow: "inset 1px 1px 0 #c8ffd0, inset -1px -1px 0 #0a6020",
      }}>
        <div style={{ position: "absolute", left: "15%", top: "18%", width: 7, height: 7, background: "#e0ffe8", opacity: 0.9, transform: "rotate(45deg)" }} />
        <div style={{ position: "absolute", left: "58%", top: "30%", width: 6, height: 6, background: "#a0f0b0", opacity: 0.85, transform: "rotate(45deg)" }} />
        {cracked && <CrackOverlay ratio={hp / maxHp} />}
      </div>
    );
  }
  if (kind === "tnt") {
    return (
      <div style={{
        ...base,
        background: "repeating-linear-gradient(0deg, #f0f0f0 0 4px, #e02020 4px 8px)",
        border: "1px solid #800000", boxShadow: "inset 1px 1px 0 #fff, inset -1px -1px 0 #600000",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 8, fontWeight: 900, color: "#111", background: "rgba(255,255,255,.7)", padding: "1px 3px", fontFamily: "monospace" }}>TNT</span>
      </div>
    );
  }
  if (kind === "arrow") {
    return (
      <div style={{
        ...base,
        background: "repeating-linear-gradient(90deg, #c4883a 0 4px, #a87028 4px 8px), #b87830",
        border: "1px solid #6b4423", boxShadow: "inset 1px 1px 0 #e0b070, inset -1px -1px 0 #6b4423",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          width: 16, height: 16, background: "#22e050",
          clipPath: "polygon(50% 0%, 100% 42%, 68% 42%, 68% 100%, 32% 100%, 32% 42%, 0% 42%)",
          filter: "drop-shadow(0 1px 0 #0a6020)",
        }} />
      </div>
    );
  }
  if (kind === "bench") {
    return (
      <div style={{
        ...base,
        background: "linear-gradient(180deg, #c4883a 0 35%, #a87028 35% 100%)",
        border: "1px solid #5a3a18", boxShadow: "inset 1px 1px 0 #e0b070, inset -1px -1px 0 #5a3a18",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ width: 18, height: 14, background: "#d4a050", border: "1px solid #5a3a18", position: "relative", boxShadow: "inset 0 2px 0 #f0d090" }}>
          <div style={{ position: "absolute", top: 3, left: 2, right: 2, height: 1, background: "#5a3a18" }} />
          <div style={{ position: "absolute", top: 6, left: 2, right: 2, height: 1, background: "#5a3a18" }} />
          <div style={{ position: "absolute", bottom: 2, left: 3, width: 4, height: 4, background: "#5a3a18" }} />
          <div style={{ position: "absolute", bottom: 2, right: 3, width: 4, height: 4, background: "#5a3a18" }} />
        </div>
      </div>
    );
  }
  if (kind === "slime") {
    return (
      <div style={{
        ...base,
        background: `radial-gradient(circle at 30% 25%, #c8ffd0 0 4px, transparent 5px),
          radial-gradient(circle at 70% 55%, #80f0a0 0 3px, transparent 4px),
          linear-gradient(145deg, #50e070 0%, #28c048 50%, #18a038 100%)`,
        border: "1px solid #0a6020", boxShadow: "inset 1px 1px 0 #d0ffd8, inset -1px -1px 0 #0a6020", borderRadius: 2,
      }} />
    );
  }
  return <div style={{ ...base, background: "#555" }} />;
}

export function PickSprite({ tier, size }: { tier: Exclude<PickTier, null>; size: number }) {
  const head = TIER_COLOR[tier];
  return (
    <div style={{ width: size, height: size, position: "relative", imageRendering: "pixelated" }}>
      <div style={{ position: "absolute", left: "42%", top: "35%", width: "16%", height: "55%", background: "#8B5A2B", borderRadius: 1 }} />
      <div style={{ position: "absolute", left: "18%", top: "18%", width: "64%", height: "28%", background: head, borderRadius: 2, boxShadow: `0 0 6px ${head}` }} />
      <div style={{ position: "absolute", left: "8%", top: "12%", width: "22%", height: "18%", background: head, transform: "rotate(-35deg)" }} />
      <div style={{ position: "absolute", right: "8%", top: "12%", width: "22%", height: "18%", background: head, transform: "rotate(35deg)" }} />
    </div>
  );
}
