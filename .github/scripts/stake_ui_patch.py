from pathlib import Path
import urllib.request

def patch_spin(p: Path):
    t = p.read_text()
    old = '''                {/* stake items row */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, paddingLeft: 2 }}>
                  {nfts.length > 0 ? nfts.map((n) => (
                    <div key={n.inventoryId} style={{
                      width: 48, height: 48, borderRadius: 12, overflow: "hidden", position: "relative",
                      background: "rgba(59,130,246,0.2)", border: "1px solid rgba(59,130,246,0.35)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {n.imageUrl
                        ? <img src={n.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <span style={{ fontSize: 18 }}>🎁</span>}
                      <span style={{
                        position: "absolute", left: 4, bottom: 3, fontSize: 10, fontWeight: 900, color: "#fff",
                        textShadow: "0 1px 2px #000",
                      }}>{n.valueTon}</span>
                    </div>
                  )) : (
                    <div style={{
                      width: 48, height: 48, borderRadius: 12,
                      background: "linear-gradient(145deg,#3b82f6,#1d4ed8)",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      border: "1px solid rgba(96,165,250,0.5)",
                    }}>
                      <span style={{ fontSize: 16 }}>💎</span>
                      <span style={{ fontSize: 10, fontWeight: 900, color: "#fff" }}>{Number(p.stake).toFixed(0)}</span>
                    </div>
                  )}
                </div>'''
    new = '''                {/* stake chips: pure TON + NFTs */}
                {(() => {
                  const nftSum = nfts.reduce((s, n) => s + (Number(n.valueTon) || 0), 0);
                  const pureTon = Math.max(0, Math.round((Number(p.stake) - nftSum) * 1000) / 1000);
                  return (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, paddingLeft: 2 }}>
                      {pureTon > 1e-9 && (
                        <div style={{
                          width: 48, height: 48, borderRadius: 12, position: "relative",
                          background: "linear-gradient(145deg,#3b82f6,#1d4ed8)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          border: "1px solid rgba(96,165,250,0.55)",
                          boxShadow: "0 4px 12px rgba(37,99,235,0.25)",
                        }}>
                          <span style={{ fontSize: 20, lineHeight: 1 }}>💎</span>
                          <span style={{
                            position: "absolute", left: 4, bottom: 3, fontSize: 10, fontWeight: 900, color: "#fff",
                            textShadow: "0 1px 2px #000",
                          }}>{pureTon % 1 === 0 ? pureTon.toFixed(0) : pureTon.toFixed(2)}</span>
                        </div>
                      )}
                      {nfts.map((n) => (
                        <div key={n.inventoryId} style={{
                          width: 48, height: 48, borderRadius: 12, overflow: "hidden", position: "relative",
                          background: "rgba(59,130,246,0.2)", border: "1px solid rgba(59,130,246,0.35)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {n.imageUrl
                            ? <img src={n.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : <span style={{ fontSize: 18 }}>🎁</span>}
                          <span style={{
                            position: "absolute", left: 4, bottom: 3, fontSize: 10, fontWeight: 900, color: "#fff",
                            textShadow: "0 1px 2px #000",
                          }}>{n.valueTon}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}'''
    if old not in t:
        if "stake chips: pure TON" in t:
            print("spin list already")
        else:
            raise SystemExit("spin list block not found")
    else:
        t = t.replace(old, new, 1)
        print("spin list ok")

    old_d = '''            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {(stakeDetail.nftStakes && stakeDetail.nftStakes.length > 0) ? stakeDetail.nftStakes.map((n) => (
                <div key={n.inventoryId} style={{
                  width: 72, height: 72, borderRadius: 14, overflow: "hidden", position: "relative",
                  background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {n.imageUrl
                    ? <img src={n.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <span style={{ fontSize: 24 }}>🎁</span>}
                  <span style={{
                    position: "absolute", left: 6, bottom: 4, fontSize: 11, fontWeight: 900, color: "#fff",
                    textShadow: "0 1px 3px #000",
                  }}>{n.valueTon}💎</span>
                </div>
              )) : (
                <div style={{
                  width: 72, height: 72, borderRadius: 14,
                  background: "linear-gradient(145deg,#3b82f6,#1d4ed8)",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  border: "1px solid rgba(96,165,250,0.45)",
                }}>
                  <span style={{ fontSize: 26 }}>💎</span>
                  <span style={{ fontSize: 12, fontWeight: 900, color: "#fff", marginTop: 2 }}>{Number(stakeDetail.stake).toFixed(0)}</span>
                </div>
              )}
            </div>'''
    new_d = '''            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {(() => {
                const nfts = stakeDetail.nftStakes ?? [];
                const nftSum = nfts.reduce((s, n) => s + (Number(n.valueTon) || 0), 0);
                const pureTon = Math.max(0, Math.round((Number(stakeDetail.stake) - nftSum) * 1000) / 1000);
                return (
                  <>
                    {pureTon > 1e-9 && (
                      <div style={{
                        width: 72, height: 72, borderRadius: 14, position: "relative",
                        background: "linear-gradient(145deg,#3b82f6,#1d4ed8)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: "1px solid rgba(96,165,250,0.45)",
                      }}>
                        <span style={{ fontSize: 28 }}>💎</span>
                        <span style={{
                          position: "absolute", left: 6, bottom: 4, fontSize: 12, fontWeight: 900, color: "#fff",
                          textShadow: "0 1px 3px #000",
                        }}>{pureTon % 1 === 0 ? pureTon.toFixed(0) : pureTon.toFixed(2)}</span>
                      </div>
                    )}
                    {nfts.map((n) => (
                      <div key={n.inventoryId} style={{
                        width: 72, height: 72, borderRadius: 14, overflow: "hidden", position: "relative",
                        background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {n.imageUrl
                          ? <img src={n.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : <span style={{ fontSize: 24 }}>🎁</span>}
                        <span style={{
                          position: "absolute", left: 6, bottom: 4, fontSize: 11, fontWeight: 900, color: "#fff",
                          textShadow: "0 1px 3px #000",
                        }}>{n.valueTon}</span>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>'''
    if old_d not in t:
        if "const pureTon = Math.max(0, Math.round((Number(stakeDetail.stake)" in t:
            print("spin detail already")
        else:
            raise SystemExit("spin detail block not found")
    else:
        t = t.replace(old_d, new_d, 1)
        print("spin detail ok")
    p.write_text(t)
    print("spin", p.stat().st_size)

def patch_arena(p: Path):
    t = p.read_text()
    if "stakeDetail" not in t:
        anchor = "const [winnerTag, setWinnerTag] = useState<string | null>(null);"
        if anchor not in t:
            raise SystemExit("arena state anchor missing")
        t = t.replace(anchor, anchor + "\n  const [stakeDetail, setStakeDetail] = useState<(ArenaPlayer & { color?: string; share?: number }) | null>(null);", 1)
        print("arena state ok")

    old = '''                    {isNft ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 3 }}>
                        {nfts.map((n) => (
                          <span key={n.inventoryId} style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "2px 7px", borderRadius: 999, fontSize: 10, fontWeight: 700,
                            background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)", color: "#fde68a",
                          }}>
                            {n.imageUrl
                              ? <img src={n.imageUrl} alt="" style={{ width: 14, height: 14, borderRadius: 4, objectFit: "cover" }} />
                              : "🎁"}
                            <span style={{ maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {n.nameRu || n.itemId}
                            </span>
                            <span>{n.valueTon}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginTop: 1 }}>💎 TON</div>
                    )}'''
    new = '''                    {(() => {
                      const nftSum = nfts.reduce((a, n) => a + (Number(n.valueTon) || 0), 0);
                      const pureTon = Math.max(0, Math.round((Number(s.stake) - nftSum) * 1000) / 1000);
                      return (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                          {pureTon > 1e-9 && (
                            <div style={{
                              width: 40, height: 40, borderRadius: 10, position: "relative",
                              background: "linear-gradient(145deg,#3b82f6,#1d4ed8)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              border: "1px solid rgba(96,165,250,0.55)",
                            }}>
                              <span style={{ fontSize: 16 }}>💎</span>
                              <span style={{
                                position: "absolute", left: 3, bottom: 2, fontSize: 9, fontWeight: 900, color: "#fff",
                                textShadow: "0 1px 2px #000",
                              }}>{pureTon % 1 === 0 ? pureTon.toFixed(0) : pureTon.toFixed(2)}</span>
                            </div>
                          )}
                          {nfts.map((n) => (
                            <div key={n.inventoryId} style={{
                              width: 40, height: 40, borderRadius: 10, overflow: "hidden", position: "relative",
                              background: "rgba(59,130,246,0.2)", border: "1px solid rgba(59,130,246,0.35)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              {n.imageUrl
                                ? <img src={n.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                : <span style={{ fontSize: 14 }}>🎁</span>}
                              <span style={{
                                position: "absolute", left: 3, bottom: 2, fontSize: 9, fontWeight: 900, color: "#fff",
                                textShadow: "0 1px 2px #000",
                              }}>{n.valueTon}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}'''
    if old not in t:
        if "pureTon > 1e-9" in t:
            print("arena chips already")
        else:
            raise SystemExit("arena chips block not found")
    else:
        t = t.replace(old, new, 1)
        print("arena chips ok")

    if "onClick={() => setStakeDetail(s)}" not in t:
        old_row = '<div key={s.telegramId} style={{ ...playerRow, alignItems: "flex-start", paddingTop: 6, paddingBottom: 6 }}>'
        new_row = '''<button type="button" key={s.telegramId} onClick={() => setStakeDetail(s)} style={{ ...playerRow, alignItems: "flex-start", paddingTop: 6, paddingBottom: 6, width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "inherit", background: "transparent" }}>'''
        if old_row in t:
            t = t.replace(old_row, new_row, 1)
            close_old = '''                <div style={{ textAlign: "right", flexShrink: 0, paddingTop: 2 }}>
                  <div style={{ fontWeight: 800, fontSize: 12 }}>{s.stake.toFixed(2)}</div>
                  <div style={{ fontSize: 10, color: "#94a3b8" }}>{(s.chance || s.share * 100).toFixed(1)}%</div>
                </div>
              </div>'''
            close_new = '''                <div style={{ textAlign: "right", flexShrink: 0, paddingTop: 2 }}>
                  <div style={{ fontWeight: 800, fontSize: 12 }}>{s.stake.toFixed(2)}</div>
                  <div style={{ fontSize: 10, color: "#94a3b8" }}>{(s.chance || s.share * 100).toFixed(1)}%</div>
                </div>
              </button>'''
            if close_old in t:
                t = t.replace(close_old, close_new, 1)
                print("arena clickable ok")

    if "{stakeDetail && (" not in t:
        modal = '''
      {stakeDetail && (
        <div onClick={() => setStakeDetail(null)} style={{
          position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: "100%", maxWidth: 320, borderRadius: 22,
            background: "linear-gradient(180deg,#1a1a24,#0f0f18)",
            border: "1px solid rgba(255,255,255,0.1)", padding: "16px 16px 18px",
            boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>
                Ставка @{(stakeDetail.username || stakeDetail.telegramId || "").replace(/^@/, "")}
              </div>
              <button type="button" onClick={() => setStakeDetail(null)}
                style={{ border: "none", background: "transparent", color: "#94a3b8", fontSize: 18, cursor: "pointer" }}>×</button>
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 14 }}>
              {Number(stakeDetail.stake).toFixed(2)} TON
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {(() => {
                const nfts = stakeDetail.nftStakes ?? [];
                const nftSum = nfts.reduce((s, n) => s + (Number(n.valueTon) || 0), 0);
                const pureTon = Math.max(0, Math.round((Number(stakeDetail.stake) - nftSum) * 1000) / 1000);
                return (
                  <>
                    {pureTon > 1e-9 && (
                      <div style={{
                        width: 72, height: 72, borderRadius: 14, position: "relative",
                        background: "linear-gradient(145deg,#3b82f6,#1d4ed8)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: "1px solid rgba(96,165,250,0.45)",
                      }}>
                        <span style={{ fontSize: 28 }}>💎</span>
                        <span style={{
                          position: "absolute", left: 6, bottom: 4, fontSize: 12, fontWeight: 900, color: "#fff",
                          textShadow: "0 1px 3px #000",
                        }}>{pureTon % 1 === 0 ? pureTon.toFixed(0) : pureTon.toFixed(2)}</span>
                      </div>
                    )}
                    {nfts.map((n) => (
                      <div key={n.inventoryId} style={{
                        width: 72, height: 72, borderRadius: 14, overflow: "hidden", position: "relative",
                        background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {n.imageUrl
                          ? <img src={n.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : <span style={{ fontSize: 24 }}>🎁</span>}
                        <span style={{
                          position: "absolute", left: 6, bottom: 4, fontSize: 11, fontWeight: 900, color: "#fff",
                          textShadow: "0 1px 3px #000",
                        }}>{n.valueTon}</span>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
'''
        toast = t.find("{toast && (")
        if toast < 0:
            toast = t.find('{phase === "winner" && winnerData && (')
        if toast < 0:
            raise SystemExit("arena modal insert point missing")
        line_start = t.rfind("\n", 0, toast) + 1
        t = t[:line_start] + modal + "\n      " + t[line_start:]
        print("arena modal ok")

    p.write_text(t)
    print("arena", p.stat().st_size)

patch_spin(Path("artifacts/mini-app/src/components/SpinGame.tsx"))
patch_arena(Path("artifacts/mini-app/src/components/ArenaGame.tsx"))
print("ok")
