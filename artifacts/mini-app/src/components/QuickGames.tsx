import { useMemo, useState, type CSSProperties } from "react";

type QuickGameKind = "dice" | "roulette";
type Props = { game: QuickGameKind; telegramId: string; balance: number; onBalanceChange: () => void };
type Result = { won: boolean; roll?: number; number?: number; resultColor?: "red" | "black" | "green"; payout: number; newBalance: number; serverSeedHash?: string };

const PRESETS = [1, 5, 10, 25, 50];

const ROULETTE_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const ROULETTE_RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

export default function QuickGames({ game, telegramId, balance, onBalanceChange }: Props) {
  const [stake, setStake] = useState(10);
  const [threshold, setThreshold] = useState(50);
  const [direction, setDirection] = useState<"over" | "under">("over");
  const [color, setColor] = useState<"red" | "black" | "green">("red");
  const [busy, setBusy] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<Result[]>([]);

  const potential = useMemo(() => {
    if (game === "dice") {
      const chance = direction === "over" ? 99 - threshold : threshold - 1;
      return chance > 0 ? stake * (98 / chance) * 0.97 : 0;
    }
    return stake * (color === "green" ? 14 : 1.94);
  }, [game, stake, threshold, direction, color]);

  const play = async () => {
    if (busy || stake < 0.1 || stake > balance || !telegramId) return;
    setBusy(true); setRolling(true); setError(""); setResult(null);
    try {
      const payload = game === "dice"
        ? { telegramId, stake, threshold, direction }
        : { telegramId, stake, color };
      const response = await fetch(`/api/mini/games/${game}/play`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "Не удалось сыграть"); return; }
      // Keep the result hidden until the roll animation completes.
      await new Promise(resolve => window.setTimeout(resolve, game === "dice" ? 950 : 1450));
      const next = data as Result;
      setResult(next);
      setHistory(prev => [next, ...prev].slice(0, 8));
      onBalanceChange();
    } catch {
      setError("Ошибка соединения");
    } finally {
      setRolling(false); setBusy(false);
    }
  };

  const setHalf = () => setStake(v => Math.max(0.1, Math.round(v / 2 * 1000) / 1000));
  const setDouble = () => setStake(v => Math.min(balance, Math.round(v * 2 * 1000) / 1000));
  const setMax = () => setStake(Math.max(0.1, Math.floor(balance * 1000) / 1000));

  return (
    <div className="qg-game" style={S.root}>
      <style>{CSS}</style>
      <div className="qg-header" style={S.topline}>
        <div><div style={S.eyebrow}>TONYX ORIGINALS · SOLO</div><div style={S.heading}>{game === "dice" ? "DICE" : "ROULETTE"}</div></div>
        <div style={S.balance}><span>DEMO BALANCE</span><b>{balance.toFixed(2)}</b></div>
      </div>

      <div className="qg-stage" style={S.stage}>
        <div style={S.stageGlow} />
        {game === "dice" ? (
          <div className={`dice-cube ${rolling ? "is-rolling" : ""} ${result ? "has-result" : ""}`}>
            <div className="dice-face front">{result && !rolling ? result.roll : "⚄"}</div>
            <div className="dice-face back">⚅</div><div className="dice-face right">⚂</div>
            <div className="dice-face left">⚃</div><div className="dice-face top">⚀</div><div className="dice-face bottom">⚁</div>
          </div>
        ) : (
          <div className={`roulette-wrap ${rolling ? "is-spinning" : ""}`}>
            <div className="roulette-wheel" style={{background:`conic-gradient(${ROULETTE_ORDER.map((n,i)=>{const a=i*360/37;const color=n===0?"#16875d":ROULETTE_RED.has(n)?"#b52d42":"#1b2632";return `${color} ${a}deg ${a+360/37}deg`;}).join(",")})`}}><div className="wheel-center">T</div>{ROULETTE_ORDER.map((n,i)=>{const a=i*360/37;return <span key={n} style={{position:"absolute",left:"50%",top:"50%",transform:`translate(-50%,-50%) rotate(${a+180/37}deg) translateY(-66px) rotate(-${a+180/37}deg)`,fontSize:7,fontWeight:900,color:"#fff",textShadow:"0 1px 2px #000"}}>{n}</span>;})}{Array.from({length:37},(_,i)=><i key={i} style={{transform:`rotate(${i*360/37}deg) translateY(-1px)`}} />)}</div>
            <div className="roulette-pointer">▼</div>
            <div className="roulette-result">{result && !rolling ? result.number : "TONYX"}</div>
          </div>
        )}
        <div style={S.stageCaption}>{rolling ? (game === "dice" ? "КУБИК БРОСАЕТСЯ…" : "РУЛЕТКА ВРАЩАЕТСЯ…") : result ? (result.won ? "ПОБЕДА" : "РАУНД ЗАВЕРШЁН") : game === "dice" ? "ROLL THE DICE" : "EUROPEAN ROULETTE"}</div>
      </div>

      {game === "dice" ? (
        <div className="qg-panel" style={S.panel}>
          <div style={S.label}>ВЫБЕРИ НАПРАВЛЕНИЕ</div>
          <div style={S.twoCol}>
            <button type="button" disabled={busy} onClick={()=>setDirection("under")} style={{...S.choice,...(direction==="under"?S.choiceOn:{})}}>ROLL UNDER <small>Меньше</small></button>
            <button type="button" disabled={busy} onClick={()=>setDirection("over")} style={{...S.choice,...(direction==="over"?S.choiceOn:{})}}>ROLL OVER <small>Больше</small></button>
          </div>
          <div style={{...S.betHead,marginTop:17}}><span>ЦЕЛЕВОЕ ЧИСЛО</span><b>{threshold}</b></div>
          <input aria-label="Целевое число" type="range" min="1" max="98" value={threshold} disabled={busy} onChange={e=>setThreshold(Number(e.target.value))} style={S.range}/>
          <div style={S.rangeEnds}><span>1</span><span>98</span></div>
        </div>
      ) : (
        <div className="qg-panel" style={S.panel}>
          <div style={S.label}>ВЫБЕРИ СЕКТОР</div>
          <div style={S.rouletteChoices}>
            {(["red","black","green"] as const).map(c=><button key={c} type="button" disabled={busy} onClick={()=>setColor(c)} style={{...S.colorChoice,...(color===c?S.colorOn:{})}}><i style={{background:c==="red"?"#e4474e":c==="black"?"#252a34":"#20b879"}}/>{c==="red"?"КРАСНОЕ":c==="black"?"ЧЁРНОЕ":"ZERO"}</button>)}
          </div>
        </div>
      )}

      <div className="qg-panel" style={S.panel}>
        <div style={S.label}>РАЗМЕР СТАВКИ <span style={{color:"#f4c66a"}}>· ДЕМО-КРЕДИТЫ</span></div>
        <div style={S.betRow}>
          <button type="button" style={S.adjust} disabled={busy} onClick={setHalf}>½</button>
          <input type="number" min="0.1" step="0.1" value={stake} disabled={busy} onChange={e=>setStake(Math.max(0,Number(e.target.value)))} style={S.betInput}/>
          <button type="button" style={S.adjust} disabled={busy} onClick={setDouble}>2×</button>
        </div>
        <div style={S.presets}>{PRESETS.map(p=><button key={p} type="button" disabled={busy} onClick={()=>setStake(Math.min(balance,p))} style={{...S.preset,...(stake===p?S.presetOn:{})}}>{p}</button>)}<button type="button" disabled={busy} onClick={setMax} style={S.max}>MAX</button></div>
        <div style={S.meta}><span>Баланс: {balance.toFixed(2)}</span><span>Потенциальная выплата: <b>{potential.toFixed(2)}</b></span></div>
        <button type="button" disabled={busy||stake<0.1||stake>balance} onClick={play} style={{...S.play,opacity:busy||stake<0.1||stake>balance?0.5:1}}>{busy?"ИДЁТ ИГРА…":game==="dice"?"БРОСИТЬ КУБИК":"КРУТИТЬ РУЛЕТКУ"}</button>
        {error&&<div style={{color:"#ff737d",fontSize:12,marginTop:10,textAlign:"center"}}>{error}</div>}
      </div>

      {result&&!rolling&&<div style={{...S.result,borderColor:result.won?"#28b77a":"#e34c58"}}><div style={{fontSize:10,letterSpacing:".15em",color:"#9ca6b5"}}>РЕЗУЛЬТАТ РАУНДА</div><strong style={{color:result.won?"#4ee0a0":"#ff737d"}}>{result.won?"ПОБЕДА":"НЕ УГАДАЛ"}</strong><div style={{fontSize:13,color:"#d5dbe4"}}>Выплата: {Number(result.payout).toFixed(3)} демо-кредитов</div></div>}
      <div className="qg-history" style={S.history}><div style={S.label}>ПОСЛЕДНИЕ РАУНДЫ</div><div style={S.historyRow}>{history.length?history.map((h,i)=><span key={i} style={{...S.historyItem,color:h.won?"#4ee0a0":"#ff737d"}}>{game==="dice"?h.roll:h.number}</span>):<span style={{color:"#647184",fontSize:11}}>История появится после первого раунда</span>}</div></div>
      <div style={S.note}>ДЕМО-РЕЖИМ · КРЕДИТЫ НЕ ЯВЛЯЮТСЯ TON И НЕ ВЫВОДЯТСЯ</div>
    </div>
  );
}

const S: Record<string,CSSProperties> = {
 root:{color:"#edf1f7",fontFamily:"Inter,system-ui,sans-serif",padding:"4px 0 30px"},
 topline:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12},
 eyebrow:{fontSize:9,fontWeight:900,letterSpacing:".18em",color:"#9aa5b5"},
 heading:{fontSize:27,fontWeight:1000,letterSpacing:"-.04em",color:"#fff",marginTop:3},
 balance:{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,padding:"9px 12px",background:"#171d26",border:"1px solid #303b49",borderRadius:12},
 stage:{height:260,position:"relative",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",borderRadius:18,overflow:"hidden",background:"radial-gradient(ellipse at 50% 48%,#243b34 0%,#151d22 48%,#10151b 100%)",border:"1px solid #35483f",marginBottom:12},
 stageGlow:{position:"absolute",width:230,height:230,borderRadius:"50%",background:"radial-gradient(circle,#26b87825,transparent 68%)"},
 stageCaption:{position:"absolute",bottom:17,fontSize:10,fontWeight:900,letterSpacing:".2em",color:"#a9b9ad"},
 panel:{background:"linear-gradient(180deg,#1b222b,#151b23)",border:"1px solid #303b48",borderRadius:15,padding:14,marginBottom:10},
 label:{fontSize:10,fontWeight:900,letterSpacing:".13em",color:"#929eae",marginBottom:10},
 twoCol:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8},
 choice:{padding:"12px 8px",borderRadius:10,border:"1px solid #394452",background:"#202833",color:"#aab5c2",fontWeight:900,fontSize:11},
 choiceOn:{borderColor:"#22bd7b",background:"#173b2e",color:"#70e4ad",boxShadow:"0 0 18px #20b87920"},
 betHead:{display:"flex",justifyContent:"space-between",fontSize:10,fontWeight:900,color:"#9aa5b5"},
 range:{width:"100%",accentColor:"#24c17d",marginTop:12},
 rangeEnds:{display:"flex",justifyContent:"space-between",fontSize:9,color:"#667282"},
 rouletteChoices:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7},
 colorChoice:{padding:"13px 4px",borderRadius:10,border:"1px solid #394452",background:"#202833",color:"#c8d0da",fontSize:10,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",gap:5},
 colorOn:{borderColor:"#f4c66a",boxShadow:"0 0 0 1px #f4c66a44,0 0 16px #f4c66a20"},
 betRow:{display:"grid",gridTemplateColumns:"48px 1fr 48px",gap:8},
 adjust:{border:"1px solid #3a4654",borderRadius:10,background:"#242d38",color:"#edf1f7",fontWeight:900,fontSize:16},
 betInput:{minWidth:0,width:"100%",boxSizing:"border-box",padding:"12px",borderRadius:10,border:"1px solid #3b4856",background:"#10161d",color:"#fff",fontSize:16,fontWeight:900,textAlign:"center"},
 presets:{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:5,marginTop:8},
 preset:{padding:"9px 2px",border:"1px solid #35414e",borderRadius:8,background:"#242d37",color:"#aeb8c4",fontSize:10,fontWeight:800},
 presetOn:{borderColor:"#26c17e",color:"#73e4ad",background:"#183b2e"},
 max:{border:"1px solid #bd9652",borderRadius:8,background:"#4a3820",color:"#f4ce87",fontSize:10,fontWeight:900},
 meta:{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap",fontSize:10,color:"#8591a0",marginTop:12},
 play:{width:"100%",marginTop:13,padding:15,border:0,borderRadius:11,background:"linear-gradient(180deg,#38d995,#169d66)",color:"#06180f",fontSize:13,fontWeight:1000,letterSpacing:".1em",boxShadow:"0 5px 0 #0c6945,0 10px 22px #20b87925"},
 result:{padding:15,border:"1px solid",borderRadius:13,background:"#171e26",textAlign:"center",display:"grid",gap:6,marginBottom:12},
 history:{padding:"13px 2px"},
 historyRow:{display:"flex",gap:6,flexWrap:"wrap"},
 historyItem:{minWidth:32,padding:"7px 8px",textAlign:"center",borderRadius:7,background:"#1b232c",fontSize:11,fontWeight:900},
 note:{textAlign:"center",fontSize:8,fontWeight:800,letterSpacing:".1em",color:"#697584",paddingTop:8}
};
const CSS = `
@keyframes diceTumble {0%{transform:rotateX(0) rotateY(0) scale(.85)}25%{transform:rotateX(230deg) rotateY(150deg) scale(1.08)}55%{transform:rotateX(470deg) rotateY(340deg) scale(.95)}100%{transform:rotateX(720deg) rotateY(720deg) scale(1)}}
.dice-cube{width:112px;height:112px;position:relative;transform-style:preserve-3d;transform:rotateX(-22deg) rotateY(-35deg);z-index:2}
.dice-cube.is-rolling{animation:diceTumble .95s cubic-bezier(.18,.7,.3,1) infinite}
.dice-face{position:absolute;inset:0;display:grid;place-items:center;border-radius:18px;border:2px solid #f8d88a;background:linear-gradient(145deg,#fff1c4,#d9a84c 75%,#93652a);color:#34220b;font-size:46px;font-weight:1000;box-shadow:inset 0 2px 10px #fff8,0 10px 30px #0008}
.dice-face.front{transform:translateZ(56px)}.dice-face.back{transform:rotateY(180deg) translateZ(56px)}.dice-face.right{transform:rotateY(90deg) translateZ(56px)}.dice-face.left{transform:rotateY(-90deg) translateZ(56px)}.dice-face.top{transform:rotateX(90deg) translateZ(56px)}.dice-face.bottom{transform:rotateX(-90deg) translateZ(56px)}
.roulette-wrap{width:190px;height:190px;position:relative;display:grid;place-items:center;z-index:2}
.roulette-wheel{width:240px;height:240px;border-radius:50%;position:relative;border:8px solid #9db2c2;background:repeating-conic-gradient(#b52c38 0deg 10deg,#1d252e 10deg 20deg,#20855d 20deg 30deg);box-shadow:0 0 0 5px #263a48,0 12px 28px #0009,inset 0 0 0 3px #d5e3eb}.roulette-wheel i{height:108px!important}.roulette-wheel span{z-index:2}
.roulette-wheel i{position:absolute;left:calc(50% - 1px);top:50%;width:2px;height:76px;background:#f4d58b;transform-origin:top center;opacity:.8}
.wheel-center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle,#f8df9e,#956b32);border:4px solid #6c4b20;color:#35230d;font-weight:1000;font-size:23px;z-index:3}
.roulette-pointer{position:absolute;top:-3px;z-index:4;color:#f8d88a;text-shadow:0 2px 5px #000;font-size:22px}
.roulette-result{position:absolute;bottom:-2px;z-index:4;background:#111a20;border:1px solid #e2bd73;border-radius:20px;padding:4px 13px;color:#f7d58d;font-weight:900;font-size:13px}
.roulette-wrap.is-spinning .roulette-wheel{animation:wheelSpin 1.45s cubic-bezier(.15,.75,.2,1) infinite}
@keyframes wheelSpin{to{transform:rotate(1440deg)}}

/* TONYX Originals — Dice & European Roulette */
.qg-game{width:100%;max-width:1120px!important;margin:0 auto!important;padding:10px 0 32px!important;display:grid;grid-template-columns:minmax(0,1fr) 350px;grid-template-rows:auto auto auto auto;gap:14px 18px;align-items:start;color:#edf2f7!important}
.qg-header{grid-column:1/-1;border-bottom:1px solid #29333e;padding:0 2px 12px!important;margin:0!important}
.qg-header>div:first-child>div:first-child{color:#7d91a3!important;letter-spacing:.18em!important}
.qg-header>div:first-child>div:last-child{font-size:24px!important;letter-spacing:-.04em!important;color:#f5f8fb!important}
.qg-header>div:last-child{background:#141d27!important;border:1px solid #2c3a47!important;border-radius:10px!important}
.qg-stage{grid-column:2;grid-row:2/span 2;min-height:470px!important;border-radius:16px!important;border:1px solid #293a48!important;background:radial-gradient(ellipse at 50% 44%,#142c3a 0%,#0c151e 68%)!important;box-shadow:0 18px 48px #0008!important;overflow:hidden}
.qg-stage>div:last-child{color:#9bb0c0!important;letter-spacing:.16em!important}
.qg-panel{grid-column:1;width:100%;box-sizing:border-box;background:linear-gradient(180deg,#151f2a,#101720)!important;border:1px solid #293947!important;border-radius:13px!important;padding:16px!important;box-shadow:0 12px 32px #0005!important}
.qg-game>.qg-panel:nth-of-type(3){grid-row:2}
.qg-game>.qg-panel:nth-of-type(4){grid-row:3}
.qg-game>.qg-result{grid-column:2;grid-row:4}
.qg-game>.qg-history{grid-column:1/-1;grid-row:5}
.qg-panel button{border-radius:8px!important}
.qg-panel input:not([type=range]){background:#0a1119!important;border:1px solid #34495a!important;border-radius:8px!important;color:#f3f7fb!important}
.qg-panel button[style*="linear-gradient"]{box-shadow:none!important}
.qg-panel button[style*="background: rgb"]{filter:saturate(.85)}
.qg-panel button[style*="background: linear-gradient"]{background:linear-gradient(180deg,#168fba,#08769d)!important;color:white!important}
.qg-panel button[style*="border-color: rgb"]{border-radius:8px!important}
.qg-game .dice-cube{filter:drop-shadow(0 18px 28px #0008)}
.qg-game .dice-face{background:linear-gradient(145deg,#e9f7ff,#8bbdd3)!important;color:#102a39!important;border:2px solid #c7f0ff!important;box-shadow:inset 0 2px 5px #fff8,0 4px 12px #0007!important}
.qg-game .roulette-wheel{border:7px solid #9db2c2!important;background:repeating-conic-gradient(#b52f43 0deg 10deg,#172330 10deg 20deg,#148c75 20deg 30deg)!important;box-shadow:0 0 0 5px #263a48,0 16px 32px #0009,inset 0 0 0 3px #d5e3eb!important}
.qg-game .wheel-center{background:radial-gradient(circle,#e6f4fb,#63879c)!important;border-color:#314d5d!important;color:#102a39!important}
.qg-history{grid-column:1/-1;background:#121a23!important;border:1px solid #293743!important;border-radius:12px!important;padding:14px!important}
.qg-history>div:first-child{color:#8ea2b4!important}
.qg-game .qg-panel button[disabled]{opacity:.45}
@media(max-width:760px){.qg-game{display:flex!important;flex-direction:column!important;gap:10px!important;padding:6px 0 24px!important}.qg-header,.qg-stage,.qg-panel,.qg-history{width:100%;box-sizing:border-box}.qg-stage{min-height:320px!important}.qg-panel{padding:13px!important}}

`;
