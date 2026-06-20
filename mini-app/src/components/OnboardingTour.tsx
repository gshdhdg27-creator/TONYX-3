import { useState } from "react";

const CSS = `
  #ob-root{
    position:fixed;inset:0;z-index:9997;
    background:rgba(2,4,8,.92);
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;
    padding:24px 20px;
    animation:obFadeIn .4s ease;
  }
  @keyframes obFadeIn{from{opacity:0}to{opacity:1}}

  .ob-icon{font-size:64px;margin-bottom:20px;text-align:center;animation:obIconPop .45s cubic-bezier(.2,.8,.2,1.2);}
  @keyframes obIconPop{0%{transform:scale(.4);opacity:0}60%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}

  .ob-card{
    background:#0d121c;
    border:1px solid rgba(94,200,255,.2);
    border-radius:20px;
    padding:22px 20px 18px;
    width:100%;max-width:420px;
    box-shadow:0 12px 40px rgba(0,0,0,.7);
    animation:obCardIn .4s ease;
  }
  @keyframes obCardIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}

  .ob-badge{
    display:inline-block;
    font-size:11px;font-weight:800;letter-spacing:1px;color:#3aa6ff;
    background:rgba(58,166,255,.12);
    padding:4px 10px;border-radius:8px;margin-bottom:12px;
  }
  .ob-title{
    font-size:18px;font-weight:800;color:#eaf2fb;margin-bottom:10px;line-height:1.3;
  }
  .ob-desc{
    font-size:13.5px;color:#c4d6ea;line-height:1.6;
  }
  .ob-footer{
    display:flex;align-items:center;justify-content:space-between;margin-top:20px;
  }
  .ob-dots{display:flex;gap:6px;align-items:center;}
  .ob-dot{
    width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.18);
    transition:background .2s,width .2s;
  }
  .ob-dot.on{background:#5ec8ff;width:16px;border-radius:3px;}
  .ob-actions{display:flex;gap:10px;align-items:center;}
  .ob-skip{
    background:none;border:none;color:#7e94ab;font-size:12.5px;
    font-weight:600;padding:8px 4px;cursor:pointer;
    font-family:inherit;
  }
  .ob-btn{
    background:#3aa6ff;color:#fff;font-weight:700;font-size:13px;
    border:none;border-radius:12px;padding:11px 20px;cursor:pointer;
    font-family:inherit;white-space:nowrap;
    transition:transform .1s,filter .1s;
  }
  .ob-btn:active{transform:scale(.96);filter:brightness(.9);}
  .ob-btn-final{
    background:linear-gradient(135deg,#3aa6ff,#0e63c4);
    font-size:14px;padding:13px 24px;
    box-shadow:0 0 20px rgba(58,166,255,.5);
  }
`;

interface Step {
  icon: string;
  badge: string;
  title: string;
  desc: string;
}

const STEPS: Step[] = [
  {
    icon: "🚀",
    badge: "ДОБРО ПОЖАЛОВАТЬ",
    title: "Добро пожаловать в TONYX!",
    desc: "Привет! Ты попал в экосистему, где можно майнить, играть и торговать криптовалютой прямо в Telegram. Давай разберем основные разделы за 1 минуту, чтобы ты сразу начал зарабатывать!",
  },
  {
    icon: "💎",
    badge: "ШАГ 1 / 5",
    title: "Главная — Твой пассивный доход",
    desc: "Это твоё сердце проекта — здесь запущен автоматический майнинг TON! Просто следи за балансом. Твой базовый доход составляет +1.0% в день.\n\nНажми кнопку «🚀 БУСТ», чтобы увеличить скорость майнинга и получать ещё больше TON каждую секунду!",
  },
  {
    icon: "📊",
    badge: "ШАГ 2 / 5",
    title: "Маркет — Стань P2P трейдером",
    desc: "«Маркет» — это полноценный P2P рынок внутри TONYX. Здесь пользователи создают объявления и обменивают TON на внутренний токен TONYX.\n\nВыбирай подходящие ордера (START, BASE, PRO) или нажми «+ Создать предложение», чтобы запустить свою первую сделку!",
  },
  {
    icon: "🎮",
    badge: "ШАГ 3 / 5",
    title: "Игры — Развлекайся и побеждай",
    desc: "Хочешь быстро приумножить монеты? Загляни в «Игры»:\n\n🥊 PvP Арена и PvP Барабан — сражайся с другими игроками и забирай весь банк.\n\n💣 Mines и Игромания — обходи мины, открывай кристаллы и сам выбирай уровень риска!",
  },
  {
    icon: "📺",
    badge: "ШАГ 4 / 5",
    title: "Задания — Лёгкий TON без вложений",
    desc: "Самый простой способ получить первые монеты для старта:\n\nПереходи в «Задания» и нажимай «Смотреть рекламу». За каждый просмотр ты мгновенно получаешь +0.0001 TON (до 100 просмотров в день).\n\nТакже здесь появляются новые интересные задания!",
  },
  {
    icon: "👤",
    badge: "ШАГ 5 / 5",
    title: "Профиль — Твоя команда и вывод",
    desc: "Здесь твои кошельки TON и TONYX, а также история всех операций. Пополняй и выводи средства в любое время.\n\n🔑 Главный секрет: скопируй реферальную ссылку и приглашай друзей — ты навсегда получаешь 10% от TON-наград каждого реферала!",
  },
];

export function OnboardingTour({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [key, setKey] = useState(0);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function next() {
    if (isLast) { onDone(); return; }
    setStep(s => s + 1);
    setKey(k => k + 1);
  }

  return (
    <>
      <style>{CSS}</style>
      <div id="ob-root">
        <div className="ob-icon" key={`icon-${key}`}>{current.icon}</div>
        <div className="ob-card" key={`card-${key}`}>
          <div className="ob-badge">{current.badge}</div>
          <div className="ob-title">{current.title}</div>
          <div className="ob-desc" style={{ whiteSpace: "pre-line" }}>{current.desc}</div>
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
                {isLast ? "ПОЕХАЛИ! 🚀" : "Далее"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
