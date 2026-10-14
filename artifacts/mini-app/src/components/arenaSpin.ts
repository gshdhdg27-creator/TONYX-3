/** Portals-style arena: ball bounces off walls, slows down, lands on winner sector */

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

const MARGIN = 10;
const BALL_R = 4;

function sectorTarget(s: Sector): { x: number; y: number } {
  // Same placement as avatar centroid — land ball on winner territory
  const span = s.end - s.start;
  let r: number;
  if (span >= 180) r = 22;
  else if (span >= 120) r = 26;
  else if (span >= 90) r = 29;
  else if (span >= 60) r = 32;
  else if (span >= 30) r = 35;
  else r = 38;
  const rad = ((s.mid - 90) * Math.PI) / 180;
  return {
    x: 50 + Math.cos(rad) * r,
    y: 50 + Math.sin(rad) * r,
  };
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

  let x = lo + Math.random() * (hi - lo);
  let y = lo + Math.random() * (hi - lo);

  const dir = Math.random() * Math.PI * 2;
  let speed = 95 + Math.random() * 55;
  let vx = Math.cos(dir) * speed;
  let vy = Math.sin(dir) * speed;

  const duration = 6200;
  const startTime = performance.now();
  let last = startTime;

  const tickFn = (now: number) => {
    const elapsed = now - startTime;
    const raw = Math.min(1, elapsed / duration);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const friction =
      raw < 0.55 ? 0.985 :
      raw < 0.75 ? 0.96 :
      raw < 0.9 ? 0.9 :
      0.82;

    speed = Math.hypot(vx, vy);
    if (speed > 0.1) {
      vx *= Math.pow(friction, dt * 60);
      vy *= Math.pow(friction, dt * 60);
    }

    if (raw > 0.55) {
      const pull = (raw - 0.55) / 0.45;
      const k = 18 + pull * 90;
      vx += (target.x - x) * k * dt;
      vy += (target.y - y) * k * dt;
    }

    x += vx * dt;
    y += vy * dt;

    if (x < lo) { x = lo; vx = Math.abs(vx) * 0.92; }
    if (x > hi) { x = hi; vx = -Math.abs(vx) * 0.92; }
    if (y < lo) { y = lo; vy = Math.abs(vy) * 0.92; }
    if (y > hi) { y = hi; vy = -Math.abs(vy) * 0.92; }

    cb.paintPuck(x, y);

    if (raw > 0.78) {
      const k = (raw - 0.78) / 0.22;
      const ease = 1 - Math.pow(1 - k, 2);
      cb.setBoardZoom({ scale: 1 + ease * 0.42, x, y });
    }

    if (raw < 1 && Math.hypot(vx, vy) > 0.4) {
      rafRef.current = requestAnimationFrame(tickFn);
      return;
    }

    x = target.x;
    y = target.y;
    cb.paintPuck(x, y);
    cb.setBoardZoom({ scale: 1.42, x, y });
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
