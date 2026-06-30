import { useEffect } from "react";
import tonyxLogoSrc from "/tonyx-logo.jpg?url";

const CSS = `
  #sp-root{
    position:fixed;inset:0;z-index:9999;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    background:radial-gradient(circle at 50% 42%,rgba(20,60,110,.25) 0%,rgba(0,0,0,0) 55%),#000;
    overflow:hidden;
    font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;
  }
  .sp-logo-wrap{
    position:relative;
    width:min(60vw,280px);height:min(60vw,280px);
    display:flex;align-items:center;justify-content:center;
  }
  .sp-glow{
    position:absolute;width:140%;height:140%;border-radius:50%;
    background:radial-gradient(circle,rgba(58,166,255,.35) 0%,rgba(58,166,255,0) 70%);
    opacity:0;animation:spAmbient 3.2s ease-in-out .2s infinite;
  }
  @keyframes spAmbient{
    0%{opacity:0;transform:scale(.85)}20%{opacity:.55;transform:scale(1)}
    50%{opacity:.25;transform:scale(1.05)}100%{opacity:.55;transform:scale(1)}
  }
  .sp-svg{display:block;overflow:visible;width:100%;height:100%;}
  .sp-ring{
    fill:none;stroke:url(#spRingGrad);stroke-width:14;stroke-linecap:round;
    filter:drop-shadow(0 0 6px rgba(90,190,255,.9)) drop-shadow(0 0 22px rgba(40,140,255,.8));
    stroke-dasharray:880;stroke-dashoffset:880;
    animation:spDraw 1.15s cubic-bezier(.4,0,.2,1) .1s forwards;
  }
  .sp-flare{
    fill:none;stroke:#eaf6ff;stroke-width:4;stroke-linecap:round;opacity:0;
    filter:drop-shadow(0 0 8px #fff);
    stroke-dasharray:880;stroke-dashoffset:880;
    animation:spDraw 1.15s cubic-bezier(.4,0,.2,1) .1s forwards,spFlare 1.4s ease-out .1s forwards;
  }
  @keyframes spDraw{to{stroke-dashoffset:0}}
  @keyframes spFlare{0%{opacity:0}8%{opacity:1}60%{opacity:.5}100%{opacity:0}}
  .sp-breath{animation:spBreath 2.6s ease-in-out 1.3s infinite;transform-origin:center;}
  @keyframes spBreath{
    0%,100%{filter:drop-shadow(0 0 6px rgba(90,190,255,.8)) drop-shadow(0 0 18px rgba(40,140,255,.7))}
    50%{filter:drop-shadow(0 0 10px rgba(120,205,255,1)) drop-shadow(0 0 34px rgba(40,140,255,1))}
  }
  .sp-logo-img{
    position:absolute;top:50%;left:50%;width:46%;
    transform:translate(-50%,-50%) scale(.55);opacity:0;
    animation:spLogoIn .65s cubic-bezier(.2,.8,.2,1.2) 1.05s forwards;
    border-radius:50%;object-fit:cover;
  }
  @keyframes spLogoIn{
    0%{opacity:0;transform:translate(-50%,-50%) scale(.4);filter:brightness(2.5)}
    55%{opacity:1;transform:translate(-50%,-50%) scale(1.08);filter:brightness(1.6) drop-shadow(0 0 22px rgba(255,255,255,.9))}
    100%{opacity:1;transform:translate(-50%,-50%) scale(1);filter:brightness(1)}
  }
  .sp-wordmark{
    margin-top:28px;display:flex;align-items:baseline;letter-spacing:4px;
  }
  .sp-wordmark span{
    display:inline-block;
    font-size:clamp(28px,6vw,44px);font-weight:900;font-style:italic;
    background:linear-gradient(180deg,#fff 0%,#c7d3dc 55%,#8d99a3 100%);
    -webkit-background-clip:text;background-clip:text;color:transparent;
    opacity:0;animation:spLetterPop .5s cubic-bezier(.2,.7,.3,1.2) forwards;
  }
  .sp-wordmark span:nth-child(1){animation-delay:1.45s}
  .sp-wordmark span:nth-child(2){animation-delay:1.58s}
  .sp-wordmark span:nth-child(3){animation-delay:1.71s}
  .sp-wordmark span:nth-child(4){animation-delay:1.84s}
  .sp-wordmark .sp-x{
    background:linear-gradient(180deg,#8fd6ff 0%,#2f9dff 60%,#0e63c4 100%);
    -webkit-background-clip:text;background-clip:text;color:transparent;
    filter:drop-shadow(0 0 10px rgba(58,166,255,.8));
    animation-delay:1.97s!important;
  }
  @keyframes spLetterPop{
    0%{opacity:0;transform:translateY(22px) scale(.7);filter:brightness(2) drop-shadow(0 0 14px rgba(140,200,255,.9))}
    60%{opacity:1;transform:translateY(-2px) scale(1.08);filter:brightness(1.3) drop-shadow(0 0 10px rgba(140,200,255,.6))}
    100%{opacity:1;transform:translateY(0) scale(1);filter:brightness(1)}
  }
  .sp-tagline{
    margin-top:14px;opacity:0;
    font-size:clamp(11px,2.4vw,13px);font-weight:700;letter-spacing:5px;color:#cfe6ff;
    animation:spFadeUp .7s ease-out 2.25s forwards;
  }
  .sp-tagline b{color:#3aa6ff;margin:0 8px;font-size:.6em;vertical-align:middle;}
  .sp-track{
    margin-top:34px;width:min(46vw,200px);height:3px;
    background:rgba(58,166,255,.15);border-radius:4px;overflow:hidden;opacity:0;
    animation:spFadeUp .6s ease-out 2.5s forwards;
  }
  .sp-fill{
    height:100%;width:0%;border-radius:4px;
    background:linear-gradient(90deg,#1c5fa8,#5ec8ff,#1c5fa8);
    box-shadow:0 0 10px rgba(94,200,255,.9);
    animation:spFill 1.6s ease-in-out 2.6s forwards;
  }
  @keyframes spFill{to{width:100%}}
  @keyframes spFadeUp{0%{opacity:0;transform:translateY(14px)}100%{opacity:1;transform:translateY(0)}}
`;

export function SplashScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4600);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <>
      <style>{CSS}</style>
      <div id="sp-root">
        <div className="sp-logo-wrap">
          <div className="sp-glow" />
          <svg className="sp-svg" viewBox="0 0 400 400">
            <defs>
              <linearGradient id="spRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3aa6ff" />
                <stop offset="50%" stopColor="#bfe7ff" />
                <stop offset="100%" stopColor="#3aa6ff" />
              </linearGradient>
            </defs>
            <g className="sp-breath">
              <circle className="sp-ring" cx="200" cy="200" r="140" transform="rotate(-90 200 200)" />
              <circle className="sp-flare" cx="200" cy="200" r="140" transform="rotate(-90 200 200)" />
            </g>
          </svg>
          <img className="sp-logo-img" src={tonyxLogoSrc} alt="TONYX" />
        </div>

        <div className="sp-wordmark">
          <span>T</span><span>O</span><span>N</span><span>Y</span><span className="sp-x">X</span>
        </div>

        <div className="sp-tagline">
          EARN<b>•</b>PLAY<b>•</b>GROW
        </div>

        <div className="sp-track">
          <div className="sp-fill" />
        </div>
      </div>
    </>
  );
}
