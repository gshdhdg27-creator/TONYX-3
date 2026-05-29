import { useState, useEffect, useCallback } from "react";
import { useGetMiniMarketPool, useGetUserProfile, getGetUserProfileQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTelegram, haptic, hapticNotify } from "@/lib/telegram";

/* ─── Types ─── */
type Category = "start" | "pro" | "elite";
type Tab = "all" | Category;

interface Order {
  id: number; sellerId: string; sellerUsername: string | null;
  amount: number; pricePerCoin: number; totalTon: number;
  category: Category; bonusPct: number; bonusCoins: number; returnTon: number;
  status: string; buyerId: string | null; createdAt: string;
}

const CAT_CONFIG: Record<Category, { label: string; color: string; bg: string; range: string; bonus: string }> = {
  start: { label: "START",  color: "#60a5fa", bg: "rgba(30,64,175,0.15)", range: "1–10 TON",   bonus: "+1%" },
  pro:   { label: "PRO",    color: "#a78bfa", bg: "rgba(109,40,217,0.15)", range: "10–25 TON", bonus: "+2%" },
  elite: { label: "ELITE",  color: "#fbbf24", bg: "rgba(180,83,9,0.15)",  range: "25+ TON",   bonus: "+3%" },
};

/* ─── Toast ─── */
function Toast({ msg, type }: { msg: string; type: "success"|"error"|"info" }) {
  const bg = type==="success"?"rgba(22,163,74,0.95)":type==="error"?"rgba(220,38,38,0.95)":"rgba(30,64,175,0.95)";
  return <div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",background:bg,color:"#fff",padding:"12px 20px",borderRadius:12,fontSize:14,fontWeight:600,zIndex:9999,maxWidth:"calc(100% - 32px)",boxShadow:"0 8px 28px rgba(0,0,0,0.5)"}}>{msg}</div>;
}

/* ─── Category badge ─── */
function CatBadge({ cat }: { cat: Category }) {
  const c = CAT_CONFIG[cat];
  return <div style={{display:"inline-block",padding:"2px 8px",borderRadius:6,background:c.bg,color:c.color,fontSize:9,fontWeight:800,letterSpacing:"0.12em",border:`1px solid ${c.color}30`}}>{c.label}</div>;
}

/* ─── Avatar ─── */
function Avatar({ name, size=40 }: { name:string; size?:number }) {
  const initials=(name??"?").slice(0,2).toUpperCase();
  const colors=["#1d4ed8","#dc2626","#15803d","#b45309","#6d28d9","#0e7490","#be185d"];
  const idx=name.charCodeAt(0)%colors.length;
  return <div style={{width:size,height:size,borderRadius:"50%",background:colors[idx],display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.35,fontWeight:700,color:"#fff",flexShrink:0,border:"2px solid rgba(255,255,255,0.1)"}}>{initials}</div>;
}

/* ─── Order card ─── */
function OrderCard({ order, isMine, onBuy, onCancel, buying, cancelling }: {
  order: Order; isMine: boolean;
  onBuy:(id:number)=>void; onCancel:(id:number)=>void;
  buying:boolean; cancelling:boolean;
}) {
  const sellerName = order.sellerUsername ?? order.sellerId.slice(-6);
  const cc = CAT_CONFIG[order.category] ?? CAT_CONFIG.start;
  const statusColor = order.status==="open"?"#22c55e":order.status==="sold"?"#60a5fa":"#94a3b8";

  return (
    <div style={{background:"rgba(15,23,42,0.95)",border:"1px solid rgba(30,58,143,0.3)",borderRadius:16,padding:14,marginBottom:10}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <Avatar name={sellerName} size={38}/>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:"#e2e8f0"}}>@{sellerName}</div>
          <div style={{display:"flex",gap:6,alignItems:"center",marginTop:3}}>
            <CatBadge cat={order.category}/>
            <span style={{fontSize:10,color:"#475569"}}>· {cc.range}</span>
          </div>
        </div>
        <div style={{fontSize:9,fontWeight:800,letterSpacing:"0.12em",color:statusColor,background:`${statusColor}18`,padding:"3px 8px",borderRadius:6,border:`1px solid ${statusColor}40`}}>
          {order.status==="open"?"LIVE":order.status==="sold"?"ПРОДАН":"ОТМЕНЁН"}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        <div style={{background:"rgba(30,45,69,0.6)",borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:9,color:"#475569",fontWeight:700,letterSpacing:"0.1em",marginBottom:4}}>ПЛАТИТЕ</div>
          <div style={{fontSize:16,fontWeight:800,color:"#f1f5f9"}}>{order.totalTon.toFixed(2)}</div>
          <div style={{fontSize:10,color:"#64748b"}}>TON</div>
        </div>
        <div style={{background:"rgba(30,45,69,0.6)",borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:9,color:"#475569",fontWeight:700,letterSpacing:"0.1em",marginBottom:4}}>ПОЛУЧАЕТЕ</div>
          <div style={{fontSize:16,fontWeight:800,color:"#f1f5f9"}}>{order.bonusCoins.toLocaleString()}</div>
          <div style={{fontSize:10,color:"#64748b"}}>TONYX</div>
        </div>
        <div style={{background:`${cc.color}10`,border:`1px solid ${cc.color}30`,borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:9,color:"#475569",fontWeight:700,letterSpacing:"0.1em",marginBottom:4}}>БОНУС</div>
          <div style={{fontSize:16,fontWeight:800,color:"#4ade80"}}>{cc.bonus}</div>
          <div style={{fontSize:10,color:"#16a34a"}}>к монетам</div>
        </div>
        <div style={{background:"rgba(30,45,69,0.6)",borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:9,color:"#475569",fontWeight:700,letterSpacing:"0.1em",marginBottom:4}}>ВОЗВРАТ</div>
          <div style={{fontSize:16,fontWeight:800,color:"#67e8f9"}}>{order.returnTon.toFixed(2)}</div>
          <div style={{fontSize:10,color:"#64748b"}}>TON</div>
        </div>
      </div>

      {order.status==="open" && (
        isMine ? (
          <button onClick={()=>onCancel(order.id)} disabled={cancelling} style={{width:"100%",padding:"12px 0",borderRadius:10,border:"1px solid rgba(248,113,113,0.3)",background:"rgba(220,38,38,0.08)",color:"#f87171",fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>
            {cancelling?"Отмена...":"Отозвать ордер"}
          </button>
        ):(
          <button onClick={()=>onBuy(order.id)} disabled={buying} style={{width:"100%",padding:"12px 0",borderRadius:10,border:"none",background:"linear-gradient(135deg,#1d4ed8,#2563eb)",color:"#fff",fontSize:14,fontWeight:800,fontFamily:"inherit",cursor:"pointer",boxShadow:"0 0 20px rgba(37,99,235,0.35)"}}>
            {buying?"⏳ Обработка...":`Выкупить · ${order.totalTon.toFixed(2)} TON`}
          </button>
        )
      )}
    </div>
  );
}

/* ─── Create order modal ─── */
function CreateOrderModal({ onClose, telegramId, tonyxBalance, tonBalance, onCreated }: {
  onClose:()=>void; telegramId:string; tonyxBalance:number; tonBalance:number; onCreated:()=>void;
}) {
  const [amount, setAmount]   = useState("100");
  const [price, setPrice]     = useState("0.01");
  const [loading, setLoading] = useState(false);
  const [toast, setToast]     = useState<{msg:string;type:"success"|"error"|"info"}|null>(null);

  const flash=(msg:string,type:"success"|"error"|"info")=>{setToast({msg,type});setTimeout(()=>setToast(null),2500);};

  const amtNum   = parseInt(amount)||0;
  const priceNum = parseFloat(price)||0;
  const totalTon = parseFloat((amtNum*priceNum).toFixed(6));

  let category:Category|null=null;
  if(totalTon>=1&&totalTon<=10)       category="start";
  else if(totalTon>10&&totalTon<=25)  category="pro";
  else if(totalTon>25)                category="elite";

  const bonusPct  = category ? (category==="start"?1:category==="pro"?2:3) : 0;
  const bonusCoins = Math.floor(amtNum*(1+bonusPct/100));
  const returnTon  = parseFloat((bonusCoins*priceNum).toFixed(6));

  const submit = async ()=>{
    if(!category){flash("Итоговая сумма должна быть ≥ 1 TON","error");return;}
    if(amtNum>tonyxBalance){flash("Недостаточно TONYX","error");return;}
    setLoading(true);
    try{
      const r=await fetch("/api/mini/market/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({telegramId,amount:amtNum,pricePerCoin:priceNum})});
      const d=await r.json();
      if(!r.ok){flash(d.error||"Ошибка","error");}
      else{hapticNotify("success");onCreated();onClose();}
    }catch{flash("Ошибка сети","error");}
    finally{setLoading(false);}
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"flex-end",zIndex:500}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      {toast&&<Toast msg={toast.msg} type={toast.type}/>}
      <div style={{width:"100%",background:"#0f172a",border:"1px solid rgba(30,58,143,0.4)",borderTopLeftRadius:24,borderTopRightRadius:24,padding:"20px 16px 32px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:17,fontWeight:800,color:"#f1f5f9"}}>Создать предложение</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#475569",fontSize:22,cursor:"pointer"}}>×</button>
        </div>

        <div style={{display:"flex",gap:8,marginBottom:12,fontSize:11,color:"#334155"}}>
          <span>TONYX: <b style={{color:"#60a5fa"}}>{tonyxBalance.toLocaleString()}</b></span>
          <span>·</span>
          <span>TON: <b style={{color:"#fbbf24"}}>{tonBalance.toFixed(2)}</b></span>
        </div>

        {/* Category selector display */}
        <div style={{display:"flex",gap:6,marginBottom:12}}>
          {(["start","pro","elite"] as Category[]).map(c=>{
            const cc=CAT_CONFIG[c];
            const active=category===c;
            return(
              <div key={c} style={{flex:1,padding:"8px 4px",borderRadius:10,border:`1px solid ${active?cc.color:cc.color+"30"}`,background:active?cc.bg:"transparent",textAlign:"center",transition:"all 0.2s"}}>
                <div style={{fontSize:10,fontWeight:800,color:active?cc.color:"#334155",letterSpacing:"0.1em"}}>{cc.label}</div>
                <div style={{fontSize:9,color:"#475569",marginTop:2}}>{cc.range}</div>
                <div style={{fontSize:11,fontWeight:800,color:"#4ade80",marginTop:2}}>{cc.bonus}</div>
              </div>
            );
          })}
        </div>

        <div style={{fontSize:11,color:"#475569",fontWeight:700,marginBottom:5,letterSpacing:"0.1em"}}>КОЛ-ВО TONYX</div>
        <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
          {[100,500,1000,5000].map(v=>(
            <button key={v} onClick={()=>setAmount(String(v))} style={{padding:"6px 12px",borderRadius:8,border:"none",fontFamily:"inherit",background:amtNum===v?"linear-gradient(135deg,#1e3a8a,#2563eb)":"rgba(30,45,69,0.8)",color:amtNum===v?"#fff":"#64748b",fontSize:12,fontWeight:700,cursor:"pointer"}}>{v.toLocaleString()}</button>
          ))}
        </div>
        <input value={amount} onChange={e=>setAmount(e.target.value)} type="number" placeholder="Кол-во TONYX"
          style={{width:"100%",background:"rgba(30,45,69,0.6)",border:"1px solid rgba(30,58,143,0.4)",borderRadius:10,padding:"11px 14px",color:"#f1f5f9",fontFamily:"inherit",fontSize:14,outline:"none",boxSizing:"border-box",marginBottom:12}}/>

        <div style={{fontSize:11,color:"#475569",fontWeight:700,marginBottom:5,letterSpacing:"0.1em"}}>ЦЕНА ЗА МОНЕТУ (TON)</div>
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          {[0.001,0.01,0.05,0.1].map(v=>(
            <button key={v} onClick={()=>setPrice(String(v))} style={{flex:1,padding:"6px 0",borderRadius:8,border:"none",fontFamily:"inherit",background:priceNum===v?"linear-gradient(135deg,#1e3a8a,#2563eb)":"rgba(30,45,69,0.8)",color:priceNum===v?"#fff":"#64748b",fontSize:11,fontWeight:700,cursor:"pointer"}}>{v}</button>
          ))}
        </div>
        <input value={price} onChange={e=>setPrice(e.target.value)} type="number" step="0.001" placeholder="TON за TONYX"
          style={{width:"100%",background:"rgba(30,45,69,0.6)",border:"1px solid rgba(30,58,143,0.4)",borderRadius:10,padding:"11px 14px",color:"#f1f5f9",fontFamily:"inherit",fontSize:14,outline:"none",boxSizing:"border-box",marginBottom:12}}/>

        {/* Preview */}
        {category&&amtNum>0&&priceNum>0&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
            {[
              {label:"ИТОГО TON",val:`${totalTon} TON`,color:"#f1f5f9"},
              {label:`БОНУС ${CAT_CONFIG[category].bonus}`,val:`${bonusCoins.toLocaleString()} TONYX`,color:"#4ade80"},
              {label:"КАТЕГОРИЯ",val:CAT_CONFIG[category].label,color:CAT_CONFIG[category].color},
              {label:"ВОЗВРАТ",val:`${returnTon} TON`,color:"#67e8f9"},
            ].map(({label,val,color})=>(
              <div key={label} style={{background:"rgba(30,45,69,0.5)",borderRadius:10,padding:"8px 10px"}}>
                <div style={{fontSize:8,color:"#334155",fontWeight:700,letterSpacing:"0.1em",marginBottom:2}}>{label}</div>
                <div style={{fontSize:13,fontWeight:800,color}}>{val}</div>
              </div>
            ))}
          </div>
        )}

        {!category&&amtNum>0&&priceNum>0&&(
          <div style={{background:"rgba(220,38,38,0.1)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:10,padding:"10px 12px",marginBottom:12,fontSize:12,color:"#f87171"}}>
            ⚠️ Итоговая сумма {totalTon} TON — ниже минимума (1 TON для START)
          </div>
        )}

        <button onClick={()=>{haptic("medium");submit();}} disabled={loading||!category||amtNum<=0||amtNum>tonyxBalance}
          style={{width:"100%",padding:"16px 0",borderRadius:14,border:"none",fontFamily:"inherit",background:(!category||amtNum>tonyxBalance)?"rgba(30,58,143,0.15)":"linear-gradient(135deg,#1d4ed8,#2563eb)",color:(!category||amtNum>tonyxBalance)?"#334155":"#fff",fontSize:16,fontWeight:800,cursor:(!category||amtNum>tonyxBalance)?"not-allowed":"pointer",boxShadow:category&&amtNum<=tonyxBalance?"0 0 28px rgba(37,99,235,0.4)":"none"}}>
          {loading?"⏳ Размещаем...":"Создать предложение"}
        </button>
        {amtNum>tonyxBalance&&<div style={{fontSize:11,color:"#f87171",textAlign:"center",marginTop:8}}>Недостаточно TONYX</div>}
        <div style={{fontSize:10,color:"#1e3a8a",textAlign:"center",marginTop:8}}>Лимит: 3 ордера в каждой категории в сутки</div>
      </div>
    </div>
  );
}

/* ─── Locked market stub ─── */
function LockedMarket({ sold, total }: { sold:number; total:number }) {
  const pct = Math.min(100,(sold/total)*100);
  return (
    <div style={{padding:"0 16px 90px"}}>
      <div style={{textAlign:"center",marginBottom:24,marginTop:8}}>
        <div style={{fontSize:22,fontWeight:900,color:"#f1f5f9",marginBottom:4}}>🏪 P2P Рынок</div>
        <div style={{fontSize:12,color:"#475569"}}>Откроется когда будет продан системный пул</div>
      </div>

      <div style={{background:"rgba(15,23,42,0.95)",border:"1px solid rgba(30,58,143,0.35)",borderRadius:20,padding:20,marginBottom:16,textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:8}}>🔒</div>
        <div style={{fontSize:16,fontWeight:800,color:"#f1f5f9",marginBottom:4}}>Рынок заблокирован</div>
        <div style={{fontSize:12,color:"#475569",lineHeight:1.5,marginBottom:16}}>
          P2P-торговля откроется после продажи<br/>
          <b style={{color:"#60a5fa"}}>1 000 000 TONYX</b> из системного пула
        </div>

        <div style={{marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{fontSize:11,color:"#475569",fontWeight:700}}>ПРОГРЕСС ПУЛА</span>
            <span style={{fontSize:11,color:"#60a5fa",fontWeight:700}}>{pct.toFixed(2)}%</span>
          </div>
          <div style={{height:12,borderRadius:6,background:"rgba(30,45,69,0.8)",overflow:"hidden"}}>
            <div style={{height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#1d4ed8,#22d3ee)",borderRadius:6,transition:"width 0.8s"}}/>
          </div>
        </div>

        <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:18,fontWeight:900,color:"#60a5fa"}}>{sold.toLocaleString()}</div>
            <div style={{color:"#334155"}}>продано</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:18,fontWeight:900,color:"#f1f5f9"}}>{(total-sold).toLocaleString()}</div>
            <div style={{color:"#334155"}}>осталось</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:18,fontWeight:900,color:"#fbbf24"}}>{total.toLocaleString()}</div>
            <div style={{color:"#334155"}}>всего</div>
          </div>
        </div>
      </div>

      {/* Category preview cards */}
      <div style={{fontSize:12,color:"#475569",fontWeight:700,marginBottom:10,letterSpacing:"0.1em"}}>КАТЕГОРИИ ПОСЛЕ ЗАПУСКА</div>
      {(["start","pro","elite"] as Category[]).map(c=>{
        const cc=CAT_CONFIG[c];
        return(
          <div key={c} style={{display:"flex",alignItems:"center",gap:12,background:"rgba(15,23,42,0.9)",border:`1px solid ${cc.color}20`,borderRadius:14,padding:"12px 14px",marginBottom:8,opacity:0.7}}>
            <div style={{width:44,height:44,borderRadius:12,background:cc.bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <span style={{fontSize:20}}>{c==="start"?"🟢":c==="pro"?"🔵":"🔥"}</span>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:800,color:cc.color}}>{cc.label}</div>
              <div style={{fontSize:11,color:"#475569"}}>{cc.range}</div>
            </div>
            <div style={{fontSize:20,fontWeight:900,color:"#4ade80"}}>{cc.bonus}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════
   MAIN PAGE
═══════════════════════════════ */
export default function MarketPage() {
  const { telegramId } = useTelegram();
  const qc = useQueryClient();
  const [tab, setTab]   = useState<Tab>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<{msg:string;type:"success"|"error"|"info"}|null>(null);
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [buyingId, setBuyingId]       = useState<number|null>(null);
  const [cancellingId, setCancellingId] = useState<number|null>(null);

  const flash=(msg:string,type:"success"|"error"|"info")=>{setToast({msg,type});setTimeout(()=>setToast(null),3000);};

  const {data:pool,refetch:refetchPool} = useGetMiniMarketPool({query:{refetchInterval:10000}});
  const {data:profile,refetch:refetchProfile} = useGetUserProfile(telegramId??"",(
    {query:{enabled:!!telegramId,refetchInterval:8000}} as Parameters<typeof useGetUserProfile>[1]
  ));

  const isMarketActive = (pool as {isMarketActive?:boolean}|undefined)?.isMarketActive === true;

  const fetchOrders = useCallback(async (cat:Tab)=>{
    if(!isMarketActive)return;
    setOrdersLoading(true);
    try{
      const url=cat==="all"?"/api/mini/market/orders":`/api/mini/market/orders?category=${cat}`;
      const r=await fetch(url);
      if(r.ok){const d=await r.json();setAllOrders(d.orders??[]);}
    }catch{}
    finally{setOrdersLoading(false);}
  },[isMarketActive]);

  const fetchMyOrders = useCallback(async()=>{
    if(!telegramId)return;
    try{
      const r=await fetch(`/api/mini/market/orders/mine?telegramId=${telegramId}`);
      if(r.ok){const d=await r.json();setMyOrders(d.orders??[]);}
    }catch{}
  },[telegramId]);

  const refreshAll=()=>{
    fetchOrders(tab);fetchMyOrders();refetchPool();refetchProfile();
  };

  useEffect(()=>{if(isMarketActive)fetchOrders(tab);},[tab,isMarketActive]);
  useEffect(()=>{fetchMyOrders();},[telegramId]);
  useEffect(()=>{if(isMarketActive){const t=setInterval(()=>fetchOrders(tab),6000);return()=>clearInterval(t);}},[tab,isMarketActive]);

  const handleBuy=async(id:number)=>{
    if(!telegramId)return;
    haptic("medium");setBuyingId(id);
    try{
      const r=await fetch(`/api/mini/market/orders/${id}/buy`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({telegramId})});
      const d=await r.json();
      if(!r.ok){flash(d.error||"Ошибка","error");}
      else{hapticNotify("success");flash(`🎉 +${d.bonusCoins?.toLocaleString()} TONYX (${d.bonusPct}% бонус)!`,"success");refreshAll();}
    }catch{flash("Ошибка сети","error");}
    finally{setBuyingId(null);}
  };

  const handleCancel=async(id:number)=>{
    if(!telegramId)return;
    haptic("medium");setCancellingId(id);
    try{
      const r=await fetch(`/api/mini/market/orders/${id}`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({telegramId})});
      const d=await r.json();
      if(!r.ok){flash(d.error||"Ошибка","error");}
      else{hapticNotify("success");flash("Ордер отозван, TONYX возвращены","info");refreshAll();}
    }catch{flash("Ошибка сети","error");}
    finally{setCancellingId(null);}
  };

  const tonyxBalance=(profile as {tonyxCoins?:number}|undefined)?.tonyxCoins??0;
  const tonBalance=Number((profile as {ton?:string|number}|undefined)?.ton??0);
  const poolSold  = pool?.sold??0;
  const poolTotal = pool?.total??1_000_000;

  if(!isMarketActive){
    return <LockedMarket sold={poolSold} total={poolTotal}/>;
  }

  const displayOrders = tab==="mine" ? myOrders : allOrders;
  const activeOrders  = displayOrders.filter(o=>tab==="mine"||o.status==="open");

  return (
    <div style={{padding:"16px 16px 100px"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type}/>}
      {showCreate&&telegramId&&(
        <CreateOrderModal telegramId={telegramId} tonyxBalance={tonyxBalance} tonBalance={tonBalance} onClose={()=>setShowCreate(false)} onCreated={refreshAll}/>
      )}

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div>
          <div style={{fontSize:21,fontWeight:900,color:"#f1f5f9"}}>🏪 P2P Рынок</div>
          <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:"#22c55e",boxShadow:"0 0 6px #22c55e"}}/>
            <span style={{fontSize:11,color:"#22c55e",fontWeight:700,letterSpacing:"0.1em"}}>LIVE · ОТКРЫТ</span>
          </div>
        </div>
        <div style={{background:"rgba(15,23,42,0.95)",border:"1px solid rgba(30,58,143,0.35)",borderRadius:12,padding:"8px 12px",textAlign:"right"}}>
          <div style={{fontSize:12,fontWeight:900,color:"#60a5fa"}}>{tonyxBalance.toLocaleString()} TONYX</div>
          <div style={{fontSize:11,fontWeight:800,color:"#fbbf24"}}>{tonBalance.toFixed(2)} TON</div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {[
          {label:"ОРДЕРОВ",val:String(allOrders.length),sub:"активных"},
          {label:"ПРИБЫЛЬ",val:"1-3%",sub:"по категориям"},
          {label:"ЛИМИТ",val:"3/сут",sub:"по категории"},
        ].map(({label,val,sub})=>(
          <div key={label} style={{flex:1,background:"rgba(15,23,42,0.95)",border:"1px solid rgba(30,58,143,0.3)",borderRadius:12,padding:"8px 6px",textAlign:"center"}}>
            <div style={{fontSize:8,color:"#334155",fontWeight:700,letterSpacing:"0.1em",marginBottom:2}}>{label}</div>
            <div style={{fontSize:15,fontWeight:900,color:"#f1f5f9"}}>{val}</div>
            <div style={{fontSize:9,color:"#475569",marginTop:1}}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs: ALL + categories + MINE */}
      <div style={{display:"flex",gap:4,background:"rgba(15,23,42,0.95)",border:"1px solid rgba(30,58,143,0.3)",borderRadius:14,padding:4,marginBottom:12,overflowX:"auto"}}>
        {(["all","start","pro","elite","mine"] as (Tab|"mine")[]).map(t=>{
          const cc = t!=="all"&&t!=="mine" ? CAT_CONFIG[t as Category] : null;
          const active=tab===t;
          return(
            <button key={t} onClick={()=>{haptic("light");setTab(t as Tab);}} style={{flex:"none",padding:"9px 10px",borderRadius:10,border:"none",fontFamily:"inherit",background:active?cc?cc.bg:"linear-gradient(135deg,#1e3a8a,#2563eb)":"transparent",color:active?cc?cc.color:"#fff":"#475569",fontSize:11,fontWeight:800,cursor:"pointer",transition:"all 0.2s",whiteSpace:"nowrap"}}>
              {t==="all"?"Все":t==="mine"?"Мои":cc?.label}
            </button>
          );
        })}
      </div>

      {/* Orders */}
      {ordersLoading ? (
        <div style={{textAlign:"center",color:"#334155",padding:"32px 0"}}>Загрузка...</div>
      ) : activeOrders.length===0 ? (
        <div style={{background:"rgba(15,23,42,0.9)",border:"1px solid rgba(30,58,143,0.2)",borderRadius:14,padding:"36px 16px",textAlign:"center"}}>
          <div style={{fontSize:28,marginBottom:8}}>{tab==="mine"?"📦":"📋"}</div>
          <div style={{fontSize:14,color:"#475569"}}>{tab==="mine"?"Вы ещё не создавали ордеров":"Нет активных ордеров"}</div>
          {tab!=="mine"&&<div style={{fontSize:12,color:"#334155",marginTop:4}}>Будь первым — создай предложение!</div>}
        </div>
      ) : (
        activeOrders.map(order=>(
          <OrderCard key={order.id} order={order} isMine={order.sellerId===telegramId}
            onBuy={handleBuy} onCancel={handleCancel}
            buying={buyingId===order.id} cancelling={cancellingId===order.id}/>
        ))
      )}

      {/* Sticky CTA */}
      {telegramId&&(
        <div style={{position:"fixed",bottom:68,left:0,right:0,padding:"0 16px",zIndex:50}}>
          <button onClick={()=>{haptic("medium");setShowCreate(true);}} style={{width:"100%",padding:"16px 0",borderRadius:14,border:"none",fontFamily:"inherit",background:"linear-gradient(135deg,#1d4ed8,#2563eb)",color:"#fff",fontSize:16,fontWeight:800,cursor:"pointer",boxShadow:"0 0 32px rgba(37,99,235,0.5)"}}>
            + Создать предложение
          </button>
        </div>
      )}
    </div>
  );
}
