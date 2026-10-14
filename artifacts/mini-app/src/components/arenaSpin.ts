/** Portals-style arena spin animation helpers */

export type Sector = {
  telegramId: string;
  username: string | null;
  stake: number;
  share: number;
  start: number;
  end: number;
  mid: number;
  color: string;
  index: number;
  cx: number;
  cy: number;
  size: number;
  radius: number;
  photoUrl?: string | null;
  chance?: number;
};

export type SpinCallbacks = {
  setArrowAngle: (a: number) => void;
  setArrowVisible: (v: boolean) => void;
  setPuckVisible: (v: boolean) => void;
  paintPuck: (x: number, y: number) => void;
  setBoardZoom: (z: { scale: number; x: number; y: number }) => void;
  setPhase: (p: "lobby" | "spin" | "winner") => void;
  setFreezeSectors: (s: Sector[] | null) => void;
  setFreezePool: (n: number) => void;
  setWinnerData: (d: {
    name: string;
    payout: number;
    mult: number;
    photo?: string | null;
  } | null) => void;
  onDone?: () => void;
};

export function runPortalsSpin(opts: {
  sectors: Sector[];
  winnerId: string | null;
  totalPool: number;
  winnerUsername: string | null;
  payoutOf: (stake: number, pool: number) => number;
  rafRef: { current: number | null };
  replayingRef: { current: boolean };
  cb: SpinCallbacks;
}) {
  const { sectors, winnerId, totalPool, winnerUsername, payoutOf, rafRef, replayingRef, cb } = opts;

  if (rafRef.current) cancelAnimationFrame(rafRef.current);

  const winner = sectors.find((s) => s.telegramId === winnerId) ?? sectors[0];
  if (!winner) return;

  cb.setFreezeSectors(sectors);
  cb.setFreezePool(totalPool);
  cb.setPhase("spin");
  cb.setPuckVisible(true);
  cb.setArrowVisible(true);
  cb.setWinnerData(null);
  cb.setBoardZoom({ scale: 1, x: 50, y: 50 });

  const targetMid = winner.mid;
  const extraTurns = 5 + Math.floor(Math.random() * 3);
  const startAngle = Math.random() * 360;
  const finalAngle =
    startAngle + extraTurns * 360 + ((targetMid - startAngle + 360) % 360);

  const duration = 7200;
  const startTime = performance.now();
  const rimR = 38;

  const tickFn = (now: number) => {
    const raw = Math.min(1, (now - startTime) / duration);
    // easeOutQuart — same feel as Portals spinner
    const t = 1 - Math.pow(1 - raw, 4);

    const angle = startAngle + (finalAngle - startAngle) * t;
    cb.setArrowAngle(angle);

    const rad = ((angle - 90) * Math.PI) / 180;
    cb.paintPuck(50 + Math.cos(rad) * rimR, 50 + Math.sin(rad) * rimR);

    if (raw > 0.8) {
      const k = (raw - 0.8) / 0.2;
      const wrad = ((targetMid - 90) * Math.PI) / 180;
      cb.setBoardZoom({
        scale: 1 + k * 0.55,
        x: 50 + Math.cos(wrad) * 28,
        y: 50 + Math.sin(wrad) * 28,
      });
    }

    if (raw < 1) {
      rafRef.current = requestAnimationFrame(tickFn);
      return;
    }

    cb.setArrowAngle(finalAngle);
    const frad = ((targetMid - 90) * Math.PI) / 180;
    cb.paintPuck(50 + Math.cos(frad) * rimR, 50 + Math.sin(frad) * rimR);
    cb.setBoardZoom({
      scale: 1.55,
      x: 50 + Math.cos(frad) * 28,
      y: 50 + Math.sin(frad) * 28,
    });
    rafRef.current = null;
    cb.setPhase("winner");

    const payout = payoutOf(winner.stake, totalPool);
    const mult =
      winner.stake > 0 ? Math.round((payout / winner.stake) * 100) / 100 : 0;

    cb.setWinnerData({
      name: winnerUsername || winner.username || winner.telegramId,
      payout,
      mult,
      photo: winner.photoUrl,
    });

    if (!replayingRef.current && cb.onDone) {
      setTimeout(() => cb.onDone!(), 3400);
    }
  };

  rafRef.current = requestAnimationFrame(tickFn);
}
