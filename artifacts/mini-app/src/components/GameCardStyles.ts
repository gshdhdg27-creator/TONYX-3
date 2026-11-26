export const CSS = `
@keyframes gcEnter {
  from { opacity: 0; transform: translateY(22px) scale(0.93); }
  to { opacity: 1; transform: none; }
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
@keyframes floatR {
  0%, 100% { transform: translateY(0) rotate(-3deg); }
  50% { transform: translateY(-8px) rotate(3deg); }
}
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}
@keyframes clash {
  0%, 100% { opacity: 0.7; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
}
@keyframes sweep {
  0% { transform: translateX(-130%) skewX(-16deg); opacity: 0; }
  20% { opacity: 0.55; }
  100% { transform: translateX(190%) skewX(-16deg); opacity: 0; }
}
@keyframes rimSpin { to { transform: rotate(360deg); } }
@keyframes ken {
  0%, 100% { transform: scale(1.05); }
  50% { transform: scale(1.12); }
}
.gc {
  --r: 22px;
  position: relative; display: block; width: 100%; aspect-ratio: 1;
  border: 0; padding: 0; border-radius: var(--r); overflow: hidden;
  background: #07070c; isolation: isolate;
  font-family: Inter, system-ui, sans-serif; color: #fff; text-align: left;
  -webkit-tap-highlight-color: transparent;
  animation: gcEnter 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: var(--delay, 0ms);
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.35s ease;
  box-shadow: 0 14px 36px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.07);
}
.gc.wide { aspect-ratio: 2.05 / 1; }
.gc:hover:not(:disabled) {
  transform: translateY(-6px) scale(1.025);
  box-shadow: 0 28px 56px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.12), 0 0 48px color-mix(in srgb, var(--accent) 45%, transparent);
}
.gc:active:not(:disabled) { transform: translateY(-2px) scale(0.985); }
.gc-rim {
  position: absolute; inset: -50%; z-index: 0;
  background: conic-gradient(from 160deg, transparent 0 58%, var(--accent) 70%, rgba(255,255,255,0.8) 80%, transparent 90%);
  animation: rimSpin 5.5s linear infinite; opacity: 0.5; pointer-events: none;
}
.gc-fill { position: absolute; inset: 1.5px; border-radius: calc(var(--r) - 1.5px); z-index: 1; }
.gc-art { position: absolute; inset: 1.5px; border-radius: calc(var(--r) - 1.5px); overflow: hidden; z-index: 2; }
.gc-art.arena .gc-split {
  position: absolute; inset: 0;
  background: linear-gradient(122deg, #1d4ed8 0 34%, #ca8a04 34% 48%, #b91c1c 48% 100%);
}
.gc-glow { position: absolute; width: 120px; height: 120px; border-radius: 50%; filter: blur(30px); pointer-events: none; }
.gc-glow.left { left: 5%; top: 25%; background: rgba(56,189,248,0.55); }
.gc-glow.right { right: 5%; top: 25%; background: rgba(249,115,22,0.5); }
.gc-fighter {
  position: absolute; width: 44%; aspect-ratio: 1; border-radius: 50%; overflow: hidden; top: 18%;
  box-shadow: 0 14px 32px rgba(0,0,0,0.5), inset 0 0 0 3px rgba(255,255,255,0.35);
  background: #111; z-index: 3;
}
.gc-fighter img { width: 100%; height: 100%; object-fit: cover; display: block; }
.gc-fighter.f1 { left: 6%; animation: float 2.6s ease-in-out infinite; }
.gc-fighter.f2 { right: 6%; animation: floatR 2.8s ease-in-out infinite 0.15s; }
.gc-vs {
  position: absolute; left: 50%; top: 58%; transform: translateX(-50%);
  font-weight: 900; font-size: 18px; letter-spacing: 0.12em; color: #fff;
  text-shadow: 0 2px 14px rgba(0,0,0,0.8); z-index: 4;
}
.gc-clash {
  position: absolute; left: 50%; top: 42%; width: 28px; height: 28px; margin: -14px 0 0 -14px;
  border-radius: 50%; background: radial-gradient(circle, #fde68a, #f59e0b 50%, transparent 70%);
  animation: clash 1.4s ease-in-out infinite; z-index: 4;
}
.gc-spin-bg { position: absolute; inset: 0; background: radial-gradient(circle at 50% 40%, rgba(34,211,238,0.25), transparent 55%); }
.gc-wheel {
  position: absolute; left: 50%; top: 40%; width: 58%; aspect-ratio: 1; margin: -29% 0 0 -29%;
  border-radius: 50%;
  background: conic-gradient(#ef4444 0 45deg, #eab308 45deg 90deg, #22c55e 90deg 135deg, #3b82f6 135deg 180deg, #a855f7 180deg 225deg, #f97316 225deg 270deg, #ec4899 270deg 315deg, #06b6d4 315deg 360deg);
  box-shadow: 0 0 0 4px rgba(255,255,255,0.22), 0 12px 28px rgba(0,0,0,0.45);
  animation: spin 7s linear infinite; z-index: 2;
}
.gc-wheel::after {
  content: ""; position: absolute; inset: 28%; border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #2e1065, #0b0b0f);
}
.gc-hero-spin {
  position: absolute; width: 36%; aspect-ratio: 1; left: 50%; bottom: 22%; margin-left: -18%;
  border-radius: 50%; overflow: hidden;
  box-shadow: 0 12px 28px rgba(0,0,0,0.5), inset 0 0 0 2px rgba(255,255,255,0.35);
  animation: float 2.7s ease-in-out infinite; z-index: 3; background: #111;
}
.gc-hero-spin img { width: 100%; height: 100%; object-fit: cover; display: block; }
.gc-orb { position: absolute; width: 14px; height: 14px; border-radius: 50%; z-index: 3; box-shadow: 0 0 12px currentColor; }
.gc-orb.o1 { left: 12%; top: 22%; background: #22d3ee; color: #22d3ee; animation: float 2.4s ease-in-out infinite; }
.gc-orb.o2 { right: 12%; top: 28%; background: #f472b6; color: #f472b6; animation: floatR 2.9s ease-in-out infinite; }
.gc-art.default .gc-cover-img {
  position: absolute; inset: -6%; width: 112%; height: 112%;
  object-fit: cover; object-position: center 18%; animation: ken 12s ease-in-out infinite;
}
.gc-art.rocket .gc-cover-img {
  inset: 18% 14% 30%; width: auto; height: auto; max-width: 70%; max-height: 55%;
  margin: auto; left: 0; right: 0; top: 0; bottom: 0; object-fit: contain;
  animation: float 2.5s ease-in-out infinite; filter: drop-shadow(0 14px 22px rgba(0,0,0,0.5));
}
.gc-shade {
  position: absolute; inset: 1.5px; border-radius: calc(var(--r) - 1.5px); z-index: 3; pointer-events: none;
  background: radial-gradient(ellipse 90% 50% at 50% 0%, rgba(255,255,255,0.1), transparent 50%),
    linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.55) 100%);
}
.gc-sweep { position: absolute; inset: 1.5px; border-radius: calc(var(--r) - 1.5px); overflow: hidden; z-index: 4; pointer-events: none; }
.gc-sweep::after {
  content: ""; position: absolute; top: 0; bottom: 0; width: 40%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent);
  animation: sweep 4s ease-in-out infinite;
}
.gc-top {
  position: absolute; top: 11px; left: 11px; right: 11px; z-index: 6;
  display: flex; align-items: center; justify-content: space-between; pointer-events: none;
}
.gc-badge {
  font-size: 10px; font-weight: 900; letter-spacing: 0.05em; color: #fff;
  border-radius: 999px; padding: 5px 11px; box-shadow: 0 6px 16px rgba(0,0,0,0.4);
}
.gc-online {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 800; color: #fff;
  background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 999px; padding: 5px 10px; backdrop-filter: blur(12px);
}
.gc-online i {
  width: 7px; height: 7px; border-radius: 50%; background: #22c55e;
  display: inline-block; animation: pulse 1.4s ease-in-out infinite;
}
.gc-glass {
  position: absolute; left: 8px; right: 8px; bottom: 8px; z-index: 6;
  padding: 12px 14px 11px; border-radius: 16px;
  background: rgba(8,8,14,0.55); border: 1px solid rgba(255,255,255,0.12);
  backdrop-filter: blur(16px) saturate(1.3);
  box-shadow: 0 8px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.1);
  pointer-events: none;
}
.gc-name { font-size: 20px; font-weight: 900; letter-spacing: -0.03em; line-height: 1.15; color: #fff; }
.gc-max { margin-top: 3px; font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.55); }
`;
