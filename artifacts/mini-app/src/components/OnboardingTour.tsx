import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

const CSS = `
  .ob-ring {
    animation: obRingIn 0.3s cubic-bezier(.2,.8,.2,1.1);
  }
  @keyframes obRingIn {
    from { opacity: 0; transform: scale(1.07); }
    to   { opacity: 1; transform: scale(1); }
  }

  .ob-card {
    background: #0b1120;
    border: 1px solid rgba(94,200,255,.25);
    border-radius: 20px;
    padding: 16px 16px 14px;
    box-shadow: 0 16px 48px rgba(0,0,0,.85), 0 0 0 1px rgba(58,166,255,.08);
    animation: obCardIn 0.35s ease;
    font-family: 'Space Grotesk','Inter',system-ui,sans-serif;
  }
  @keyframes obCardIn {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .ob-step-label {
    display: inline-block;
    font-size: 9.5px; font-weight: 800; letter-spacing: 1.2px; color: #3aa6ff;
    background: rgba(58,166,255,.12);
    padding: 3px 9px; border-radius: 7px; margin-bottom: 10px;
  }
  .ob-title {
    font-size: 16px; font-weight: 800; color: #eaf2fb;
    margin-bottom: 7px; line-height: 1.3;
  }
  .ob-desc {
    font-size: 12.5px; color: #b8cfdf; line-height: 1.65;
    white-space: pre-line;
  }

  .ob-footer {
    display: flex; align-items: center;
    justify-content: space-between; margin-top: 14px;
  }
  .ob-dots { display: flex; gap: 5px; align-items: center; }
  .ob-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: rgba(255,255,255,.16);
    transition: background .2s, width .2s;
  }
  .ob-dot.on { background: #5ec8ff; width: 14px; border-radius: 3px; }
  .ob-actions { display: flex; gap: 8px; align-items: center; }
  .ob-skip {
    background: none; border: none; color: #5e7a8a;
    font-size: 12px; font-weight: 600; padding: 7px 4px;
    cursor: pointer; font-family: inherit;
  }
  .ob-btn {
    background: #3aa6ff; color: #fff; font-weight: 700;
    font-size: 13px; border: none; border-radius: 12px;
    padding: 10px 17px; cursor: pointer; font-family: inherit;
    white-space: nowrap; transition: transform .1s, filter .1s;
  }
  .ob-btn:active { transform: scale(.96); filter: brightness(.9); }
  .ob-btn-final {
    background: linear-gradient(135deg, #3aa6ff, #0e63c4);
    font-size: 14px; padding: 11px 22px;
    box-shadow: 0 0 20px rgba(58,166,255,.45);
  }
`;

interface TourStep {
  route: string;
  selector: string;
  title: string;
  desc: string;
}

const STEPS: TourStep[] = [
  {
    route: "/",
    selector: '[data-tour="home-mining"]',
    title: "Главная — Твой пассивный доход",
    desc: "Здесь запущен автоматический майнинг TON!\n\nБазовый доход +1.0% в день. Нажми «🚀 БУСТ», чтобы ускорить майнинг и зарабатывать больше каждую секунду!",
  },
  {
    route: "/market",
    selector: '[data-tour="market-orders"]',
    title: "Маркет — P2P торговля",
    desc: "Полноценный P2P рынок внутри TONYX. Пользователи обменивают TON на токен TONYX.\n\nВыбирай ордера (START, BASE, PRO, ELITE) или нажми «+ Создать предложение» внизу!",
  },
  {
    route: "/games",
    selector: '[data-tour="games-section"]',
    title: "Игры — Развлекайся и побеждай",
    desc: "Хочешь быстро приумножить монеты?\n\n⚔️ PvP Арена — сражайся с другими игроками за весь банк.\n💣 Mines и Игромания — обходи мины и выбирай уровень риска сам!",
  },
  {
    route: "/tasks",
    selector: '[data-tour="tasks-watchad"]',
    title: "Задания — Лёгкий TON без вложений",
    desc: "Самый простой способ получить первые монеты!\n\nСмотри рекламу и сразу получай +0.0001 TON за просмотр. До 100 просмотров в день!",
  },
  {
    route: "/profile",
    selector: '[data-tour="profile-referral"]',
    title: "Профиль — Реферальная программа",
    desc: "Скопируй ссылку и приглашай друзей — ты навсегда получаешь 10% от TON-наград каждого реферала!\n\nЗдесь же — кошельки TON и TONYX, история операций и вывод средств.",
  },
];

const PAD = 10;

interface Rect { top: number; left: number; width: number; height: number; }

export function OnboardingTour({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [, navigate] = useLocation();
  const [rect, setRect] = useState<Rect | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const attemptRef = useRef(0);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  useEffect(() => {
    setRect(null);
    navigate(current.route);
    attemptRef.current += 1;
    const myAttempt = attemptRef.current;

    function tryFind(tries: number) {
      if (attemptRef.current !== myAttempt) return;
      const el = document.querySelector(current.selector);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
          setAnimKey(k => k + 1);
          return;
        }
      }
      if (tries > 0) setTimeout(() => tryFind(tries - 1), 100);
    }

    const tid = setTimeout(() => tryFind(8), 300);
    return () => clearTimeout(tid);
  }, [step]);

  const next = () => {
    if (isLast) { onDone(); return; }
    setStep(s => s + 1);
  };

  const vp = typeof window !== "undefined" ? window.innerHeight : 812;

  const hlTop  = rect ? rect.top  - PAD : 0;
  const hlLeft = rect ? rect.left - PAD : 0;
  const hlW    = rect ? rect.width  + PAD * 2 : 0;
  const hlH    = rect ? rect.height + PAD * 2 : 0;

  const tipAbove = rect ? hlTop > vp * 0.45 : false;
  const tipStyle: React.CSSProperties = rect
    ? tipAbove
      ? { bottom: vp - hlTop + 14 }
      : { top: hlTop + hlH + 14 }
    : { bottom: 100 };

  return (
    <>
      <style>{CSS}</style>

      {rect && (
        <div
          className="ob-ring"
          key={`ring-${step}-${animKey}`}
          style={{
            position: "fixed",
            top: hlTop,
            left: hlLeft,
            width: hlW,
            height: hlH,
            borderRadius: 16,
            border: "2px solid #3aa6ff",
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.75), 0 0 30px rgba(58,166,255,0.6)",
            zIndex: 9991,
            pointerEvents: "none",
          }}
        />
      )}

      {!rect && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            zIndex: 9991,
            pointerEvents: "none",
          }}
        />
      )}

      <div
        className="ob-card"
        key={`card-${step}-${animKey}`}
        style={{
          position: "fixed",
          zIndex: 9992,
          left: 16,
          right: 16,
          maxWidth: 448,
          margin: "0 auto",
          ...tipStyle,
          pointerEvents: "auto",
        }}
      >
        <div className="ob-step-label">ШАГ {step + 1} / {STEPS.length}</div>
        <div className="ob-title">{current.title}</div>
        <div className="ob-desc">{current.desc}</div>

        <div className="ob-footer">
          <div className="ob-dots">
            {STEPS.map((_, i) => (
              <div key={i} className={`ob-dot${i === step ? " on" : ""}`} />
            ))}
          </div>
          <div className="ob-actions">
            {!isLast && (
              <button className="ob-skip" onClick={onDone}>Пропустить</button>
            )}
            <button
              className={`ob-btn${isLast ? " ob-btn-final" : ""}`}
              onClick={next}
            >
              {isLast ? "ПОЕХАЛИ! 🚀" : "Далее →"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
