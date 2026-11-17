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

type GiftItem = {
  id: number;
  itemId: string;
  nameRu: string;
  valueTon: number;
  imageUrl: string | null;
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
  centerLabel: string;
  centerGreen: boolean;
}) {
  const sectors = useMemo(() => buildSectors(players), [players]);
  const gradient =
    sectors.length === 0
      ? "conic-gradient(#334155 0deg 360deg)"
      : `conic-gradient(${sectors
          .map((s) => `${s.color} ${s.startDeg}deg ${s.endDeg}deg`)
          .join(", ")})`;

  return (
    <div style={{ position: "relative", width: WHEEL_SIZE, height: WHEEL_SIZE, margin: "0 auto" }}>
      <div
        style={{
          position: "absolute",
          top: -6,
          left: "50%",
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "10px solid transparent",
          borderRight: "10px solid transparent",
          borderTop: "16px solid #fbbf24",
          zIndex: 5,
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
        }}
      />
      <div
        style={{
          width: WHEEL_SIZE,
          height: WHEEL_SIZE,
          borderRadius: "50%",
          background: gradient,
          transform: `rotate(${rotateDeg}deg)`,
          transition: spinning ? "transform 5.2s cubic-bezier(0.12, 0.75, 0.12, 1)" : "none",
          boxShadow: "0 0 0 4px rgba(255,255,255,0.08), 0 12px 40px rgba(0,0,0,0.45)",
          position: "relative",
        }}
      >
        {sectors.map((s) => {
          if (s.share < AVATAR_MIN_SHARE) return null;
          const mid = (s.startDeg + s.endDeg) / 2;
          const r = WHEEL_SIZE * 0.32;
          const rad = ((mid - 90) * Math.PI) / 180;
          const x = WHEEL_SIZE / 2 + Math.cos(rad) * r;
          const y = WHEEL_SIZE / 2 + Math.sin(rad) * r;
          return (
            <div
              key={s.telegramId}
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: 36,
                height: 36,
                marginLeft: -18,
                marginTop: -18,
                borderRadius: "50%",
                overflow: "hidden",
                border: "2px solid rgba(255,255,255,0.85)",
                background: "#1e293b",
                transform: `rotate(${-rotateDeg}deg)`,
                transition: spinning ? "none" : "left 0.55s ease, top 0.55s ease",
              }}
            >
              {s.photoUrl ? (
                <img src={s.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800 }}>
                  {(s.username || "?")[0]?.toUpperCase()}
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
            background: centerGreen
              ? "radial-gradient(circle, #166534 0%, #14532d 100%)"
              : "radial-gradient(circle, #1e293b 0%, #0f172a 100%)",
            border: "3px solid rgba(255,255,255,0.12)",
            display: "grid",
            placeItems: "center",
            fontWeight: 900,
            fontSize: centerLabel.length > 3 ? 18 : 28,
            color: "#f8fafc",
            boxShadow: "inset 0 0 20px rgba(0,0,0,0.35)",
          }}
        >
          {centerLabel}
        </div>
      </div>
    </div>
  );
}

export default function SpinGame({
  telegramId,
  onBalanceChange,
}: {
  telegramId: string | null;
  onBalanceChange: () => void;
}) {
  const [round, setRound] = useState<Round | null>(null);
  const [lockedPlayers, setLockedPlayers] = useState<Player[]>([]);
  const [bet, setBet] = useState("1");
  const [betMode, setBetMode] = useState<"ton" | "gift">("ton");
  const [gifts, setGifts] = useState<GiftItem[]>([]);
  const [giftsLoading, setGiftsLoading] = useState(false);
  const [selectedGiftId, setSelectedGiftId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rotateDeg, setRotateDeg] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winnerBanner, setWinnerBanner] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const spinningRef = useRef(false);
  const replayingRef = useRef(false);
  const spunForId = useRef<number | null>(null);
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rotateRef = useRef(0);

  const countdown = useCountdown(round?.startAt ?? null);

  const startSpin = useCallback((data: Round) => {
    if (!data.winnerId || !data.players?.length) return;
    if (spinningRef.current && spunForId.current === data.id && !replayingRef.current) return;

    const sectors = buildSectors(data.players);
    const winner = sectors.find((s) => s.telegramId === data.winnerId);
    if (!winner) return;

    spinningRef.current = true;
    setSpinning(true);
    setWinnerBanner(null);
    setLockedPlayers(data.players);
    setRound(data);
    spunForId.current = data.id;

    const frac = typeof data.stopFrac === "number" ? data.stopFrac : 0.5;
    const targetMid = (winner.startDeg + winner.endDeg) / 2;
    const stopAt = winner.startDeg + (winner.endDeg - winner.startDeg) * frac;
    const pointer = 0;
    const current = ((rotateRef.current % 360) + 360) % 360;
    const need = (360 - ((stopAt - pointer) % 360) + 360) % 360;
    const extra = 360 * 6 + need - current;
    const next = rotateRef.current + extra;
    rotateRef.current = next;
    setRotateDeg(next);

    if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
    spinTimerRef.current = setTimeout(() => {
      spinningRef.current = false;
      replayingRef.current = false;
      setSpinning(false);
      const name = data.winnerUsername || data.winnerId;
      setWinnerBanner(`Победитель @${name}`);
      hapticNotify("success");
      onBalanceChange();
    }, 5200);
  }, [onBalanceChange]);

  const fetchState = useCallback(async () => {
    if (spinningRef.current || replayingRef.current) return;
    try {
      const res = await fetch("/api/mini/games/spin/state");
      const data = (await res.json()) as Round;
      if (!data?.id) return;

      if (data.status === "finished" && data.winnerId && data.players?.length) {
        if (spunForId.current !== data.id) {
          startSpin(data);
        } else if (!spinningRef.current) {
          setRound(data);
          if (data.players?.length) setLockedPlayers(data.players);
        }
      } else if (!spinningRef.current) {
        setRound(data);
        if (data.players?.length) setLockedPlayers(data.players);
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

  const loadGifts = async () => {
    setGiftsLoading(true);
    try {
      const res = await fetch("/api/mini/inventory");
      const data = await res.json().catch(() => ({}));
      const inv = Array.isArray(data.inventory) ? data.inventory : [];
      const list = inv
        .filter((x: { itemType?: string }) => {
          const t = String(x.itemType || "").toLowerCase();
          return t.includes("nft") || t.includes("gift");
        })
        .map((x: { id: number; itemId: string; nameRu?: string; valueTon?: number; imageUrl?: string | null }) => ({
          id: x.id,
          itemId: x.itemId,
          nameRu: x.nameRu || x.itemId,
          valueTon: Number(x.valueTon) || 0,
          imageUrl: x.imageUrl ?? null,
        }));
      setGifts(list);
      if (list.length && !selectedGiftId) setSelectedGiftId(list[0].id);
    } catch {
      setGifts([]);
    } finally {
      setGiftsLoading(false);
    }
  };

  const placeBet = async () => {
    if (!telegramId) {
      setError("Открой игру из Telegram");
      return;
    }
    if (loading || spinning) return;
    if (round?.status === "finished" && !winnerBanner) {
      setError("Раунд завершён, подожди новый");
      return;
    }
    const amount = betMode === "ton" ? parseFloat(bet) : 0;
    if (betMode === "ton" && (!amount || amount <= 0)) return;
    if (betMode === "gift" && !selectedGiftId) {
      setError("Выбери NFT подарок");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const plist = round?.players || [];
      const me = plist.find((p) => p.telegramId === telegramId);
      const url = me && betMode === "ton" ? "/api/mini/games/spin/increase" : "/api/mini/games/spin/join";
      const body =
        betMode === "gift"
          ? { telegramId, giftInventoryId: selectedGiftId }
          : me
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
      if (data?.id) {
        setRound(data as Round);
        if (data.players?.length) setLockedPlayers(data.players);
      }
      setWinnerBanner(null);
      onBalanceChange();
      if (betMode === "gift") loadGifts();
      fetchState();
    } catch {
      setError("Сеть недоступна");
    } finally {
      setLoading(false);
    }
  };

  const livePlayers = round?.players || [];
  const players = livePlayers.length > 0 ? livePlayers : lockedPlayers;
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
            background: "rgba(34,197,94,0.15)",
            border: "1px solid rgba(34,197,94,0.35)",
            textAlign: "center",
            fontWeight: 900,
          }}
        >
          {winnerBanner}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 10, color: "#f87171", fontSize: 13, fontWeight: 700 }}>{error}</div>
      )}

      <div style={{ marginTop: 16, opacity: canBet ? 1 : 0.5, pointerEvents: canBet ? "auto" : "none" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input
            value={bet}
            onChange={(e) => setBet(e.target.value)}
            disabled={betMode !== "ton"}
            inputMode="decimal"
            style={{
              flex: 1,
              padding: "12px 14px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.25)",
              color: "#f1f5f9",
              fontWeight: 800,
              fontSize: 16,
            }}
            placeholder="Ставка TON"
          />
          <button
            type="button"
            onClick={placeBet}
            disabled={loading}
            style={{
              padding: "12px 18px",
              borderRadius: 14,
              border: "none",
              background: "linear-gradient(135deg,#7c5cff,#a78bfa)",
              color: "#fff",
              fontWeight: 900,
              cursor: "pointer",
              minWidth: 110,
            }}
          >
            {loading ? "…" : "Ставка"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {[0.5, 1, 2, 5, 10].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setBet(String(v))}
              disabled={betMode !== "ton"}
              style={{
                padding: "6px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.1)",
                background: bet === String(v) ? "rgba(167,139,250,0.25)" : "rgba(255,255,255,0.04)",
                color: "#f1f5f9",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {v}
            </button>
          ))}
        </div>

        {/* Bet mode: TON or NFT gift */}
        <div style={{ marginTop: 4, display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setBetMode("ton")}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 12,
              fontWeight: 800,
              cursor: "pointer",
              border: betMode === "ton" ? "1px solid rgba(167,139,250,0.6)" : "1px solid rgba(255,255,255,0.1)",
              background: betMode === "ton" ? "rgba(167,139,250,0.2)" : "rgba(255,255,255,0.04)",
              color: "#f1f5f9",
            }}
          >
            💎 TON
          </button>
          <button
            type="button"
            onClick={() => {
              setBetMode("gift");
              loadGifts();
            }}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 12,
              fontWeight: 800,
              cursor: "pointer",
              border: betMode === "gift" ? "1px solid rgba(251,191,36,0.55)" : "1px solid rgba(255,255,255,0.1)",
              background: betMode === "gift" ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.04)",
              color: "#f1f5f9",
            }}
          >
            🎁 NFT подарок
          </button>
        </div>

        {betMode === "gift" && (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(0,0,0,0.2)",
            }}
          >
            {giftsLoading ? (
              <div style={{ opacity: 0.7, fontSize: 13 }}>Загрузка подарков…</div>
            ) : gifts.length === 0 ? (
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                Нет подарков.{" "}
                <button
                  type="button"
                  onClick={() => {
                    try {
                      window.dispatchEvent(new CustomEvent("tonyx-navigate", { detail: { tab: "inventory" } }));
                    } catch {
                      /* */
                    }
                    window.location.hash = "#inventory";
                  }}
                  style={{
                    color: "#60a5fa",
                    fontWeight: 800,
                    textDecoration: "underline",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    fontSize: 13,
                  }}
                >
                  Инвентарь
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflow: "auto" }}>
                {gifts.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGiftId(g.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 12,
                      cursor: "pointer",
                      textAlign: "left",
                      border:
                        selectedGiftId === g.id
                          ? "1px solid rgba(251,191,36,0.6)"
                          : "1px solid rgba(255,255,255,0.08)",
                      background:
                        selectedGiftId === g.id ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.03)",
                      color: "#f1f5f9",
                    }}
                  >
                    {g.imageUrl ? (
                      <img
                        src={g.imageUrl}
                        alt=""
                        style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }}
                      />
                    ) : (
                      <span style={{ fontSize: 20 }}>🎁</span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 800,
                          fontSize: 13,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {g.nameRu}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.7 }}>{g.valueTon} TON</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
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
                  p.telegramId === telegramId ? "rgba(124,92,255,0.12)" : "rgba(255,255,255,0.04)",
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
