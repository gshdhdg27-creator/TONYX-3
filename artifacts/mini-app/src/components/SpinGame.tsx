import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import FairnessModal, { type FairData } from "@/components/FairnessModal";
import SpinHistoryModal from "@/components/SpinHistoryModal";
import { haptic, hapticNotify } from "@/lib/telegram";

const AVATAR_MIN_SHARE = 0.05;
const WHEEL_SIZE = 280;
const COLORS = [
  "#a78bfa", "#f472b6", "#60a5fa", "#34d399", "#fbbf24",
  "#f87171", "#22d3ee", "#c084fc", "#fb923c", "#4ade80",
];

type Player = {
  telegramId: string;
  username: string | null;
  stake: number;
  chance: number;
  photoUrl?: string | null;
};

type Round = {
  id: number;
  status: "waiting" | "starting" | "finished" | string;
  totalPool: number;
  players: Player[];
  winnerId: string | null;
  winnerUsername?: string | null;
  startAt: string | null;
  finishedAt: string | null;
  stopFrac: number | null;
  fair?: FairData | null;
};

function useCountdown(startAt: string | null): number | null {
  const [secs, setSecs] = useState<number | null>(null);
  useEffect(() => {
    if (!startAt) {
      setSecs(null);
      return;
    }
    const update = () =>
      setSecs(Math.max(0, Math.ceil((new Date(startAt).getTime() - Date.now()) / 1000)));
    update();
    const iv = setInterval(update, 200);
    return () => clearInterval(iv);
  }, [startAt]);
  return secs;
}

type Sector = Player & { share: number; start: number; end: number; color: string; startDeg: number; endDeg: number };

function buildSectors(players: Player[]): Sector[] {
  const total = players.reduce((s, p) => s + (p.stake || 0), 0) || 1;
  let acc = 0;
  return players.map((p, i) => {
    const share = (p.stake || 0) / total;
    const start = acc;
    acc += share;
    return {
      ...p,
      share,
      start,
      end: acc,
      color: COLORS[i % COLORS.length],
      startDeg: start * 360,
      endDeg: acc * 360,
    };
  });
}

export function JackpotWheel({
  players,
  rotateDeg,
  spinning,
  centerLabel,
  centerGreen,
}: {
  players: Player[];
  rotateDeg: number;
  spinning: boolean;
  winnerId?: string | null;
  stopFrac?: number;
  spinKey?: number;
  centerLabel?: string;
  centerGreen?: boolean;
}) {
  const sectors = useMemo(() => buildSectors(players), [players]);
  const gradient = sectors.length
    ? `conic-gradient(${sectors
        .map((s) => `${s.color} ${s.startDeg}deg ${s.endDeg}deg`)
        .join(", ")})`
    : "radial-gradient(circle at 40% 35%, #2a1845, #12081f)";

  return (
    <div style={{ position: "relative", width: WHEEL_SIZE, height: WHEEL_SIZE, margin: "0 auto" }}>
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
          zIndex: 6,
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: gradient,
          border: "3px solid rgba(167,139,250,0.45)",
          boxShadow: spinning
            ? "0 0 50px rgba(167,139,250,0.55), 0 0 80px rgba(251,191,36,0.2)"
            : "0 0 40px rgba(167,139,250,0.25)",
          transition: spinning
            ? "transform 5.2s cubic-bezier(0.08, 0.65, 0.12, 1)"
            : "box-shadow 0.3s ease",
          transform: `rotate(${rotateDeg}deg)`,
          willChange: "transform",
          overflow: "hidden",
        }}
      >
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
                border: "2px solid rgba(255,255,255,0.55)",
                background: "#1e1b2e",
                transform: `rotate(${-rotateDeg}deg)`,
                transition: spinning ? "none" : "left 0.55s ease, top 0.55s ease",
                zIndex: 4,
              }}
            >
              {s.photoUrl ? (
                <img src={s.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#e2e8f0",
                  }}
                >
                  {(s.username || "?")[0].toUpperCase()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: "absolute",
          inset: "30%",
          borderRadius: "50%",
          background: centerGreen
            ? "radial-gradient(circle at 40% 35%, #166534, #0f172a)"
            : "radial-gradient(circle at 40% 35%, #2a1845, #0f0818)",
          border: centerGreen
            ? "2px solid rgba(74,222,128,0.55)"
            : "2px solid rgba(255,255,255,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: centerGreen ? "#4ade80" : "#f1f5f9",
          fontWeight: 900,
          fontSize: centerLabel && centerLabel.length <= 2 ? 28 : 15,
          zIndex: 5,
          transition: "background 0.3s ease, color 0.3s ease, border 0.3s ease",
          textAlign: "center",
          lineHeight: 1.1,
          padding: 4,
        }}
      >
        {centerLabel || "PvP"}
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
  const [rotateDeg, setRotateDeg] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [winnerBanner, setWinnerBanner] = useState<{
    name: string;
    payout: number;
    chance: number;
  } | null>(null);

  const spinningRef = useRef(false);
  const replayingRef = useRef(false);
  const rotateDegRef = useRef(0);
  const spunForId = useRef<number | null>(null);
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const countdown = useCountdown(
    round?.status === "starting" ? round.startAt : null
  );

  const startSpin = useCallback(
    (data: Round) => {
      if (spinningRef.current) return;
      if (!data.winnerId || !data.players?.length) return;
      spinningRef.current = true;
      if (spinTimerRef.current) {
        clearTimeout(spinTimerRef.current);
        spinTimerRef.current = null;
      }

      setRound(data);
      setWinnerBanner(null);
      setSpinning(true);

      const sectors = buildSectors(data.players);
      const winner =
        sectors.find((s) => s.telegramId === data.winnerId) ?? sectors[0];
      if (!winner) {
        spinningRef.current = false;
        setSpinning(false);
        replayingRef.current = false;
        return;
      }

      const turns = 6 + Math.floor(Math.random() * 2);
      const from = rotateDegRef.current;
      const span = Math.max(0.01, winner.endDeg - winner.startDeg);
      const pad = Math.min(span * 0.1, 3);
      const frac =
        typeof data.stopFrac === "number"
          ? Math.min(1, Math.max(0, data.stopFrac))
          : 0.5;
      const stopDeg = winner.startDeg + pad + frac * Math.max(0.01, span - pad * 2);
      const adj = (((-stopDeg - from) % 360) + 360) % 360;
      const endAngle = from + turns * 360 + adj;

      setSpinning(false);
      setRotateDeg(from);
      rotateDegRef.current = from;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSpinning(true);
          setRotateDeg(endAngle);
          rotateDegRef.current = endAngle;

          spinTimerRef.current = setTimeout(() => {
            spinningRef.current = false;
            setSpinning(false);
            const wp = data.players.find((p) => p.telegramId === data.winnerId);
            const total = data.totalPool || 1;
            const stake = wp?.stake ?? 0;
            const chance = total > 0 ? (stake / total) * 100 : 0;
            const others = total - stake;
            const payout = Math.round((stake + others * 0.8) * 1000) / 1000;
            setWinnerBanner({
              name: data.winnerUsername || data.winnerId || "?",
              payout,
              chance,
            });
            hapticNotify(data.winnerId === telegramId ? "success" : "error");
            onBalanceChange();
            replayingRef.current = false;
          }, 5600);
        });
      });
    },
    [telegramId, onBalanceChange]
  );

  const fetchState = useCallback(async () => {
    try {
      if (spinningRef.current || replayingRef.current) return;

      const res = await fetch("/api/mini/games/spin/state");
      if (!res.ok) return;
      const data = (await res.json()) as Round;
      if (!data?.id) return;

      if (data.status === "waiting" || data.status === "starting") {
        setRound(data);
        if (data.status === "waiting") {
          setWinnerBanner(null);
        }
      } else if (
        data.status === "finished" &&
        data.winnerId &&
        data.id !== spunForId.current &&
        !spinningRef.current
      ) {
        spunForId.current = data.id;
        startSpin(data);
      } else if (!spinningRef.current) {
        setRound(data);
      }
    } catch {
      /* offline */
    }
  }, [startSpin]);

  useEffect(() => {
    fetchState();
    const iv = setInterval(fetchState, 1000);
    return () => {
      clearInterval(iv);
      if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
    };
  }, [fetchState]);

  useEffect(() => {
    if (countdown !== null && countdown <= 5 && countdown > 0 && round?.status === "starting") {
      haptic("light");
    }
  }, [countdown, round?.status]);

  useEffect(() => {
    if (countdown === 0 && round?.status === "starting" && !spinningRef.current) {
      const t = setTimeout(() => fetchState(), 200);
      const t2 = setTimeout(() => fetchState(), 800);
      const t3 = setTimeout(() => fetchState(), 1600);
      return () => {
        clearTimeout(t);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [countdown, round?.status, fetchState]);

  const placeBet = async () => {
    const amount = parseFloat(bet);
    if (!telegramId) {
      setError("Открой игру из Telegram");
      return;
    }
    if (!amount || amount <= 0 || loading || spinning) return;
    if (round?.status === "finished") {
      setError("Раунд завершён, подожди новый");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const players = round?.players || [];
      const me = players.find((p) => p.telegramId === telegramId);
      const url = me ? "/api/mini/games/spin/increase" : "/api/mini/games/spin/join";
      const body = me
        ? { telegramId, additionalStake: amount }
        : { telegramId, stake: amount };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Ошибка ${res.status}`);
        return;
      }
      haptic("light");
      if (data?.id) setRound(data as Round);
      onBalanceChange();
      fetchState();
    } catch {
      setError("Сеть недоступна");
    } finally {
      setLoading(false);
    }
  };

  const players = round?.players || [];
  const totalPool = round?.totalPool || players.reduce((s, p) => s + (p.stake || 0), 0);
  const canBet = !spinning && (round?.status === "waiting" || round?.status === "starting" || !round);

  let centerLabel = "—";
  if (spinning) centerLabel = "ИГРА";
  else if (countdown !== null && countdown > 0) centerLabel = String(countdown);
  else if (round?.status === "waiting") centerLabel = "ЖДЁМ";
  else if (round?.status === "starting") centerLabel = "…";
  else centerLabel = "PvP";

  const centerGreen = spinning || !!winnerBanner;

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
        rotateDeg={rotateDeg}
        spinning={spinning}
        centerLabel={centerLabel}
        centerGreen={centerGreen}
      />

      <div style={{ textAlign: "center", marginTop: 12, opacity: 0.85, fontSize: 13 }}>
        Банк: <b>{Number(totalPool).toFixed(2)}</b> TON · Игроков: {players.length}
        {countdown !== null && countdown > 0 ? (
          <span style={{ color: "#fbbf24", fontWeight: 800 }}> · {countdown}с</span>
        ) : null}
      </div>

      {winnerBanner && (
        <div
          style={{
            marginTop: 12,
            padding: 14,
            borderRadius: 16,
            background: "linear-gradient(135deg, rgba(34,197,94,0.22), rgba(124,92,255,0.18))",
            border: "1px solid rgba(34,197,94,0.45)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 12, color: "#94a3b8" }}>Победитель</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#4ade80" }}>@{winnerBanner.name}</div>
          <div style={{ fontSize: 13, color: "#e2e8f0", marginTop: 4 }}>
            +{winnerBanner.payout} TON · {winnerBanner.chance.toFixed(1)}%
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 12px",
            borderRadius: 12,
            background: "rgba(248,113,113,0.15)",
            border: "1px solid rgba(248,113,113,0.35)",
            color: "#fecaca",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
        <input
          value={bet}
          onChange={(e) => setBet(e.target.value)}
          type="number"
          min="0.1"
          step="0.1"
          disabled={!canBet}
          style={{
            flex: 1,
            padding: "12px 14px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.3)",
            color: "#f1f5f9",
            fontWeight: 700,
            outline: "none",
            opacity: canBet ? 1 : 0.5,
          }}
          placeholder="Ставка TON"
        />
        <button
          type="button"
          onClick={placeBet}
          disabled={loading || !canBet}
          style={{
            padding: "12px 18px",
            borderRadius: 14,
            border: "none",
            background:
              loading || !canBet
                ? "rgba(167,139,250,0.3)"
                : "linear-gradient(135deg,#8b5cf6,#a78bfa)",
            color: "#fff",
            fontWeight: 900,
            cursor: loading || !canBet ? "default" : "pointer",
          }}
        >
          {loading
            ? "…"
            : players.some((p) => p.telegramId === telegramId)
              ? "Добить"
              : "Ставка"}
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
              border:
                bet === v
                  ? "1px solid rgba(167,139,250,0.6)"
                  : "1px solid rgba(255,255,255,0.1)",
              background:
                bet === v ? "rgba(167,139,250,0.2)" : "rgba(255,255,255,0.04)",
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
                background:
                  p.telegramId === telegramId
                    ? "rgba(124,92,255,0.12)"
                    : "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                fontSize: 13,
              }}
            >
              <span>@{p.username || p.telegramId}</span>
              <span style={{ fontWeight: 800 }}>
                {p.stake} TON · {(p.chance ?? 0).toFixed(1)}%
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
            replayingRef.current = true;
            spinningRef.current = false;
            spunForId.current = item.id;
            setWinnerBanner(null);
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
    </div>
  );
}
