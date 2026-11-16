import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import FairnessModal, { type FairData } from "@/components/FairnessModal";
import SpinHistoryModal from "@/components/SpinHistoryModal";
import { haptic, hapticNotify, useTelegram } from "@/lib/telegram";

const AVATAR_MIN_SHARE = 0.05;
const WHEEL_SIZE = 280;

type Player = {
  telegramId: string;
  username: string | null;
  stake: number;
  chance: number;
  photoUrl?: string | null;
};

type Round = {
  id: number;
  status: string;
  totalPool: number;
  players: Player[];
  winnerId: string | null;
  winnerUsername?: string | null;
  startAt: string | null;
  finishedAt: string | null;
  stopFrac: number;
  fair?: FairData | null;
};

const COLORS = [
  "#a78bfa", "#f472b6", "#60a5fa", "#34d399", "#fbbf24",
  "#f87171", "#22d3ee", "#c084fc", "#fb923c", "#4ade80",
];

export function JackpotWheel({
  players,
  spinning,
  winnerId,
  stopFrac = 0.5,
  spinKey = 0,
}: {
  players: Player[];
  spinning: boolean;
  winnerId: string | null;
  stopFrac?: number;
  spinKey?: number;
}) {
  const total = players.reduce((s, p) => s + (p.stake || 0), 0) || 1;
  const sectors = useMemo(() => {
    let acc = 0;
    return players.map((p, i) => {
      const share = (p.stake || 0) / total;
      const start = acc;
      acc += share;
      return { ...p, share, start, end: acc, color: COLORS[i % COLORS.length] };
    });
  }, [players, total]);

  const gradient = sectors.length
    ? `conic-gradient(${sectors
        .map((s) => `${s.color} ${s.start * 360}deg ${s.end * 360}deg`)
        .join(", ")})`
    : "radial-gradient(circle at 40% 35%, #2a1845, #12081f)";

  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (!spinning) return;
    const target = 360 * 6 + (1 - stopFrac) * 360;
    setRotation(target);
  }, [spinning, stopFrac, spinKey]);

  return (
    <div style={{ position: "relative", width: WHEEL_SIZE, height: WHEEL_SIZE, margin: "0 auto" }}>
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: "50%",
          background: gradient,
          border: "3px solid rgba(167,139,250,0.45)",
          boxShadow: "0 0 40px rgba(167,139,250,0.25)",
          transition: spinning ? "transform 4.5s cubic-bezier(0.12, 0.75, 0.12, 1)" : "none",
          transform: `rotate(${rotation}deg)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: -8,
          left: "50%",
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "10px solid transparent",
          borderRight: "10px solid transparent",
          borderTop: "16px solid #fbbf24",
          zIndex: 5,
        }}
      />
      {sectors.map((s) => {
        if (s.share < AVATAR_MIN_SHARE) return null;
        const mid = (s.start + s.end) / 2;
        const rad = ((mid * 360 - 90) * Math.PI) / 180;
        const r = WHEEL_SIZE * 0.32;
        const x = WHEEL_SIZE / 2 + Math.cos(rad) * r;
        const y = WHEEL_SIZE / 2 + Math.sin(rad) * r;
        return (
          <div
            key={s.telegramId}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: 28,
              height: 28,
              marginLeft: -14,
              marginTop: -14,
              borderRadius: "50%",
              overflow: "hidden",
              border: "2px solid rgba(255,255,255,0.5)",
              background: "#1e1b2e",
              transition: spinning ? "none" : "left 0.55s ease, top 0.55s ease",
              zIndex: 4,
            }}
          >
            {s.photoUrl ? (
              <img src={s.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#e2e8f0" }}>
                {(s.username || "?")[0]}
              </div>
            )}
          </div>
        );
      })}
      <div
        style={{
          position: "absolute",
          inset: "32%",
          borderRadius: "50%",
          background: "radial-gradient(circle at 40% 35%, #2a1845, #0f0818)",
          border: "2px solid rgba(255,255,255,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#f1f5f9",
          fontWeight: 900,
          fontSize: 14,
          zIndex: 3,
        }}
      >
        {spinning ? "…" : winnerId ? "🏆" : "PvP"}
      </div>
    </div>
  );
}

export default function SpinGame({
  telegramId,
  tonBalance,
  onBalanceChange,
}: {
  telegramId: string;
  tonBalance: number;
  onBalanceChange: () => void;
}) {
  const [round, setRound] = useState<Round | null>(null);
  const [bet, setBet] = useState("1");
  const [loading, setLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [spinKey, setSpinKey] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [showFair, setShowFair] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadRound = useCallback(async () => {
    try {
      const res = await fetch("/api/mini/games/spin/current");
      const data = await res.json();
      const r = data.round || data.room || data;
      if (r?.id) setRound(r);
    } catch {}
  }, []);

  useEffect(() => {
    loadRound();
    pollRef.current = setInterval(loadRound, 2500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadRound]);

  const startSpin = useCallback((r: Round) => {
    setRound(r);
    setSpinning(true);
    setSpinKey((k) => k + 1);
    haptic("medium");
    setTimeout(() => {
      setSpinning(false);
      hapticNotify("success");
      onBalanceChange();
      loadRound();
    }, 4800);
  }, [loadRound, onBalanceChange]);

  const placeBet = async () => {
    const amount = parseFloat(bet);
    if (!amount || amount <= 0 || loading || spinning) return;
    setLoading(true);
    try {
      const res = await fetch("/api/mini/games/spin/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, amount }),
      });
      const data = await res.json();
      if (data.ok || data.round || data.room) {
        haptic("light");
        const r = data.round || data.room;
        if (r) setRound(r);
        onBalanceChange();
        if (r?.status === "spinning" || r?.status === "finished") {
          startSpin(r);
        }
      } else {
        alert(data.error || "Ошибка ставки");
      }
    } catch {
      alert("Сеть недоступна");
    } finally {
      setLoading(false);
    }
  };

  const players = round?.players || [];
  const totalPool = round?.totalPool || players.reduce((s, p) => s + (p.stake || 0), 0);

  return (
    <div style={{ minHeight: "100%", padding: 16, color: "#f1f5f9" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontWeight: 900, fontSize: 15 }}>
          🎰 PvP Барабан{round?.id ? ` · #${round.id}` : ""}
        </div>
        <button
          type="button"
          onClick={() => setShowHistory(true)}
          style={{
            padding: "8px 14px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.06)",
            color: "#f1f5f9",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          ⏱ История
        </button>
      </div>

      <JackpotWheel
        players={players}
        spinning={spinning}
        winnerId={round?.winnerId || null}
        stopFrac={typeof round?.stopFrac === "number" ? round.stopFrac : 0.5}
        spinKey={spinKey}
      />

      <div style={{ textAlign: "center", marginTop: 12, opacity: 0.85, fontSize: 13 }}>
        Банк: <b>{totalPool.toFixed(2)}</b> TON · Игроков: {players.length}
      </div>

      {round?.winnerId && !spinning && (
        <div style={{ textAlign: "center", marginTop: 8, color: "#fbbf24", fontWeight: 800 }}>
          Победитель: {round.winnerUsername || round.winnerId}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
        <input
          value={bet}
          onChange={(e) => setBet(e.target.value)}
          type="number"
          min="0.1"
          step="0.1"
          style={{
            flex: 1,
            padding: "12px 14px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.3)",
            color: "#f1f5f9",
            fontWeight: 700,
            outline: "none",
          }}
          placeholder="Ставка TON"
        />
        <button
          type="button"
          onClick={placeBet}
          disabled={loading || spinning}
          style={{
            padding: "12px 18px",
            borderRadius: 14,
            border: "none",
            background: loading || spinning ? "rgba(167,139,250,0.3)" : "linear-gradient(135deg,#8b5cf6,#a78bfa)",
            color: "#fff",
            fontWeight: 900,
            cursor: loading || spinning ? "default" : "pointer",
          }}
        >
          {loading ? "…" : "Ставка"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        {["0.5", "1", "2", "5", "10"].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setBet(v)}
            style={{
              padding: "6px 12px",
              borderRadius: 10,
              border: bet === v ? "1px solid rgba(167,139,250,0.6)" : "1px solid rgba(255,255,255,0.1)",
              background: bet === v ? "rgba(167,139,250,0.2)" : "rgba(255,255,255,0.04)",
              color: "#e2e8f0",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {v}
          </button>
        ))}
      </div>

      {players.length > 0 && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
          {players.map((p) => (
            <div
              key={p.telegramId}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 12px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                fontSize: 13,
              }}
            >
              <span>{p.username || p.telegramId}</span>
              <span style={{ fontWeight: 800 }}>
                {p.stake} TON · {((p.chance || p.stake / (totalPool || 1)) * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {showHistory && (
        <SpinHistoryModal
          telegramId={telegramId}
          onClose={() => setShowHistory(false)}
          onReplay={(item) => {
            setShowHistory(false);
            if (!item?.winnerId || !item.players?.length) return;
            startSpin({
              id: item.id,
              status: "finished",
              totalPool: item.totalPool,
              players: item.players,
              winnerId: item.winnerId,
              winnerUsername: item.winnerUsername,
              startAt: null,
              finishedAt: item.finishedAt,
              stopFrac: typeof item.stopFrac === "number" ? item.stopFrac : 0.5,
              fair: item.fair as FairData | null,
            });
          }}
        />
      )}

      {showFair && round?.fair && (
        <FairnessModal
          open={showFair}
          onClose={() => setShowFair(false)}
          fair={round.fair}
          gameType="spin"
          gameId={round.id}
        />
      )}
    </div>
  );
}
