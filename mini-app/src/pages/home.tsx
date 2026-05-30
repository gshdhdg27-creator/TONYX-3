import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetUserProfile,
  getGetUserProfileQueryKey,
} from "@workspace/api-client-react";
import { useTelegram, haptic, hapticNotify } from "@/lib/telegram";
import { CountUp } from "@/components/count-up";

function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div style={{
      position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
      background: type === "success" ? "rgba(22,163,74,0.95)" : "rgba(220,38,38,0.95)",
      color: "#fff", padding: "12px 20px", borderRadius: 12,
      fontSize: 14, fontWeight: 600, zIndex: 9999, maxWidth: "calc(100% - 32px)",
      animation: "bounceIn 0.3s ease-out", boxShadow: "0 8px 28px rgba(0,0,0,0.4)",
    }}>{msg}</div>
  );
}

const RATE_PER_MS = 0.01 / (24 * 60 * 60 * 1000); // 1% per day in ms

interface InvData {
  principal: number;
  totalClaimed: number;
  earnedTotal: number;
  unclaimed: number;
  startedAt: string | null;
  ratePerDay: number;
}

export default function HomePage() {
  const { telegramId } = useTelegram();
  const qc = useQueryClient();
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const [inv, setInv] = useState<InvData | null>(null);
  const [animUnclaimed, setAnimUnclaimed] = useState(0);
  const [investInput, setInvestInput] = useState("");
  const [investing, setInvesting] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const animRef = useRef<number>(0);

  const showToast = useCallback((msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const { data: profile } = useGetUserProfile(telegramId ?? "", {
    query: { enabled: !!telegramId, refetchInterval: 8000 },
  });

  const fetchInv = useCallback(async () => {
    if (!telegramId) return;
    try {
      const r = await fetch(`/api/mini/investments/${encodeURIComponent(telegramId)}`);
      if (r.ok) setInv(await r.json());
    } catch {}
  }, [telegramId]);

  useEffect(() => { fetchInv(); }, [fetchInv]);

  // requestAnimationFrame counter — live ms-level animation
  useEffect(() => {
    cancelAnimationFrame(animRef.current);
    if (!inv?.startedAt || inv.principal <= 0) {
      setAnimUnclaimed(Math.max(0, inv?.unclaimed ?? 0));
      return;
    }
    const startMs = new Date(inv.startedAt).getTime();
    const claimed = inv.totalClaimed;
    const principal = inv.principal;
    const tick = () => {
      const elapsed = Date.now() - startMs;
      setAnimUnclaimed(Math.max(0, principal * RATE_PER_MS * elapsed - claimed));
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [inv?.startedAt, inv?.principal, inv?.totalClaimed]);

  const handleInvest = async () => {
    const amount = parseInt(investInput, 10);
    if (!telegramId || isNaN(amount) || amount < 100) {
      showToast("Минимальная инвестиция — 100 pts", "error"); return;
    }
    setInvesting(true);
    try {
      const r = await fetch("/api/mini/investments/invest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, amount }),
      });
      const d = await r.json();
      if (!r.ok) { showToast(d.error ?? "Ошибка", "error"); return; }
      hapticNotify("success");
      showToast(d.message ?? `Вложено ${amount} pts!`, "success");
      setInvestInput("");
      await fetchInv();
      qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId) });
    } catch { showToast("Ошибка сети", "error"); }
    finally { setInvesting(false); }
  };

  const handleClaim = async () => {
    if (!telegramId) return;
    setClaiming(true);
    try {
      const r = await fetch("/api/mini/investments/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId }),
      });
      const d = await r.json();
      if (!r.ok) { showToast(d.error ?? "Ошибка", "error"); return; }
      hapticNotify("success");
      showToast(d.message ?? "Получено!", "success");
      await fetchInv();
      qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId) });
    } catch { showToast("Ошибка сети", "error"); }
    finally { setClaiming(false); }
  };

  const coins = profile?.coins ?? 0;
  const ton = coins / 1000;
  const hasPrincipal = (inv?.principal ?? 0) > 0;
  const dailyIncome = hasPrincipal ? inv!.principal * 0.01 : 0;

  return (
    <div style={{ padding: "16px 16px 28px", minHeight: "100%" }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <div style={{
          fontSize: 26, fontWeight: 800, letterSpacing: "0.08em",
          background: "linear-gradient(135deg, #60a5fa 0%, #c084fc 50%, #60a5fa 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          backgroundClip: "text", backgroundSize: "200% auto",
          animation: "shine 4s linear infinite",
        }}>TONYX</div>
      </div>

      {/* Leaderboard banner */}
      <Link href="/leaderboard" onClick={() => haptic("light")} style={{
        display: "flex", alignItems: "center", gap: 12,
        background: "linear-gradient(135deg, rgba(190,18,60,0.35), rgba(244,63,94,0.18))",
        border: "1px solid rgba(244,63,94,0.45)",
        borderRadius: 16, padding: "12px 14px", marginBottom: 16,
        textDecoration: "none", color: "inherit",
        boxShadow: "0 0 22px rgba(244,63,94,0.22)", cursor: "pointer",
      }} className="tile-bounce">
        <div style={{ fontSize: 28 }}>🔥</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>Weekly Leaderboard</div>
          <div style={{ fontSize: 11, color: "#fda4af" }}>Top 10 players get rewards!</div>
        </div>
        <div style={{ padding: "6px 12px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: "rgba(244,63,94,0.25)", color: "#fff" }}>
          VIEW →
        </div>
      </Link>

      {/* Balance card */}
      <div style={{
        background: "linear-gradient(135deg, rgba(30,58,143,0.45), rgba(37,99,235,0.18))",
        border: "1px solid rgba(96,165,250,0.3)",
        borderRadius: 20, padding: "20px 18px", marginBottom: 22,
        textAlign: "center", position: "relative", overflow: "hidden",
        boxShadow: "0 0 36px rgba(37,99,235,0.25)",
      }} className="balance-card">
        <div style={{
          position: "absolute", top: -40, left: "50%", transform: "translateX(-50%)",
          width: 220, height: 220, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(96,165,250,0.35) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{ fontSize: 11, color: "#93c5fd", letterSpacing: "0.22em", fontWeight: 600, position: "relative" }}>BALANCE</div>
        <div style={{
          fontSize: 40, fontWeight: 800, color: "#fff", marginTop: 4, letterSpacing: "-0.02em",
          textShadow: "0 0 24px rgba(96,165,250,0.55)", position: "relative", fontVariantNumeric: "tabular-nums",
        }}>
          <CountUp value={coins} /> <span style={{ fontSize: 17, color: "#93c5fd", fontWeight: 600 }}>pts</span>
        </div>
        <div style={{ fontSize: 13, color: "#60a5fa", marginTop: 2, fontWeight: 500, position: "relative" }}>
          ≈ {ton.toFixed(3)} TON
        </div>
      </div>

      {/* ═══ INVESTMENTS ═══ */}
      <div style={{
        background: "linear-gradient(135deg, rgba(5,46,36,0.7), rgba(6,78,59,0.4))",
        border: "1px solid rgba(16,185,129,0.4)",
        borderRadius: 20, padding: "18px 16px",
        boxShadow: "0 0 32px rgba(16,185,129,0.12)",
      }}>
        {/* Title */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 28 }}>💹</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9" }}>Инвестиции</div>
            <div style={{ fontSize: 11, color: "#6ee7b7" }}>1% в день · начисление каждую миллисекунду</div>
          </div>
          {hasPrincipal && (
            <div style={{ marginLeft: "auto", background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, padding: "3px 8px", fontSize: 9, color: "#4ade80", fontWeight: 800, letterSpacing: "0.1em" }}>
              АКТИВНО
            </div>
          )}
        </div>

        {hasPrincipal ? (
          <>
            {/* Animated live counter */}
            <div style={{
              background: "rgba(0,0,0,0.35)", border: "1px solid rgba(16,185,129,0.25)",
              borderRadius: 16, padding: "16px", marginBottom: 14, textAlign: "center",
            }}>
              <div style={{ fontSize: 10, color: "#6ee7b7", letterSpacing: "0.2em", fontWeight: 700, marginBottom: 6 }}>
                НАКОПЛЕНО (ЖИВОЙ СЧЁТЧИК)
              </div>
              <div style={{
                fontSize: 32, fontWeight: 900, color: "#4ade80",
                fontVariantNumeric: "tabular-nums", fontFamily: "monospace",
                textShadow: "0 0 24px rgba(74,222,128,0.6)",
                letterSpacing: "-0.02em",
              }}>
                {animUnclaimed.toFixed(6)}
                <span style={{ fontSize: 14, color: "#6ee7b7", marginLeft: 6 }}>pts</span>
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 8, fontSize: 11, color: "#475569" }}>
                <span>Вложено: <b style={{ color: "#a7f3d0" }}>{inv!.principal.toLocaleString()}</b></span>
                <span>·</span>
                <span>+<b style={{ color: "#a7f3d0" }}>{dailyIncome.toFixed(1)}</b>/день</span>
                <span>·</span>
                <span>Получено: <b style={{ color: "#a7f3d0" }}>{inv!.totalClaimed.toLocaleString()}</b></span>
              </div>
            </div>

            {/* Claim */}
            <button
              onClick={handleClaim}
              disabled={claiming || animUnclaimed < 1}
              style={{
                width: "100%", padding: "14px 0", borderRadius: 14, border: "none",
                fontFamily: "inherit",
                background: animUnclaimed >= 1
                  ? "linear-gradient(135deg, #059669, #10b981)"
                  : "rgba(30,45,69,0.35)",
                color: animUnclaimed >= 1 ? "#fff" : "#334155",
                fontSize: 15, fontWeight: 800,
                cursor: animUnclaimed >= 1 ? "pointer" : "not-allowed",
                boxShadow: animUnclaimed >= 1 ? "0 4px 20px rgba(16,185,129,0.4)" : "none",
                transition: "all 0.2s", marginBottom: 12,
              }}
            >
              {claiming
                ? "Получение…"
                : animUnclaimed >= 1
                  ? `💰 Забрать ${Math.floor(animUnclaimed)} pts`
                  : "⏳ Копится…"}
            </button>

            <div style={{ fontSize: 11, color: "#475569", fontWeight: 700, marginBottom: 8 }}>ДОБАВИТЬ К ВКЛАДУ</div>
          </>
        ) : (
          <div style={{
            background: "rgba(0,0,0,0.2)", border: "1px dashed rgba(16,185,129,0.2)",
            borderRadius: 14, padding: 18, marginBottom: 14, textAlign: "center",
          }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🌱</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#6ee7b7", marginBottom: 6 }}>Начните копить прямо сейчас</div>
            <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
              Вложите pts и получайте <b style={{ color: "#4ade80" }}>1% в день</b><br />
              Счётчик крутится в реальном времени — каждую миллисекунду
            </div>
          </div>
        )}

        {/* Invest input */}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={investInput}
            onChange={e => setInvestInput(e.target.value)}
            type="number"
            placeholder="Сумма pts (минимум 100)"
            style={{
              flex: 1, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(16,185,129,0.25)",
              borderRadius: 10, padding: "12px 14px", color: "#f1f5f9",
              fontFamily: "inherit", fontSize: 14, outline: "none",
            }}
          />
          <button
            onClick={handleInvest}
            disabled={investing || !investInput || parseInt(investInput, 10) < 100}
            style={{
              padding: "12px 18px", borderRadius: 10, border: "none", fontFamily: "inherit",
              background: "linear-gradient(135deg, #065f46, #059669)",
              color: "#fff", fontSize: 14, fontWeight: 800,
              cursor: "pointer", whiteSpace: "nowrap",
              opacity: investing || !investInput || parseInt(investInput, 10) < 100 ? 0.5 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {investing ? "…" : "Вложить"}
          </button>
        </div>

        <div style={{ fontSize: 10, color: "#334155", marginTop: 10, textAlign: "center", lineHeight: 1.6 }}>
          Доступный баланс: <b style={{ color: "#6ee7b7" }}>{coins.toLocaleString()} pts</b>
          {hasPrincipal && <> · Всего вложено: <b style={{ color: "#6ee7b7" }}>{inv!.principal.toLocaleString()} pts</b></>}
        </div>
      </div>
    </div>
  );
}
