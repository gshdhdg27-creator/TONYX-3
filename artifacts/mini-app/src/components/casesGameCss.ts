export const CASES_CSS = `
  .cx-bg {
    position: absolute; inset: 0; pointer-events: none; z-index: 0;
    background:
      radial-gradient(ellipse 100% 55% at 50% -8%, rgba(124,58,237,0.5), transparent 58%),
      radial-gradient(ellipse 55% 40% at 95% 25%, rgba(236,72,153,0.22), transparent 52%),
      radial-gradient(ellipse 50% 38% at 5% 75%, rgba(14,165,233,0.18), transparent 50%),
      radial-gradient(ellipse 40% 30% at 70% 90%, rgba(234,179,8,0.08), transparent 45%),
      linear-gradient(180deg, #140a24 0%, #0b0614 42%, #05030a 100%);
  }
  .cx-bg::after {
    content: ""; position: absolute; inset: 0;
    background-image: radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px);
    background-size: 18px 18px; opacity: 0.5;
  }
  .cx-tabs { display: flex; gap: 8px; margin: 16px 0 14px; position: relative; z-index: 1; }
  .cx-tab {
    flex: 1; padding: 10px 0; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08);
    background: rgba(15,23,42,0.55); color: #94a3b8; font-weight: 800; font-size: 12px;
    cursor: pointer; font-family: inherit; transition: all 0.2s ease;
  }
  .cx-tab-on {
    background: linear-gradient(135deg, rgba(124,58,237,0.45), rgba(168,85,247,0.25));
    border-color: rgba(168,85,247,0.5); color: #f5f3ff;
    box-shadow: 0 0 16px rgba(124,58,237,0.25);
  }
  .cx-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 14px; row-gap: 16px;
    position: relative; z-index: 1;
  }
  .cx-card {
    text-align: left; border: none; background: transparent; padding: 0; cursor: pointer;
    font-family: inherit; color: inherit;
    animation: cxIn 0.5s cubic-bezier(0.22,1,0.36,1) both;
    transition: transform 0.2s ease, filter 0.2s ease;
  }
  .cx-card:hover { transform: translateY(-4px) scale(1.02); filter: brightness(1.08); }
  .cx-card:active { transform: scale(0.98); }
  @keyframes cxIn {
    from { opacity: 0; transform: translateY(14px) scale(0.96); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .cx-card-art {
    position: relative; height: 124px; border-radius: 18px; overflow: hidden;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(15,23,42,0.8);
  }
  .cx-card-glow {
    position: absolute; inset: -20%; opacity: 0.55; filter: blur(28px);
    pointer-events: none;
  }
  .cx-card-img {
    position: relative; z-index: 1; width: 100%; height: 100%; object-fit: cover;
  }
  .cx-card-fallback {
    position: relative; z-index: 1; width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
  }
  .cx-pill {
    position: absolute; top: 8px; right: 8px; z-index: 2;
    font-size: 10px; font-weight: 900; padding: 3px 8px; border-radius: 999px;
    letter-spacing: 0.04em;
  }
  .cx-pill.ton { background: rgba(14,165,233,0.85); color: #fff; }
  .cx-pill.key { background: rgba(234,179,8,0.9); color: #1c1917; }
  .cx-card-name {
    margin-top: 10px; font-weight: 800; font-size: 13px; color: #F1F5F9;
    line-height: 1.25;
  }
  .cx-card-cost {
    margin-top: 4px; font-weight: 700; font-size: 12px;
  }
  .cx-card-cost.ok { color: #4ade80; }
  .cx-card-cost.no { color: #f87171; }
  .cx-hero {
    position: relative; height: 180px; margin: 8px 0 16px;
    display: flex; align-items: center; justify-content: center;
  }
  .cx-hero-glow {
    position: absolute; width: 160px; height: 160px; border-radius: 50%;
    filter: blur(40px); opacity: 0.55;
  }
  .cx-hero-img {
    position: relative; z-index: 1; width: 150px; height: 150px; object-fit: contain;
    filter: drop-shadow(0 12px 28px rgba(0,0,0,0.45));
  }
  .cx-hero-fallback {
    position: relative; z-index: 1; width: 140px; height: 140px; border-radius: 28px;
    display: flex; align-items: center; justify-content: center;
  }
  .cx-strip {
    position: relative; height: 150px; margin: 8px 0 18px; overflow: hidden;
    border-radius: 16px; border: 1px solid rgba(255,255,255,0.08);
    background: rgba(8,6,16,0.92);
  }
  .cx-strip-lit { box-shadow: 0 0 0 1px rgba(168,85,247,0.25), 0 0 32px rgba(124,58,237,0.2); }
  .cx-pointer {
    position: absolute; left: 50%; z-index: 5; width: 0; height: 0;
    border-left: 8px solid transparent; border-right: 8px solid transparent;
    transform: translateX(-50%); opacity: 0.35; transition: opacity 0.25s ease;
  }
  .cx-pointer-top { top: 0; border-top: 10px solid #f8fafc; }
  .cx-pointer-bot { bottom: 0; border-bottom: 10px solid #f8fafc; }
  .cx-pointer-on { opacity: 1; }
  .cx-marker {
    position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; z-index: 4;
    background: linear-gradient(180deg, transparent, rgba(248,250,252,0.85), transparent);
    transform: translateX(-50%); opacity: 0.25; transition: opacity 0.25s ease;
  }
  .cx-marker-on { opacity: 1; }
  .cx-beam {
    position: absolute; left: 50%; top: 0; bottom: 0; width: 48px; z-index: 3;
    transform: translateX(-50%);
    background: linear-gradient(90deg, transparent, rgba(168,85,247,0.12), transparent);
    opacity: 0; transition: opacity 0.3s ease; pointer-events: none;
  }
  .cx-beam-on { opacity: 1; }
  .cx-strip-track {
    display: flex; align-items: center; height: 100%; padding: 10px 0;
    will-change: transform;
  }
  .cx-strip-item {
    flex: 0 0 84px; width: 84px; height: 120px; border-radius: 12px;
    background: rgba(15,23,42,0.9); border: 1px solid rgba(255,255,255,0.08);
    display: flex; flex-direction: column; overflow: hidden;
    transition: transform 0.2s ease, opacity 0.25s ease, box-shadow 0.25s ease;
  }
  .cx-strip-body {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; padding: 6px 4px 2px; gap: 4px;
  }
  .cx-strip-img { width: 52px; height: 52px; object-fit: contain; }
  .cx-strip-lbl {
    font-size: 9px; font-weight: 700; color: #e2e8f0; text-align: center;
    line-height: 1.15; max-width: 76px; overflow: hidden;
  }
  .cx-rarity-bar { height: 4px; width: 100%; }
  .cx-rarity-bar-common { background: #64748b; }
  .cx-rarity-bar-uncommon { background: #22c55e; }
  .cx-rarity-bar-rare { background: #3b82f6; }
  .cx-rarity-bar-epic { background: #a855f7; }
  .cx-rarity-bar-legendary { background: linear-gradient(90deg,#f59e0b,#ef4444); }
  .cx-strip-win {
    transform: scale(1.08); z-index: 2;
    box-shadow: 0 0 24px rgba(168,85,247,0.55);
    border-color: rgba(168,85,247,0.7);
  }
  .cx-strip-dim { opacity: 0.35; }
  .cx-win {
    position: relative; text-align: center; margin: 8px 0 14px; padding: 16px;
    border-radius: 18px; overflow: hidden;
    border: 1px solid rgba(168,85,247,0.35);
    background: rgba(15,23,42,0.75);
  }
  .cx-win-glow {
    position: absolute; inset: -30%; background: radial-gradient(circle, rgba(168,85,247,0.25), transparent 60%);
    pointer-events: none;
  }
  .cx-win-img { position: relative; width: 88px; height: 88px; object-fit: contain; }
  .cx-win-title { position: relative; font-weight: 900; font-size: 18px; color: #f8fafc; margin-top: 8px; }
  .cx-win-price { position: relative; color: #fde68a; font-weight: 700; font-size: 13px; margin-top: 4px; }
  .cx-win-sub { position: relative; color: #94a3b8; font-size: 12px; margin-top: 4px; }
  .cx-open {
    width: 100%; padding: 14px 0; border-radius: 14px; border: none;
    color: #fff; font-weight: 800; font-size: 15px; cursor: pointer; font-family: inherit;
  }
  .cx-rewards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .cx-drop {
    border-radius: 14px; padding: 10px; text-align: center;
    background: rgba(15,23,42,0.7); border: 1px solid rgba(255,255,255,0.08);
  }
  .cx-drop-img-wrap { position: relative; height: 64px; display: flex; align-items: center; justify-content: center; }
  .cx-drop-img { width: 52px; height: 52px; object-fit: contain; }
  .cx-frag { position: absolute; right: 8px; top: 0; font-size: 14px; }
  .cx-drop-label { font-size: 11px; font-weight: 700; color: #e2e8f0; margin-top: 6px; line-height: 1.2; }
  .cx-drop-price { font-size: 10px; color: #fde68a; margin-top: 3px; font-weight: 600; }
  .cx-drop-chance { font-size: 11px; font-weight: 800; color: #a78bfa; margin-top: 4px; }
  .cx-drop-common { border-color: rgba(100,116,139,0.4); }
  .cx-drop-uncommon { border-color: rgba(34,197,94,0.35); }
  .cx-drop-rare { border-color: rgba(59,130,246,0.4); }
  .cx-drop-epic { border-color: rgba(168,85,247,0.45); }
  .cx-drop-legendary { border-color: rgba(245,158,11,0.5); }
`;
