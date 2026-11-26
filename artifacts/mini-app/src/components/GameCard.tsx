/**
 * GameCard — PvP-first: Arena dual fighters, Spin wheel+hero
 */
import type { ReactNode } from "react";

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
