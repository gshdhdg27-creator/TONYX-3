/**
 * GameCard — PvP-first: Arena dual fighters, Spin wheel+hero
 */
import type { ReactNode } from "react";
import { CSS } from "./GameCardStyles";

export type GameCardProps = {
  name: string;
  scene?: "arena" | "spin" | "mines" | "cases" | "coin" | "crash" | "plinko" | "upgrade" | "pickaxe" | "generic";
  badge?: string;
  badgeColor?: string;
  online?: string | number;
  maxBet?: string | number;
  emoji?: string;
  gradient: string;
  accent?: string;
  wide?: boolean;
  onClick: () => void;
  footer?: ReactNode;
  enterDelay?: number;
  disabled?: boolean;
};

const COVER: Record<string, string> = {
  arena: "/mages/kalen-inferno-blaze.jpg",
  spin: "/mages/lyra-cosmic-weaver.jpg",
  mines: "/mages/aethel-abyss-weaver.jpg",
  cases: "/mages/elara-void-weaver.jpg",
  coin: "/nft/royal_dogg.jpg",
  crash: "/rocket.png",
  plinko: "/mages/lyra-emerald-chronomancer.jpg",
  upgrade: "/nft/telegram_premium.jpg",
  pickaxe: "/mages/aethel-abyss-weaver.jpg",
  generic: "/mages/solaris-chronos-shaper.jpg",
};

function ArenaArt() {
  return (
    <div className="gc-art arena">
      <div className="gc-split" />
      <div className="gc-glow left" />
      <div className="gc-glow right" />
      <div className="gc-fighter f1">
        <img src="/mages/frost-weaver.jpg" alt="" draggable={false} />
      </div>
      <div className="gc-fighter f2">
        <img src="/mages/kalen-inferno-blaze.jpg" alt="" draggable={false} />
      </div>
      <div className="gc-vs">VS</div>
      <div className="gc-clash" />
    </div>
  );
}

function SpinArt() {
  return (
    <div className="gc-art spin">
      <div className="gc-spin-bg" />
      <div className="gc-wheel" />
      <div className="gc-hero-spin">
        <img src="/mages/lyra-cosmic-weaver.jpg" alt="" draggable={false} />
      </div>
      <div className="gc-orb o1" />
      <div className="gc-orb o2" />
    </div>
  );
}

function DefaultArt({ scene }: { scene: string }) {
  const src = COVER[scene] ?? COVER.generic;
  const isRocket = scene === "crash";
  return (
    <div className={`gc-art default${isRocket ? " rocket" : ""}`}>
      <img className="gc-cover-img" src={src} alt="" draggable={false} />
    </div>
  );
}

export function GameCard({
  name,
  scene = "generic",
  badge,
  badgeColor = "#f97316",
  online,
  maxBet,
  gradient,
  accent = "rgba(168,85,247,0.55)",
  wide,
  onClick,
  enterDelay = 0,
  disabled,
}: GameCardProps) {
  return (
    <button
      type="button"
      className={`gc${wide ? " wide" : ""}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        ["--accent" as string]: accent,
        ["--delay" as string]: `${enterDelay}ms`,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <style>{CSS}</style>
      <div className="gc-rim" />
      <div className="gc-fill" style={{ background: gradient }} />
      {scene === "arena" ? <ArenaArt /> : scene === "spin" ? <SpinArt /> : <DefaultArt scene={scene} />}
      <div className="gc-shade" />
      <div className="gc-sweep" />
      <div className="gc-top">
        {badge ? (
          <span className="gc-badge" style={{ background: badgeColor }}>{badge}</span>
        ) : (
          <span />
        )}
        {online != null ? (
          <span className="gc-online"><i />{online}</span>
        ) : null}
      </div>
      <div className="gc-glass">
        <div className="gc-name">{name}</div>
        {maxBet != null ? <div className="gc-max">макс {maxBet}</div> : null}
      </div>
    </button>
  );
}
