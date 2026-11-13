import { useState, useEffect, useCallback, useRef } from "react";
import type React from "react";

export const OWNER_ID = "7257793582";

export interface AdminTask {
  id: number; title: string; description: string | null; type: string; link: string | null;
  reward: number; rewardTon: number | null; maxCompletions: number | null; currentCompletions: number;
  isActive: boolean; createdAt: string;
}
export interface UserInfo {
  id: number; telegramId: string; username: string | null; firstName: string | null; lastName: string | null;
  coins: number; ton: number; tonyxCoins: number; boostRate?: number; totalTonDeposited: number;
  totalAdsWatched: number; totalGamesPlayed: number; wins: number; losses: number;
  totalOrders: number; referrals: number; isBlocked: boolean; isAdmin: boolean; isOnline: boolean;
  forceWin: boolean; lastIp: string | null; twinCount: number; isMainAccount: boolean;
  lastLoginAt: string | null; createdAt: string;
  dailyOrdersStart?: number; dailyOrdersPro?: number; dailyOrdersElite?: number;
  userStatus?: string; bannedReason?: string | null; winRateModifier?: number | null;
}
export interface Stats {
  totalUsers: number; totalCoinsSold: number; totalTonVolume: number;
  activeOrders: number; isMarketActive: boolean; canActivate: boolean; poolProgress: string;
  isSuperAdmin: boolean;
  admins: { telegramId: string; username: string | null }[];
}
export interface AdminWithdrawal {
  id: number; telegramId: string; tonAmount: string | null; amount: number;
  address: string; status: string; txHash: string | null; createdAt: string;
  userFirstName: string | null; userUsername: string | null;
  userLastIp: string | null; isTwin: boolean;
}
export interface AdminTopup {
  id: number; telegramId: string; tonAmount: string;
  memo: string | null; walletAddress: string | null;
  status: string; createdAt: string;
  userFirstName: string | null; userUsername: string | null;
}
export type Currency = "ton" | "tonyx";
export type Action = "add" | "deduct";

export function normalizeId(raw: string | null | undefined): string {
  return raw != null ? String(raw).trim() : "";
}
export function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ru", { day: "2-digit", month: "2-digit", year: "2-digit" })
    + " " + d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
}
export function toUZT(iso: string | null): string {
  if (!iso) return "—";
  const uzt = new Date(new Date(iso).getTime() + 5 * 3600000);
  return `${String(uzt.getUTCDate()).padStart(2,"0")}.${String(uzt.getUTCMonth()+1).padStart(2,"0")} ${String(uzt.getUTCHours()).padStart(2,"0")}:${String(uzt.getUTCMinutes()).padStart(2,"0")} UZT`;
}
export function timeAgo(iso: string | null) {
  if (!iso) return "никогда";
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return `${sec}с назад`;
  if (sec < 3600) return `${Math.floor(sec/60)}м назад`;
  if (sec < 86400) return `${Math.floor(sec/3600)}ч назад`;
  return `${Math.floor(sec/86400)}д назад`;
}
void timeAgo;

export async function apiCall(path: string, opts: RequestInit & { adminId: string }) {
  const { adminId, ...rest } = opts;
  const headers: Record<string, string> = {
    "Content-Type": "application/json", "X-Admin-Id": adminId,
    ...(rest.headers as Record<string, string> | undefined),
  };
  let url = `/api/mini/admin/${path}`;
  if (!rest.method || rest.method === "GET") {
    url += (url.includes("?") ? "&" : "?") + `adminId=${encodeURIComponent(adminId)}`;
  } else {
    if (rest.body && typeof rest.body === "string") {
      try { const p = JSON.parse(rest.body); rest.body = JSON.stringify({ adminId, ...p }); } catch { /* */ }
    } else if (!rest.body) { rest.body = JSON.stringify({ adminId }); }
  }
  return fetch(url, { ...rest, headers });
}

export function Toast({ msg, type }: { msg: string; type: "success"|"error"|"info" }) {
  const bg = type==="success" ? "rgba(22,163,74,0.95)" : type==="error" ? "rgba(220,38,38,0.95)" : "rgba(30,64,175,0.95)";
  return <div style={{ position:"fixed", top:16, left:"50%", transform:"translateX(-50%)", background:bg, color:"#fff", padding:"12px 20px", borderRadius:12, fontSize:14, fontWeight:600, zIndex:9999, maxWidth:"calc(100% - 32px)", boxShadow:"0 8px 28px rgba(0,0,0,0.5)" }}>{msg}</div>;
}

export function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: "success"|"error"|"info" } | null>(null);
  const flash = useCallback((msg: string, type: "success"|"error"|"info" = "info") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
  }, []);
  return { toast, flash };
}

export function SectionCard({ children, color = "#1e3a8a" }: { children: React.ReactNode; color?: string }) {
  return <div style={{ background:"rgba(15,23,42,0.95)", border:`1px solid ${color}40`, borderRadius:16, padding:16, marginBottom:14 }}>{children}</div>;
}

export function SectionTitle({ icon, label, color = "#60a5fa" }: { icon: string; label: string; color?: string }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
      <span style={{ fontSize:18 }}>{icon}</span>
      <div style={{ fontSize:14, fontWeight:800, color }}>{label}</div>
    </div>
  );
}

export function NumInput({ value, onChange, placeholder, min, max, step, style: s }: {
  value: string; onChange: (v: string)=>void; placeholder?: string; min?: number; max?: number; step?: number; style?: React.CSSProperties;
}) {
  return <input type="number" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} min={min} max={max} step={step}
    style={{ background:"rgba(30,45,69,0.7)", border:"1px solid rgba(30,58,143,0.4)", borderRadius:8, padding:"9px 12px", color:"#f1f5f9", fontFamily:"inherit", fontSize:13, outline:"none", ...s }} />;
}

export const TABS = [
  { id:0, icon:"🎮", label:"Игра" },
  { id:1, icon:"🏪", label:"Маркет" },
  { id:2, icon:"🕹️", label:"Игры" },
  { id:3, icon:"📋", label:"Задания" },
  { id:4, icon:"👑", label:"Генерал" },
  { id:5, icon:"🔍", label:"Игроки" },
  { id:6, icon:"📦", label:"Кейсы" },
  { id:7, icon:"🎁", label:"NFT" },
];

export function TabNav({ active, onChange }: { active: number; onChange: (n: number)=>void }) {
  return (
    <div style={{ display:"flex", gap:4, marginBottom:16, flexWrap:"wrap", paddingBottom:2 }}>
      {TABS.map(t => (
        <button key={t.id} onClick={()=>onChange(t.id)} style={{
          flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center", gap:2,
          padding:"8px 10px", borderRadius:12, border:"none", fontFamily:"inherit", cursor:"pointer",
          background: active===t.id ? "linear-gradient(135deg,#1d4ed8,#3b82f6)" : "rgba(30,45,69,0.6)",
          color: active===t.id ? "#fff" : "#475569",
          fontSize:9, fontWeight:800, letterSpacing:"0.04em",
          boxShadow: active===t.id ? "0 0 12px rgba(59,130,246,0.4)" : "none",
          transition:"all .15s",
        }}>
          <span style={{ fontSize:16 }}>{t.icon}</span>
          {t.label}
        </button>
      ))}
    </div>
  );
}
