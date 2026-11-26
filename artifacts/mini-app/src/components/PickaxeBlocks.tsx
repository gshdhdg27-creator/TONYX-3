import type { CSSProperties, ReactNode } from "react";

export type BlockKind =
  | "air" | "dirt" | "stone" | "copper" | "redstone" | "gold"
  | "diamond" | "emerald" | "bench" | "arrow" | "tnt" | "slime";

export type PickTier = "wood" | "stone" | "iron" | "diamond" | null;

export const TIER_HP = { wood: 100, stone: 150, iron: 200, diamond: 400 } as const;
export const TIER_ORDER: Exclude<PickTier, null>[] = ["wood", "stone", "iron", "diamond"];
export const TIER_LABEL = { wood: "Wood", stone: "Stone", iron: "Iron", diamond: "Diamond" } as const;
export const TIER_COLOR = { wood: "#c47a3a", stone: "#9ca3af", iron: "#d1d5db", diamond: "#5eead4" } as const;

export const BLOCK_DEF: Record<BlockKind, { maxHp: number; mult: number }> = {
  air: { maxHp: 0, mult: 0 },
  dirt: { maxHp: 1, mult: 0 },
  stone: { maxHp: 1, mult: 0 },
  copper: { maxHp: 5, mult: 0.01 },
  redstone: { maxHp: 10, mult: 0.05 },
  gold: { maxHp: 15, mult: 0.2 },
  diamond: { maxHp: 20, mult: 1 },
  emerald: { maxHp: 30, mult: 5 },
  bench: { maxHp: 1, mult: 0 },
  arrow: { maxHp: 1, mult: 0 },
  tnt: { maxHp: 1, mult: 0 },
  slime: { maxHp: 999, mult: 0 },
};

function StoneBase({ children }: { children?: ReactNode }) {
  return (
    <div style={{
      width: "100%", height: "100%", position: "relative", boxSizing: "border-box",
      imageRendering: "pixelated", overflow: "hidden",
      background: `repeating-linear-gradient(0deg, #7a8490 0 6px, #5e6772 6px 7px, #6b7580 7px 13px, #4e5660 13px 14px),
        repeating-linear-gradient(90deg, transparent 0 8px, rgba(0,0,0,.22) 8px 9px), #6b7580`,
      border: "1px solid #2a3038",
      boxShadow: "inset 1px 1px 0 rgba(255,255,255,.18), inset -1px -1px 0 rgba(0,0,0,.4)",
    }}>{children}</div>
  );
}

function OreDots({ colors }: { colors: string[] }) {
  const spots = [
    { l: 4, t: 5, s: 7 }, { l: 14, t: 3, s: 6 }, { l: 20, t: 10, s: 7 },
    { l: 6, t: 14, s: 6 }, { l: 13, t: 17, s: 8 }, { l: 21, t: 20, s: 6 },
    { l: 3, t: 22, s: 5 }, { l: 24, t: 15, s: 6 }, { l: 10, t: 8, s: 5 },
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
  const op = Math.max(0, Math.min(1, 1 - ratio));
  if (op < 0.05) return null;
  return (
    <div style={{
      position: "absolute", inset: 0, pointerEvents: "none", opacity: op,
      background: `linear-gradient(135deg, transparent 36%, rgba(0,0,0,.55) 38%, transparent 40%),
        linear-gradient(50deg, transparent 48%, rgba(0,0,0,.5) 50%, transparent 52%),
        linear-gradient(100deg, transparent 28%, rgba(0,0,0,.4) 30%, transparent 32%),
        linear-gradient(0deg, transparent 60%, rgba(0,0,0,.35) 62%, transparent 64%)`,
    }} />
  );
}

export function BlockFace({ kind, cracked, hp, maxHp }: { kind: BlockKind; cracked: boolean; hp: number; maxHp: number }) {
  const base: CSSProperties = {
    width: "100%", height: "100%", position: "relative",
    boxSizing: "border-box", imageRendering: "pixelated", overflow: "hidden",
  };
  if (kind === "air") return null;
  if (kind === "dirt") {
    return (
      <div style={{
        ...base,
        background: `linear-gradient(180deg, #6fbf3a 0 16%, #5a9e2e 16% 22%, transparent 22%),
          repeating-linear-gradient(90deg, #7a5230 0 4px, #6b4423 4px 8px, #8a5a38 8px 12px), #6b4423`,
        border: "1px solid #3e2723",
        boxShadow: "inset 1px 1px 0 #a07850, inset -1px -1px 0 #3e2723",
      }}>{cracked && <CrackOverlay ratio={hp / maxHp} />}</div>
    );
  }
  if (kind === "stone") return <StoneBase>{cracked && <CrackOverlay ratio={hp / maxHp} />}</StoneBase>;
  if (kind === "copper") return <StoneBase><OreDots colors={["#e07a3a", "#c4682e", "#f0a060", "#d47840"]} />{cracked && <CrackOverlay ratio={hp / maxHp} />}</StoneBase>;
  if (kind === "redstone") return <StoneBase><OreDots colors={["#ff2828", "#e00808", "#ff4848", "#c00000"]} />{cracked && <CrackOverlay ratio={hp / maxHp} />}</StoneBase>;
  if (kind === "gold") return <StoneBase><OreDots colors={["#ffd020", "#f0a010", "#ffe850", "#e09000"]} />{cracked && <CrackOverlay ratio={hp / maxHp} />}</StoneBase>;
  if (kind === "diamond") {
    return (
      <div style={{
        ...base,
        background: "linear-gradient(145deg, #b0fcff 0%, #48d4f4 22%, #20b8e8 50%, #1090c8 100%)",
        border: "1px solid #0870a0",
        boxShadow: "inset 2px 2px 0 #f0ffff, inset -2px -2px 0 #086080",
      }}>
        <div style={{ position: "absolute", left: "16%", top: "18%", width: 11, height: 11, background: "#f8ffff", opacity: 0.95, transform: "rotate(45deg)" }} />
        <div style={{ position: "absolute", left: "52%", top: "26%", width: 8, height: 8, background: "#c8f4ff", opacity: 0.9, transform: "rotate(45deg)" }} />
        <div style={{ position: "absolute", left: "30%", top: "55%", width: 9, height: 9, background: "#e8fcff", opacity: 0.85, transform: "rotate(45deg)" }} />
        {cracked && <CrackOverlay ratio={hp / maxHp} />}
      </div>
    );
  }
  if (kind === "emerald") {
    return (
      <div style={{
        ...base,
        background: "linear-gradient(145deg, #88f098 0%, #30d050 28%, #18b038 58%, #0e9028 100%)",
        border: "1px solid #0a6020",
        boxShadow: "inset 2px 2px 0 #d8ffe0, inset -2px -2px 0 #0a6020",
      }}>
        <div style={{ position: "absolute", left: "18%", top: "20%", width: 10, height: 10, background: "#f0fff0", opacity: 0.9, transform: "rotate(45deg)" }} />
        <div style={{ position: "absolute", left: "55%", top: "38%", width: 7, height: 7, background: "#a8f0b8", opacity: 0.85, transform: "rotate(45deg)" }} />
        {cracked && <CrackOverlay ratio={hp / maxHp} />}
      </div>
    );
  }
  if (kind === "tnt") {
    return (
      <div style={{
        ...base,
        background: "repeating-linear-gradient(0deg, #f5f5f5 0 5px, #e01818 5px 10px)",
        border: "1px solid #800000",
        boxShadow: "inset 1px 1px 0 #fff, inset -1px -1px 0 #600000",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 9, fontWeight: 900, color: "#111", background: "rgba(255,255,255,.8)", padding: "1px 4px", fontFamily: "monospace" }}>TNT</span>
      </div>
    );
  }
  if (kind === "arrow") {
    return (
      <div style={{
        ...base,
        background: "repeating-linear-gradient(90deg, #c89848 0 5px, #a87830 5px 10px), #b88838",
        border: "1px solid #6b4423",
        boxShadow: "inset 1px 1px 0 #e0b870, inset -1px -1px 0 #6b4423",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          width: 18, height: 18, background: "#22e048",
          clipPath: "polygon(50% 0%, 100% 40%, 68% 40%, 68% 100%, 32% 100%, 32% 40%, 0% 40%)",
          filter: "drop-shadow(0 1px 0 #0a6020)",
        }} />
      </div>
    );
  }
  if (kind === "bench") {
    return (
      <div style={{
        ...base,
        background: "linear-gradient(180deg, #c89848 0 40%, #a87830 40% 100%)",
        border: "1px solid #5a3a18",
        boxShadow: "inset 1px 1px 0 #e0b870, inset -1px -1px 0 #5a3a18",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ width: 20, height: 16, background: "#d4a050", border: "1px solid #5a3a18", position: "relative", boxShadow: "inset 0 2px 0 #f0d090" }}>
          <div style={{ position: "absolute", top: 3, left: 2, right: 2, height: 1, background: "#5a3a18" }} />
          <div style={{ position: "absolute", top: 7, left: 2, right: 2, height: 1, background: "#5a3a18" }} />
          <div style={{ position: "absolute", bottom: 2, left: 3, width: 5, height: 5, background: "#5a3a18" }} />
          <div style={{ position: "absolute", bottom: 2, right: 3, width: 5, height: 5, background: "#5a3a18" }} />
        </div>
      </div>
    );
  }
  if (kind === "slime") {
    return (
      <div style={{
        ...base,
        background: `radial-gradient(circle at 30% 25%, #c8ffd0 0 5px, transparent 6px),
          radial-gradient(circle at 70% 55%, #80f0a0 0 4px, transparent 5px),
          linear-gradient(145deg, #50e070 0%, #28c048 50%, #18a038 100%)`,
        border: "1px solid #0a6020",
        boxShadow: "inset 1px 1px 0 #d0ffd8, inset -1px -1px 0 #0a6020",
        borderRadius: 2,
      }} />
    );
  }
  return <div style={{ ...base, background: "#555" }} />;
}

export function PickSprite({ tier, size }: { tier: Exclude<PickTier, null>; size: number }) {
  const head = TIER_COLOR[tier];
  return (
    <div style={{
      width: size, height: size, position: "relative", imageRendering: "pixelated",
      transform: "rotate(40deg)",
      filter: `drop-shadow(2px 3px 0 rgba(0,0,0,.45)) drop-shadow(0 0 8px ${head})`,
    }}>
      <div style={{ position: "absolute", left: "44%", top: "28%", width: "14%", height: "62%", background: "linear-gradient(90deg,#6b4423,#a07040)", borderRadius: 1 }} />
      <div style={{ position: "absolute", left: "10%", top: "10%", width: "80%", height: "30%", background: `linear-gradient(180deg,${head},${head}cc)`, borderRadius: 3, boxShadow: `0 0 6px ${head}` }} />
      <div style={{ position: "absolute", left: "-2%", top: "2%", width: "30%", height: "24%", background: head, transform: "rotate(-42deg)", borderRadius: 1 }} />
      <div style={{ position: "absolute", right: "-2%", top: "2%", width: "30%", height: "24%", background: head, transform: "rotate(42deg)", borderRadius: 1 }} />
    </div>
  );
}
