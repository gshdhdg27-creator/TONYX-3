import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import WinnerModal from "./WinnerModal";
import FairnessModal, { type FairData } from "@/components/FairnessModal";
import SpinHistoryModal from "@/components/SpinHistoryModal";
import { haptic, hapticNotify } from "@/lib/telegram";

const AVATAR_MIN_SHARE = 0.05;
const WHEEL_SIZE = 280;
const COLORS = [
  "#a78bfa", "#f472b6", "#60a5fa", "#34d399", "#fbbf24",
  "#f87171", "#22d3ee", "#c084fc", "#fb923c", "#4ade80",
];

type NftStakeInfo = {
  inventoryId: number;
  itemId: string;
  valueTon: number;
  nameRu?: string;
  imageUrl?: string | null;
};

type Player = {
  telegramId: string;
  username: string | null;
  stake: number;
  chance: number;
  photoUrl?: string | null;
  nftStakes?: NftStakeInfo[];
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


function TonIcon({ size = 16 }: { size?: number }) {
  return (
    <img
      src="/toncoin.png"
      alt="TON"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "contain", display: "inline-block", verticalAlign: "middle", borderRadius: size > 20 ? 8 : 4 }}
      draggable={false}
    />
  );
}

function TonChip({ amount, size = 52 }: { amount: number | string; size?: number }) {
  const label = typeof amount === "number"
    ? (Math.abs(amount - Math.round(amount)) < 1e-9 ? String(Math.round(amount)) : amount.toFixed(2))
    : String(amount);
  const fontSize = Math.max(12, Math.round(size * 0.30));
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.22),
      background: "linear-gradient(145deg,#3b82f6 0%,#1d4ed8 100%)",
      border: "1px solid rgba(255,255,255,0.28)",
      boxShadow: "0 4px 12px rgba(37,99,235,0.35)",
      display: "flex", alignItems: "center", justifyContent: "center",
      position: "relative", flexShrink: 0, overflow: "hidden",
    }}>
      <TonIcon size={Math.round(size * 0.64)} />
      <span style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 900, fontSize, color: "#fff",
        textShadow: "0 1px 3px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.45)",
        letterSpacing: "-0.02em", pointerEvents: "none",
      }}>{label}</span>
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
  const [betMode, setBetMode] = useState<"ton" | "gift">("ton");
  const DEFAULT_SPIN_CHIPS = [0.1, 0.15, 1, 10];
  const [spinChips, setSpinChips] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem("tonyx_spin_chips");
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length >= 4) return arr.slice(0, 4).map((x: any) => Number(x) || 0.1);
      }
    } catch { /* */ }
    return DEFAULT_SPIN_CHIPS;
  });
  const [editOpen, setEditOpen] = useState(false);
  const [editIdx, setEditIdx] = useState(0);
  const [editVal, setEditVal] = useState("");
  const [stakeDetail, setStakeDetail] = useState<Player | null>(null);
  const [gifts, setGifts] = useState<Array<{ id: number; itemId: string; nameRu: string; valueTon: number; imageUrl: string | null; locked?: boolean }>>([]);
  const [giftsLoading, setGiftsLoading] = useState(false);
  const [selectedGiftIds, setSelectedGiftIds] = useState<number[]>([]);
  const [giftPickerOpen, setGiftPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [rotateDeg, setRotateDeg] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [winnerBanner, setWinnerBanner] = useState<{
    name: string;
    payout: number;
    chance: number;
    mult: number;
    photo?: string | null;
    prizes: { name: string; valueTon: number; imageUrl?: string | null }[];
  } | null>(null);
  // Keep last non-empty players so wheel sectors never flash empty
  const [lockedPlayers, setLockedPlayers] = useState<Player[]>([]);

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
      if (data.players?.length) setLockedPlayers(data.players);
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
            const prizes: { name: string; valueTon: number; imageUrl?: string | null }[] = [];
            for (const pl of data.players) {
              if (pl.telegramId === data.winnerId) continue;
              for (const n of (pl.nftStakes ?? [])) {
                prizes.push({
                  name: (n as any).nameRu || (n as any).itemId || "NFT",
                  valueTon: Number((n as any).valueTon) || 0,
                  imageUrl: (n as any).imageUrl,
                });
              }
            }
            const totalPure = data.players.reduce((s, pl) => {
              const nftSum = (pl.nftStakes ?? []).reduce((a, n) => a + (Number((n as any).valueTon) || 0), 0);
              return s + Math.max(0, (pl.stake || 0) - nftSum);
            }, 0);
            const burned = totalPure + 1e-9 < others * 0.2;
            const mult = stake > 0 ? Math.round((payout / stake) * 100) / 100 : 0;
            setWinnerBanner({
              name: data.winnerUsername || data.winnerId || "?",
              payout,
              chance,
              mult,
              photo: wp?.photoUrl,
              prizes: burned ? [] : prizes,
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
        const incoming = data.players || [];
        // Never flash empty wheel right after spin/replay
        if (incoming.length > 0) {
          setRound(data);
          setLockedPlayers(incoming);
          if (data.status === "waiting") setWinnerBanner(null);
        } else if (!spinningRef.current && !replayingRef.current) {
          // empty waiting: keep locked players for display, update meta
          setRound((prev) => {
            if (prev && (prev.status === "finished" || (prev.players?.length ?? 0) > 0)) {
              return { ...data, players: prev.players, totalPool: prev.totalPool };
            }
            return data;
          });
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


  const loadGifts = async (autoSelectCheapest = false) => {
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
        .map((x: { id: number; itemId: string; nameRu?: string; valueTon?: number; imageUrl?: string | null; meta?: Record<string, unknown> }) => {
          const m = (x.meta || {}) as Record<string, unknown>;
          const locked = m.listed === true || m.spinLocked === true;
          return {
            id: x.id,
            itemId: x.itemId,
            nameRu: String(x.nameRu || m.giftName || m.nameRu || x.itemId),
            valueTon: Number(x.valueTon) || Number(m.valueTon) || Number(m.priceTon) || 0,
            imageUrl: (x.imageUrl || m.imageUrl || m.photoUrl || null) as string | null,
            locked: !!locked,
          };
        })
        .filter((g: { locked: boolean }) => !g.locked)
        .sort((a: { valueTon: number }, b: { valueTon: number }) => a.valueTon - b.valueTon);
      setGifts(list);
      if (autoSelectCheapest && list.length > 0 && selectedGiftIds.length === 0) {
        setSelectedGiftIds([list[0].id]);
      }
    } catch {
      setGifts([]);
    } finally {
      setGiftsLoading(false);
    }
  };

  const toggleGift = (id: number) => {
    setSelectedGiftIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectedGifts = gifts.filter((g) => selectedGiftIds.includes(g.id));
  const giftStakeTotal = selectedGifts.reduce((s, g) => s + (g.valueTon || 0), 0);

  const placeBet = async (overrideAmount?: number) => {
    if (!telegramId) {
      setError("Открой игру из Telegram");
      return;
    }
    if (loading || spinning) return;
    if (round?.status === "finished" && !winnerBanner) {
      setError("Раунд завершён, подожди новый");
      return;
    }
    const amount = betMode === "ton" ? (overrideAmount ?? parseFloat(bet)) : 0;
    if (betMode === "ton" && (!amount || amount <= 0)) return;
    if (betMode === "gift" && selectedGiftIds.length === 0) {
      setError("Выбери NFT подарок");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const plist = round?.players || [];
      const me = plist.find((p) => p.telegramId === telegramId);
      const url = me ? "/api/mini/games/spin/increase" : "/api/mini/games/spin/join";
      const body =
        betMode === "gift"
          ? {
              telegramId,
              giftInventoryIds: selectedGiftIds,
              giftInventoryId: selectedGiftIds[0],
            }
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
      if (betMode === "gift") {
        setSelectedGiftIds([]);
        setGiftPickerOpen(false);
        loadGifts();
      }
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
        <WinnerModal
          name={winnerBanner.name}
          payout={Number(winnerBanner.payout)}
          mult={winnerBanner.mult ?? 0}
          photo={winnerBanner.photo}
          prizes={winnerBanner.prizes || []}
          onClose={() => setWinnerBanner(null)}
        />
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

      {players.length > 0 && (
        <div style={{ marginTop: 14, marginBottom: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", letterSpacing: "0.06em" }}>
            ИГРОКИ · {players.length}
          </div>
          {players.map((p) => {
            const nfts = p.nftStakes ?? [];
            const isWinner = !!(round?.status === "finished" || winnerBanner) && !!round?.winnerId && p.telegramId === round.winnerId;
            const initials = (p.username || p.telegramId || "?").replace(/^@/, "").slice(0, 2).toUpperCase();
            const avatar = (p.photoUrl && String(p.photoUrl).startsWith("http"))
              ? p.photoUrl
              : (p.username && String(p.username).replace(/^@/, "").trim()
                ? `https://t.me/i/userpic/320/${encodeURIComponent(String(p.username).replace(/^@/, "").trim())}.jpg`
                : null);
            return (
              <button
                type="button"
                key={p.telegramId}
                onClick={() => setStakeDetail(p)}
                style={{
                  display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                  padding: "12px 12px 10px", borderRadius: 16, fontFamily: "inherit", color: "inherit",
                  background: isWinner
                    ? "linear-gradient(135deg, rgba(34,197,94,0.18), rgba(34,197,94,0.06))"
                    : "rgba(255,255,255,0.04)",
                  border: isWinner
                    ? "1px solid rgba(34,197,94,0.45)"
                    : "1px solid rgba(255,255,255,0.08)",
                  boxShadow: isWinner ? "0 0 0 1px rgba(34,197,94,0.15)" : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
                    background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 900, fontSize: 12, color: "#e2e8f0",
                    border: isWinner ? "2px solid #4ade80" : "2px solid transparent",
                  }}>
                    {avatar
                      ? <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          onError={(e) => {
                            const el = e.currentTarget;
                            el.style.display = "none";
                            if (el.parentElement) el.parentElement.textContent = initials;
                          }} />
                      : initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      @{(p.username || p.telegramId || "").replace(/^@/, "")}
                      {p.telegramId === telegramId ? " (вы)" : ""}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 2, fontWeight: 700 }}>
                      {isWinner
                        ? <span style={{ color: "#4ade80" }}>Победитель <span style={{ opacity: 0.85 }}>{(p.chance ?? 0).toFixed(2)}%</span></span>
                        : <span style={{ color: "#94a3b8" }}>{(p.chance ?? 0).toFixed(2)}%</span>}
                    </div>
                  </div>
                  <div style={{
                    fontWeight: 900, fontSize: 15, flexShrink: 0,
                    color: isWinner ? "#4ade80" : "#e2e8f0",
                  }}>
                    {Number(p.stake).toFixed(2)} TON
                  </div>
                </div>
                {/* stake chips: pure TON + NFTs */}
                {(() => {
                  const nftSum = nfts.reduce((s, n) => s + (Number(n.valueTon) || 0), 0);
                  const pureTon = Math.max(0, Math.round((Number(p.stake) - nftSum) * 1000) / 1000);
                  return (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, paddingLeft: 2 }}>
                      {pureTon > 1e-9 && (
                        <TonChip amount={pureTon} size={52} />
                      )}
                      {nfts.map((n) => (
                        <div key={n.inventoryId} style={{
                          width: 48, height: 48, borderRadius: 12, overflow: "hidden", position: "relative",
                          background: "rgba(59,130,246,0.2)", border: "1px solid rgba(59,130,246,0.35)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {n.imageUrl
                            ? <img src={n.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : <span style={{ fontSize: 18 }}>🎁</span>}
                          <span style={{
                            position: "absolute", left: 4, bottom: 3, fontSize: 10, fontWeight: 900, color: "#fff",
                            textShadow: "0 1px 2px #000",
                          }}>{n.valueTon}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </button>
            );
          })}
        </div>
      )}


      <div style={{ height: 110 }} />
      {/* Fixed bet bar bottom */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 62, zIndex: 40,
        padding: "8px 12px 10px",
        background: "linear-gradient(180deg, transparent, rgba(8,8,15,0.92) 25%, #08080f)",
      }}>
      {/* Mode toggle + chips — same as Arena */}
      <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 12, marginBottom: 8 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 2, padding: 3,
          borderRadius: 999, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
        }}>
          <button
            type="button"
            onClick={() => { setBetMode("gift"); loadGifts(true); }}
            disabled={!canBet}
            style={{
              width: 40, height: 30, borderRadius: 999, border: "none", cursor: canBet ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
              background: betMode === "gift" ? "#3b82f6" : "transparent",
              color: betMode === "gift" ? "#fff" : "rgba(255,255,255,0.55)",
              opacity: canBet ? 1 : 0.5,
            }}
            title="NFT гифты"
          >🎁</button>
          <button
            type="button"
            onClick={() => setBetMode("ton")}
            disabled={!canBet}
            style={{
              width: 40, height: 30, borderRadius: 999, border: "none", cursor: canBet ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
              background: betMode === "ton" ? "#3b82f6" : "transparent",
              color: betMode === "ton" ? "#fff" : "rgba(255,255,255,0.55)",
              opacity: canBet ? 1 : 0.5,
            }}
            title="TON"
          ><TonIcon size={22} /></button>
        </div>
      </div>

      {betMode === "ton" ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", width: "100%" }}>
          <button
            type="button"
            onClick={() => { setEditIdx(0); setEditVal(String(spinChips[0] ?? "")); setEditOpen(true); }}
            style={{
              flex: "0 0 auto", width: 38, height: 38, padding: 0, fontSize: 14,
              borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)",
              background: "#0a0a0f", color: "#cbd5e1", cursor: "pointer", fontFamily: "inherit", fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            title="Изменить чипы"
          >✎</button>
          {spinChips.map((v, i) => (
            <button
              key={i}
              type="button"
              disabled={loading || !canBet}
              onClick={() => { setBet(String(v)); placeBet(Number(v)); }}
              style={{
                flex: "1 1 0", minWidth: 0, height: 38,
                padding: "0 4px", borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "#0a0a0f",
                color: "#f1f5f9", fontWeight: 900, fontSize: 13,
                cursor: loading || !canBet ? "not-allowed" : "pointer",
                opacity: loading || !canBet ? 0.45 : 1,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3,
                fontFamily: "inherit",
              }}
            >
              {v}<span style={{ marginLeft: 4, display: "inline-flex", alignItems: "center" }}><TonIcon size={15} /></span>
            </button>
          ))}
          <button
            type="button"
            disabled={loading || !canBet || tonBalance < 0.1}
            onClick={() => {
              const all = Math.floor(tonBalance * 1000) / 1000;
              if (all >= 0.1) { setBet(String(all)); placeBet(all); }
            }}
            style={{
              flex: "1.25 1 0", minWidth: 0, height: 38,
              padding: "0 6px", borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "#0a0a0f",
              color: "#f1f5f9", fontWeight: 900, fontSize: 12,
              cursor: loading || !canBet ? "not-allowed" : "pointer",
              opacity: loading || !canBet || tonBalance < 0.1 ? 0.45 : 1,
              whiteSpace: "nowrap", fontFamily: "inherit",
            }}
          >
            Ва-банк
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, alignItems: "center", width: "100%" }}>
          <button
            type="button"
            disabled={!canBet}
            onClick={() => { setGiftPickerOpen(true); loadGifts(true); }}
            style={{
              flex: 1, padding: "12px 16px", borderRadius: 999, border: "none",
              background: "#f1f5f9", color: "#0f172a", fontWeight: 800, fontSize: 14,
              cursor: canBet ? "pointer" : "not-allowed", opacity: canBet ? 1 : 0.5,
            }}
          >
            Выбрать гифты{selectedGiftIds.length > 1 ? ` (${selectedGiftIds.length})` : ""}
          </button>
          <button
            type="button"
            disabled={loading || !canBet || selectedGiftIds.length === 0}
            onClick={() => placeBet()}
            style={{
              flex: 1, padding: "8px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)",
              background: "#2a2a32", color: "#e2e8f0", fontWeight: 800, fontSize: 13,
              cursor: loading || !canBet || !selectedGiftIds.length ? "not-allowed" : "pointer",
              opacity: selectedGiftIds.length ? 1 : 0.55,
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              minHeight: 44,
            }}
          >
            {loading ? "…" : (
              <>
                <span style={{ fontWeight: 800 }}>{players.some((p) => p.telegramId === telegramId) ? "Добавить" : "Поставить"}</span>
                {selectedGifts.length === 1 && selectedGifts[0].imageUrl ? (
                  <img src={selectedGifts[0].imageUrl} alt="" style={{ width: 28, height: 28, borderRadius: 8, objectFit: "cover", background: "#111" }} />
                ) : selectedGifts.length > 1 ? (
                  <span style={{ fontSize: 15 }}>🎁×{selectedGifts.length}</span>
                ) : selectedGifts.length === 1 ? (
                  <span style={{ fontSize: 16 }}>🎁</span>
                ) : null}
                {giftStakeTotal > 0 && (
                  <span style={{ fontWeight: 900, color: "#fff" }}>{giftStakeTotal.toFixed(2)}</span>
                )}
              </>
            )}
          </button>
        </div>
      )}

      </div>

      {/* Gift multi-select sheet */}
      {giftPickerOpen && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 500,
          }}
          onClick={() => setGiftPickerOpen(false)}
        >
          <div
            style={{
              width: "100%", maxWidth: 420, background: "linear-gradient(180deg,#12141c,#0a0c12)",
              borderRadius: "22px 22px 0 0", padding: "18px 16px 28px", maxHeight: "75vh", overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Выбрать гифты</div>
              <button type="button" onClick={() => setGiftPickerOpen(false)}
                style={{ width: 36, height: 36, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                ✕
              </button>
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>
              Можно выбрать несколько. По умолчанию — самый дешёвый.
            </div>
            {giftsLoading ? (
              <div style={{ opacity: 0.7, fontSize: 13, padding: 12 }}>Загрузка…</div>
            ) : gifts.length === 0 ? (
              <div style={{ fontSize: 13, lineHeight: 1.5, padding: 8 }}>
                Нет доступных NFT.{" "}
                <a href="/inventory" onClick={(e) => { e.preventDefault(); window.location.assign("/inventory"); }}
                  style={{ color: "#60a5fa", fontWeight: 800 }}>Инвентарь</a>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {gifts.map((g) => {
                  const on = selectedGiftIds.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleGift(g.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 14,
                        cursor: "pointer", textAlign: "left",
                        border: on ? "1px solid rgba(59,130,246,0.7)" : "1px solid rgba(255,255,255,0.08)",
                        background: on ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.03)",
                        color: "#f1f5f9",
                      }}
                    >
                      {g.imageUrl
                        ? <img src={g.imageUrl} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover" }} />
                        : <span style={{ fontSize: 24 }}>🎁</span>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.nameRu}</div>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>{g.valueTon} TON</div>
                      </div>
                      <div style={{
                        width: 22, height: 22, borderRadius: 6,
                        border: on ? "none" : "2px solid rgba(255,255,255,0.25)",
                        background: on ? "#3b82f6" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontSize: 13, fontWeight: 900,
                      }}>
                        {on ? "✓" : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              disabled={selectedGiftIds.length === 0}
              onClick={() => setGiftPickerOpen(false)}
              style={{
                width: "100%", marginTop: 14, padding: "14px", borderRadius: 14, border: "none",
                background: selectedGiftIds.length ? "linear-gradient(135deg,#3b82f6,#60a5fa)" : "rgba(255,255,255,0.08)",
                color: "#fff", fontWeight: 900, fontSize: 14, cursor: selectedGiftIds.length ? "pointer" : "default",
              }}
            >
              {selectedGiftIds.length
                ? `Готово · ${selectedGiftIds.length} · ${giftStakeTotal.toFixed(2)} TON`
                : "Выбери хотя бы один"}
            </button>
          </div>
        </div>
      )}




      {stakeDetail && (
        <div
          onClick={() => setStakeDetail(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 340, borderRadius: 20,
              background: "linear-gradient(180deg,#1c1c24,#121218)",
              border: "1px solid rgba(255,255,255,0.1)", padding: 16, color: "#f1f5f9",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
                background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 900, fontSize: 12,
              }}>
                {(() => {
                  const p = stakeDetail;
                  const initials = (p.username || p.telegramId || "?").replace(/^@/, "").slice(0, 2).toUpperCase();
                  const avatar = (p.photoUrl && String(p.photoUrl).startsWith("http"))
                    ? p.photoUrl
                    : (p.username ? `https://t.me/i/userpic/320/${encodeURIComponent(String(p.username).replace(/^@/, ""))}.jpg` : null);
                  return avatar
                    ? <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError={(e) => { e.currentTarget.style.display = "none"; }} />
                    : initials;
                })()}
              </div>
              <div style={{ flex: 1, fontWeight: 800, fontSize: 15 }}>
                Ставка @{(stakeDetail.username || stakeDetail.telegramId || "").replace(/^@/, "")}
              </div>
              <button type="button" onClick={() => setStakeDetail(null)}
                style={{ border: "none", background: "transparent", color: "#94a3b8", fontSize: 18, cursor: "pointer" }}>×</button>
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 14 }}>
              {Number(stakeDetail.stake).toFixed(2)} TON
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {(() => {
                const nfts = stakeDetail.nftStakes ?? [];
                const nftSum = nfts.reduce((s, n) => s + (Number(n.valueTon) || 0), 0);
                const pureTon = Math.max(0, Math.round((Number(stakeDetail.stake) - nftSum) * 1000) / 1000);
                return (
                  <>
                    {pureTon > 1e-9 && (
                        <TonChip amount={pureTon} size={72} />
                      )}
                    {nfts.map((n) => (
                      <div key={n.inventoryId} style={{
                        width: 72, height: 72, borderRadius: 14, overflow: "hidden", position: "relative",
                        background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {n.imageUrl
                          ? <img src={n.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : <span style={{ fontSize: 24 }}>🎁</span>}
                        <span style={{
                          position: "absolute", left: 6, bottom: 4, fontSize: 11, fontWeight: 900, color: "#fff",
                          textShadow: "0 1px 3px #000",
                        }}>{n.valueTon}</span>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {editOpen && (
        <div
          onClick={() => setEditOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 420, borderRadius: "20px 20px 0 0",
              background: "linear-gradient(180deg,#1a1a24,#0e0e14)", padding: "18px 16px 28px",
              border: "1px solid rgba(255,255,255,0.1)", color: "#f1f5f9",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 12 }}>Чипы ставки</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {spinChips.map((v, i) => (
                <button key={i} type="button" onClick={() => { setEditIdx(i); setEditVal(String(v)); }}
                  style={{
                    flex: 1, padding: "10px 4px", borderRadius: 12, fontWeight: 900, fontSize: 13,
                    border: editIdx === i ? "1px solid rgba(59,130,246,0.7)" : "1px solid rgba(255,255,255,0.12)",
                    background: editIdx === i ? "rgba(59,130,246,0.2)" : "#0a0a0f", color: "#f1f5f9", cursor: "pointer",
                  }}>{v}</button>
              ))}
            </div>
            <input
              value={editVal}
              onChange={(e) => setEditVal(e.target.value.replace(",", "."))}
              inputMode="decimal"
              placeholder="Сумма"
              style={{
                width: "100%", boxSizing: "border-box", padding: "12px", borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.35)",
                color: "#fff", fontWeight: 800, fontSize: 16, marginBottom: 12,
              }}
            />
            <button
              type="button"
              onClick={() => {
                const n = parseFloat(editVal);
                if (!n || n < 0.1) return;
                const next = [...spinChips];
                next[editIdx] = Math.round(n * 1000) / 1000;
                setSpinChips(next);
                try { localStorage.setItem("tonyx_spin_chips", JSON.stringify(next)); } catch { /* */ }
                setEditOpen(false);
              }}
              style={{
                width: "100%", padding: "14px", borderRadius: 14, border: "none",
                background: "linear-gradient(135deg,#3b82f6,#60a5fa)", color: "#fff", fontWeight: 900, fontSize: 15, cursor: "pointer",
              }}
            >Сохранить</button>
          </div>
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
