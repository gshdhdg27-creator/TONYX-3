/** Portals-style arena: puck bounces off walls, slows, lands on winner strip */

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

const MARGIN = 8;
const BALL_R = 4;

function sectorTarget(s: Sector): { x: number; y: number } {
  // Center of winner vertical strip
  const left = (s.start / 360) * 100;
  const right = (s.end / 360) * 100;
  return { x: (left + right) / 2, y: 50 };
}

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
  cb.setArrowVisible(false);
  cb.setWinnerData(null);
  cb.setBoardZoom({ scale: 1, x: 50, y: 50 });

  const target = sectorTarget(winner);
  const lo = MARGIN + BALL_R;
  const hi = 100 - MARGIN - BALL_R;

  // Random start, random direction — like Portals puck
  let x = lo + Math.random() * (hi - lo);
  let y = lo + Math.random() * (hi - lo);
  const dir = Math.random() * Math.PI * 2;
  let vx = Math.cos(dir) * (110 + Math.random() * 50);
  let vy = Math.sin(dir) * (110 + Math.random() * 50);

  const duration = 6500;
  const startTime = performance.now();
  let last = startTime;

  const tickFn = (now: number) => {
    const elapsed = now - startTime;
    const raw = Math.min(1, elapsed / duration);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const friction =
      raw < 0.5 ? 0.988 :
      raw < 0.7 ? 0.965 :
      raw < 0.88 ? 0.91 :
      0.8;

    if (Math.hypot(vx, vy) > 0.15) {
      vx *= Math.pow(friction, dt * 60);
      vy *= Math.pow(friction, dt * 60);
    }

    // Late phase: pull into winner strip center
    if (raw > 0.52) {
      const pull = (raw - 0.52) / 0.48;
      const k = 22 + pull * 100;
      vx += (target.x - x) * k * dt;
      vy += (target.y - y) * k * dt;
    }

    x += vx * dt;
    y += vy * dt;

    if (x < lo) { x = lo; vx = Math.abs(vx) * 0.9; }
    if (x > hi) { x = hi; vx = -Math.abs(vx) * 0.9; }
    if (y < lo) { y = lo; vy = Math.abs(vy) * 0.9; }
    if (y > hi) { y = hi; vy = -Math.abs(vy) * 0.9; }

    cb.paintPuck(x, y);

    if (raw > 0.8) {
      const k = (raw - 0.8) / 0.2;
      const ease = 1 - Math.pow(1 - k, 2);
      cb.setBoardZoom({ scale: 1 + ease * 0.38, x, y });
    }

    if (raw < 1 && Math.hypot(vx, vy) > 0.35) {
      rafRef.current = requestAnimationFrame(tickFn);
      return;
    }

    x = target.x;
    y = target.y;
    cb.paintPuck(x, y);
    cb.setBoardZoom({ scale: 1.38, x, y });
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

  cb.paintPuck(x, y);
  rafRef.current = requestAnimationFrame(tickFn);
}
