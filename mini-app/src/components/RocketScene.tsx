import { useEffect, useState, useMemo } from "react";

const CSS = `
  #rk-root{
    position:fixed;inset:0;z-index:9998;
    display:flex;align-items:center;justify-content:center;
    background:#000;overflow:hidden;
    font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;
  }
  #rk-root.rk-glow{animation:rkSceneGlow .9s ease-in forwards;}
  @keyframes rkSceneGlow{0%{background-color:#000}100%{background-color:#0a1622}}

  .rk-stars{position:absolute;inset:0;overflow:hidden;}
  .rk-star{
    position:absolute;
    background:linear-gradient(180deg,rgba(207,233,255,0) 0%,#cfe9ff 65%,#fff 100%);
    border-radius:2px;opacity:.6;
    transform-origin:50% 0%;
    animation-name:rkStarFall;animation-timing-function:linear;animation-iteration-count:infinite;
  }
  @keyframes rkStarFall{
    0%{transform:translateY(-10vh) scaleY(var(--sy,1)) scaleX(var(--sx,1));opacity:0}
    10%{opacity:.9}
    100%{transform:translateY(110vh) scaleY(var(--sy,1)) scaleX(var(--sx,1));opacity:.15}
  }
  .rk-phase-idle .rk-star{animation-duration:3.5s;opacity:.3;--sy:1;--sx:1;}
  .rk-phase-rise .rk-star{animation-duration:.9s;--sy:2.2;--sx:1.1;}
  .rk-phase-acc .rk-star{animation-duration:.38s;--sy:4.5;--sx:1.4;}
  .rk-phase-boost .rk-star{
    animation-duration:.14s;--sy:9;--sx:2.2;opacity:.95;
    box-shadow:0 0 8px 1px rgba(220,240,255,.9);
  }

  .rk-rocket{
    position:absolute;left:50%;top:50%;
    transform:translate(-50%,-50%);
    display:flex;flex-direction:column;align-items:center;
    user-select:none;
  }
  .rk-rocket-inner{position:relative;display:inline-block;}

  .rk-idle .rk-rocket-inner{animation:rkJitter .16s ease-in-out infinite;}
  @keyframes rkJitter{
    0%{transform:translateX(0) rotate(0)}
    25%{transform:translateX(-1.5px) rotate(-.4deg)}
    75%{transform:translateX(1.5px) rotate(.4deg)}
    100%{transform:translateX(0) rotate(0)}
  }
  .rk-launch .rk-rocket-inner{animation:rkHover 1.8s ease-in-out infinite;}
  @keyframes rkHover{
    0%,100%{transform:translateY(0) rotateZ(0)}
    50%{transform:translateY(-4px) rotateZ(.4deg)}
  }

  .rk-emoji{
    font-size:100px;line-height:1;
    filter:drop-shadow(0 0 20px rgba(94,200,255,.7));
    display:block;
  }
  .rk-launch .rk-emoji{animation:rkGlow 3.3s cubic-bezier(.45,0,.4,1) forwards;}
  @keyframes rkGlow{
    0%{filter:drop-shadow(0 0 20px rgba(94,200,255,.7))}
    78%{filter:drop-shadow(0 0 38px rgba(160,215,255,1))}
    100%{filter:drop-shadow(0 0 50px rgba(220,238,255,1))}
  }

  .rk-flame{
    width:28px;height:50px;margin-top:-12px;
    background:radial-gradient(ellipse at 50% 0%,#fff 0%,#9fd9ff 22%,#2f8fe8 50%,rgba(47,143,232,0) 100%);
    border-radius:0 0 50% 50%;filter:blur(.5px);
    transform-origin:50% 0%;
  }
  .rk-idle .rk-flame{opacity:.7;animation:rkSputter .16s ease-in-out infinite;}
  @keyframes rkSputter{
    0%{transform:scaleY(.55);opacity:.5}
    50%{transform:scaleY(.85);opacity:.85}
    100%{transform:scaleY(.5);opacity:.55}
  }
  .rk-launch .rk-flame{
    opacity:1;
    animation:rkFlicker .1s ease-in-out infinite alternate,rkFlameBoost 3.3s cubic-bezier(.45,0,.4,1) forwards;
  }
  @keyframes rkFlicker{0%{transform:scaleY(1)}100%{transform:scaleY(1.18)}}
  @keyframes rkFlameBoost{
    0%{transform:scaleY(1);opacity:1}
    55%{transform:scaleY(1.5);opacity:1}
    78%{transform:scaleY(2.8);opacity:1}
    100%{transform:scaleY(3.6);opacity:.9}
  }

  .rk-whiteout{
    position:absolute;inset:0;
    background:radial-gradient(circle at 50% 55%,#fff 0%,#eaf6ff 45%,#bfe2ff 100%);
    opacity:0;pointer-events:none;
  }
  .rk-whiteout.rk-wo-active{animation:rkWhiteout .9s ease-in forwards;}
  @keyframes rkWhiteout{0%{opacity:0}100%{opacity:1}}

  .rk-label{
    position:absolute;bottom:10%;left:0;right:0;text-align:center;
    opacity:0;animation:rkLabelIn .6s ease-out .1s forwards,rkLabelOut .5s ease-in 1.8s forwards;
  }
  @keyframes rkLabelIn{0%{opacity:0;transform:translateY(8px)}100%{opacity:1;transform:translateY(0)}}
  @keyframes rkLabelOut{to{opacity:0;transform:translateY(-8px)}}
  .rk-label-big{font-size:15px;font-weight:800;letter-spacing:3px;color:#dff0ff;}
  .rk-label-sm{margin-top:6px;font-size:12px;color:#7e94ab;letter-spacing:1px;}
`;

type Phase = "idle" | "rise" | "acc" | "boost";

interface Star {
  id: number;
  left: number;
  width: number;
  height: number;
  delay: number;
}

export function RocketScene({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [rocketPhase, setRocketPhase] = useState<"idle" | "launch">("idle");
  const [whiteout, setWhiteout] = useState(false);
  const [sceneGlow, setSceneGlow] = useState(false);

  const stars = useMemo<Star[]>(() =>
    Array.from({ length: 45 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      width: 1.5 + Math.random() * 1.5,
      height: 10 + Math.random() * 18,
      delay: Math.random() * 3,
    })), []);

  useEffect(() => {
    const t1 = setTimeout(() => { setRocketPhase("launch"); setPhase("rise"); }, 600);
    const t2 = setTimeout(() => setPhase("acc"), 1400);
    const t3 = setTimeout(() => { setPhase("boost"); setSceneGlow(true); }, 2400);
    const t4 = setTimeout(() => setWhiteout(true), 3400);
    const t5 = setTimeout(() => onDone(), 4200);
    return () => [t1, t2, t3, t4, t5].forEach(clearTimeout);
  }, [onDone]);

  return (
    <>
      <style>{CSS}</style>
      <div id="rk-root" className={sceneGlow ? "rk-glow" : ""}>
        <div className={`rk-stars rk-phase-${phase}`}>
          {stars.map(s => (
            <div
              key={s.id}
              className="rk-star"
              style={{
                left: `${s.left}%`,
                top: 0,
                width: s.width,
                height: s.height,
                animationDelay: `${s.delay}s`,
              }}
            />
          ))}
        </div>

        <div className={`rk-rocket rk-${rocketPhase}`}>
          <div className="rk-rocket-inner">
            <span className="rk-emoji">🚀</span>
            <div className="rk-flame" />
          </div>
        </div>

        <div className={`rk-whiteout${whiteout ? " rk-wo-active" : ""}`} />

        <div className="rk-label">
          <div className="rk-label-big">ЗАПУСК TONYX</div>
          <div className="rk-label-sm">подготовка обучения...</div>
        </div>
      </div>
    </>
  );
}
