export const CASES_CSS = `
  .cx-bg {
    position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background:
      radial-gradient(ellipse 80% 50% at 50% -10%, rgba(124,58,237,0.18), transparent 60%),
      radial-gradient(ellipse 60% 40% at 80% 100%, rgba(236,72,153,0.08), transparent 50%),
      #0B1220;
  }
  .cx-tabs { display: flex; gap: 8px; margin: 14px 0 16px; }
  .cx-tab {
    flex: 1; padding: 10px 0; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08);
    background: rgba(15,23,42,0.7); color: #94a3b8; font-weight: 700; font-size: 12px;
    font-family: inherit; cursor: pointer; transition: all 0.2s;
  }
  .cx-tab-on {
    background: linear-gradient(135deg, rgba(124,58,237,0.35), rgba(168,85,247,0.25));
    border-color: rgba(167,139,250,0.45); color: #f5f3ff;
    box-shadow: 0 4px 16px rgba(124,58,237,0.2);
  }
  .cx-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
  }
  .cx-card {
    position: relative; border: none; padding: 0; background: transparent;
    text-align: left; cursor: pointer; font-family: inherit;
    animation: cx-in 0.35s ease both;
  }
  @keyframes cx-in {
    from { opacity: 0; transform: translateY(10px) scale(0.96); }
    to { opacity: 1; transform: none; }
  }
  .cx-card-art {
    position: relative; height: 124px; border-radius: 18px; overflow: hidden;
    background: #0f172a;
    border: 1px solid rgba(255,255,255,0.08);
    box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  }
  .cx-card-glow {
    position: absolute; inset: -40%; filter: blur(40px); opacity: 0.55; pointer-events: none;
  }
  .cx-card-img {
    position: relative; z-index: 1; width: 100%; height: 100%; object-fit: cover; display: block;
  }
  .cx-card-fallback {
    position: relative; z-index: 1; width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
  }
  .cx-pill {
    position: absolute; top: 8px; left: 8px; z-index: 2;
    font-size: 10px; font-weight: 900; padding: 3px 8px; border-radius: 999px;
    letter-spacing: 0.06em;
  }
  .cx-pill.ton { background: rgba(14,165,233,0.9); color: #fff; }
  .cx-pill.key { background: rgba(245,158,11,0.9); color: #1c1917; }
  .cx-card-name {
    margin-top: 8px; font-weight: 800; font-size: 13px; color: #F1F5F9;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .cx-card-cost {
    margin-top: 3px; font-size: 12px; font-weight: 700;
  }
  .cx-card-cost.ok { color: #FDE68A; }
  .cx-card-cost.no { color: #94a3b8; }

  .cx-hero {
    position: relative; height: 180px; display: flex; align-items: center; justify-content: center;
    margin: 8px 0 4px;
  }
  .cx-hero-glow {
    position: absolute; width: 160px; height: 160px; border-radius: 50%;
    filter: blur(40px); opacity: 0.55;
  }
  .cx-hero-img {
    position: relative; z-index: 1; width: 140px; height: 140px; object-fit: contain;
    border-radius: 28px; filter: drop-shadow(0 12px 28px rgba(0,0,0,0.45));
  }
  .cx-hero-fallback {
    position: relative; z-index: 1; width: 140px; height: 140px; border-radius: 28px;
    display: flex; align-items: center; justify-content: center;
  }

  .cx-strip {
    position: relative; height: 140px; margin: 10px 0 6px; overflow: hidden;
    border-radius: 16px; border: 1px solid rgba(255,255,255,0.08);
    background: linear-gradient(180deg, rgba(15,23,42,0.95), rgba(2,6,23,0.98));
  }
  .cx-strip-lit { box-shadow: 0 0 0 1px rgba(167,139,250,0.25), 0 0 40px rgba(124,58,237,0.15); }
  .cx-strip-spinning { }
  .cx-strip-done { }
  .cx-pointer {
    position: absolute; left: 50%; z-index: 5; width: 0; height: 0;
    border-left: 8px solid transparent; border-right: 8px solid transparent;
    transform: translateX(-50%);
    opacity: 0.35; transition: opacity 0.25s;
  }
  .cx-pointer-top { top: 0; border-top: 10px solid #fbbf24; }
  .cx-pointer-bot { bottom: 0; border-bottom: 10px solid #fbbf24; }
  .cx-pointer-on { opacity: 1; }
  .cx-marker {
    position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; z-index: 4;
    background: linear-gradient(180deg, transparent, rgba(251,191,36,0.85), transparent);
    transform: translateX(-50%); opacity: 0.25; transition: opacity 0.25s;
  }
  .cx-marker-on { opacity: 1; }
  .cx-beam {
    position: absolute; left: 50%; top: 0; bottom: 0; width: 48px; z-index: 3;
    transform: translateX(-50%);
    background: linear-gradient(90deg, transparent, rgba(251,191,36,0.08), transparent);
    opacity: 0; transition: opacity 0.3s; pointer-events: none;
  }
  .cx-beam-on { opacity: 1; }
  .cx-strip-track {
    display: flex; align-items: center; height: 100%; padding: 0 12px;
    will-change: transform;
  }
  .cx-strip-item {
    flex: 0 0 108px; width: 108px; height: 120px; border-radius: 12px;
    background: rgba(15,23,42,0.9); border: 1px solid rgba(255,255,255,0.06);
    display: flex; flex-direction: column; overflow: hidden;
    transition: transform 0.2s, opacity 0.25s, box-shadow 0.25s;
  }
  .cx-strip-body {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
    padding: 8px 4px 4px;
  }
  .cx-strip-img { width: 56px; height: 56px; object-fit: cover; border-radius: 50%; }
  .cx-strip-img.cx-coin { border-radius: 50%; object-fit: cover; background: #0a1628; }
  .cx-strip-img.cx-nft { border-radius: 12px; object-fit: contain; }
  .cx-strip-lbl {
    font-size: 10px; font-weight: 800; color: #e2e8f0; text-align: center;
    max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .cx-rarity-bar { height: 4px; width: 100%; }
  .cx-rarity-bar-blue { background: #38bdf8; }
  .cx-rarity-bar-purple { background: #a78bfa; }
  .cx-rarity-bar-pink { background: #f472b6; }
  .cx-rarity-bar-red { background: #f87171; }
  .cx-rarity-bar-gold { background: linear-gradient(90deg,#fbbf24,#f59e0b); }
  .cx-rarity-blue { border-color: rgba(56,189,248,0.35); }
  .cx-rarity-purple { border-color: rgba(167,139,250,0.4); }
  .cx-rarity-pink { border-color: rgba(244,114,182,0.4); }
  .cx-rarity-red { border-color: rgba(248,113,113,0.45); }
  .cx-rarity-gold { border-color: rgba(251,191,36,0.5); box-shadow: 0 0 16px rgba(251,191,36,0.15); }
  .cx-strip-win {
    transform: scale(1.06);
    box-shadow: 0 0 0 2px rgba(251,191,36,0.7), 0 0 28px rgba(251,191,36,0.35);
    z-index: 2;
  }
  .cx-strip-dim { opacity: 0.35; filter: grayscale(0.4); }

  .cx-win {
    position: relative; margin: 10px auto 0; max-width: 280px; padding: 18px 16px 14px;
    border-radius: 18px; overflow: hidden;
    background: rgba(15,23,42,0.92); border: 1px solid rgba(255,255,255,0.1);
    text-align: center;
  }
  .cx-win-glow {
    position: absolute; inset: -30%; filter: blur(40px); opacity: 0.4; pointer-events: none;
    background: radial-gradient(circle, rgba(251,191,36,0.5), transparent 60%);
  }
  .cx-win-img { position: relative; width: 88px; height: 88px; object-fit: cover; border-radius: 50%; }
  .cx-win-img.cx-nft { border-radius: 16px; object-fit: contain; }
  .cx-win-title { position: relative; margin-top: 8px; font-weight: 900; font-size: 18px; color: #fff; }
  .cx-win-price { position: relative; margin-top: 4px; font-size: 13px; font-weight: 700; color: #fde68a; }
  .cx-win-sub { position: relative; margin-top: 4px; font-size: 12px; color: #a78bfa; font-weight: 600; }

  .cx-open {
    width: 100%; padding: 14px 0; border-radius: 14px; border: none;
    color: #fff; font-weight: 900; font-size: 15px; font-family: inherit; cursor: pointer;
  }

  .cx-rewards {
    display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
  }
  .cx-drop {
    border-radius: 14px; padding: 10px; text-align: center;
    background: rgba(15,23,42,0.75); border: 1px solid rgba(255,255,255,0.07);
  }
  .cx-drop-img-wrap { position: relative; height: 64px; display: flex; align-items: center; justify-content: center; }
  .cx-drop-img { width: 52px; height: 52px; object-fit: cover; border-radius: 50%; background: #0a1628; }
  .cx-drop-img.cx-nft { border-radius: 12px; object-fit: contain; background: transparent; }
  .cx-frag {
    position: absolute; right: 18px; bottom: 4px; font-size: 14px;
  }
  .cx-drop-label {
    margin-top: 4px; font-size: 11px; font-weight: 800; color: #e2e8f0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .cx-drop-price { font-size: 10px; color: #fde68a; font-weight: 700; margin-top: 2px; }
  .cx-drop-chance { font-size: 11px; font-weight: 800; color: #a78bfa; margin-top: 4px; }
  .cx-drop-common { border-color: rgba(148,163,184,0.25); }
  .cx-drop-uncommon { border-color: rgba(56,189,248,0.3); }
  .cx-drop-rare { border-color: rgba(167,139,250,0.35); }
  .cx-drop-epic { border-color: rgba(244,114,182,0.4); }
  .cx-drop-legendary { border-color: rgba(251,191,36,0.45); }
`;
