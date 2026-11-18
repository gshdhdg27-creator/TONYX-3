from pathlib import Path
import re

p = Path("artifacts/mini-app/src/components/ArenaGame.tsx")
t = p.read_text()
c = []

# 1) Zoom 2x
for a,b in [
    ("setBoardZoom(1.7)", "setBoardZoom(2)"),
    ("setBoardZoom(1.55)", "setBoardZoom(2)"),
    ("setBoardZoom(1 + ease * 0.7)", "setBoardZoom(1 + ease * 1.0)"),
    ("setBoardZoom(1 + ease * 0.55)", "setBoardZoom(1 + ease * 1.0)"),
]:
    if a in t:
        t = t.replace(a, b); c.append("zoom:"+b)

# 2) Replace 3+ corner logic with diagonal wedges
old_start = t.find("  const ordered = [...list].sort((x, y) => y.stake - x.stake);")
if old_start > 0 and "topX" not in t:
    end = t.find("\nfunction loadChips", old_start)
    new_3plus = r'''\n  // 3+ : sequential diagonal wedges by cumulative share\n  const cuts: number[] = [0];\n  let acc = 0;\n  for (let i = 0; i < n; i++) {\n    acc += list[i].stake / total;\n    cuts.push(i === n - 1 ? 1 : Math.min(0.999, acc));\n  }\n  const topX: number[] = [];\n  const botX: number[] = [];\n  for (let i = 0; i <= n; i++) {\n    if (i === 0) { topX.push(0); botX.push(0); continue; }\n    if (i === n) { topX.push(W); botX.push(W); continue; }\n    const base = cuts[i];\n    const seed = hash01(list[i - 1].telegramId + "|" + list[i].telegramId + "|" + i);\n    const tilt = (seed - 0.5) * 0.12;\n    const shareL = cuts[i] - cuts[i - 1];\n    const shareR = cuts[i + 1] - cuts[i];\n    const maxT = Math.min(shareL, shareR) * 0.45;\n    const tt = Math.max(-maxT, Math.min(maxT, tilt));\n    topX.push(Math.max(0, Math.min(W, (base + tt) * W)));\n    botX.push(Math.max(0, Math.min(W, (base - tt) * W)));\n  }\n  return list.map((p, i) => {\n    const share = p.stake / total;\n    const poly: Pt[] = [\n      { x: topX[i], y: 0 },\n      { x: topX[i + 1], y: 0 },\n      { x: botX[i + 1], y: H },\n      { x: botX[i], y: H },\n    ];\n    return mk(p, i, share, poly, "wedge");\n  });\n}\n'''
    t = t[:old_start] + new_3plus + "\n" + t[end:]
    c.append("3plus-wedges")
elif "topX" in t:
    c.append("3plus already")
else:
    c.append("WARN no ordered block")

# 3) Fix avatar to absolute position at cx,cy
if "left: ax - av / 2" not in t:
    if "paddingTop: Math.max(12" in t:
        t = t.replace(
            'display: "flex", flexDirection: "column", alignItems: "center",\n                paddingTop: Math.max(12, Math.min(H - 80, (s.cy || H * 0.28) - av / 2)),\n                boxSizing: "border-box", overflow: "hidden", zIndex: 1,',
            'overflow: "hidden", zIndex: 1,',
        )
        if "const ax =" not in t:
            needle = 'const clip = (s.poly && s.poly.length)\n              ? `polygon(${s.poly.map((q) => `${(q.x / W) * 100}% ${(q.y / H) * 100}%`).join(", ")})`\n              : undefined;\n            return ('
            insert = 'const clip = (s.poly && s.poly.length)\n              ? `polygon(${s.poly.map((q) => `${(q.x / W) * 100}% ${(q.y / H) * 100}%`).join(", ")})`\n              : undefined;\n            const ax = Math.max(av / 2 + 4, Math.min(W - av / 2 - 4, s.cx || W / 2));\n            const ay = Math.max(av / 2 + 4, Math.min(H - av / 2 - 4, s.cy || H / 2));\n            return ('
            if needle in t:
                t = t.replace(needle, insert)
                c.append("ax-ay")
            else:
                c.append("WARN clip needle")
        old_av_style = '''                <div style={{\n                  width: av, height: av, borderRadius: "50%", border: "2.5px solid #fff", overflow: "hidden",\n                  background: "#0a0a12", display: "flex", alignItems: "center", justifyContent: "center",\n                  fontWeight: 900, fontSize: av * 0.3, color: "#fff", flexShrink: 0, zIndex: 1,\n                  boxShadow: "0 4px 12px rgba(0,0,0,0.35)",\n                }}>'''
        new_av_style = '''                <div style={{\n                  position: "absolute",\n                  left: ax - av / 2,\n                  top: ay - av / 2,\n                  width: av, height: av, borderRadius: "50%",\n                  border: "3px solid rgba(255,255,255,0.95)", overflow: "hidden",\n                  background: "rgba(10,10,18,0.55)",\n                  display: "flex", alignItems: "center", justifyContent: "center",\n                  fontWeight: 900, fontSize: av * 0.32, color: "#fff", zIndex: 2,\n                  boxShadow: "0 6px 16px rgba(0,0,0,0.4)",\n                }}>'''
        if old_av_style in t:
            t = t.replace(old_av_style, new_av_style)
            c.append("av-absolute")
        else:
            if 'border: "2.5px solid #fff"' in t:
                t = t.replace(
                    'width: av, height: av, borderRadius: "50%", border: "2.5px solid #fff", overflow: "hidden",\n                  background: "#0a0a12", display: "flex", alignItems: "center", justifyContent: "center",\n                  fontWeight: 900, fontSize: av * 0.3, color: "#fff", flexShrink: 0, zIndex: 1,\n                  boxShadow: "0 4px 12px rgba(0,0,0,0.35)",',
                    'position: "absolute", left: ax - av / 2, top: ay - av / 2,\n                  width: av, height: av, borderRadius: "50%",\n                  border: "3px solid rgba(255,255,255,0.95)", overflow: "hidden",\n                  background: "rgba(10,10,18,0.55)", display: "flex", alignItems: "center", justifyContent: "center",\n                  fontWeight: 900, fontSize: av * 0.32, color: "#fff", zIndex: 2,\n                  boxShadow: "0 6px 16px rgba(0,0,0,0.4)",',
                )
                c.append("av-absolute-loose")
            else:
                c.append("WARN av-style")
        if "width > 40 &&" in t:
            old_lab = '''                {width > 40 && (\n                  <>\n                    <div style={{ marginTop: 6, fontSize: 11, fontWeight: 900, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,.5)", maxWidth: width - 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", zIndex: 1 }}>\n                      {(s.username || s.telegramId).replace(/^@/, "").slice(0, 9)}\n                    </div>\n                    <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.95)", zIndex: 1 }}>{(s.chance || s.share * 100).toFixed(1)}%</div>\n                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.75)", zIndex: 1 }}>{s.stake.toFixed(2)}</div>\n                  </>\n                )}'''
            new_lab = '''                {s.share >= 0.12 && (\n                  <div style={{\n                    position: "absolute", left: ax, top: ay + av / 2 + 6,\n                    transform: "translateX(-50%)", textAlign: "center", zIndex: 2,\n                    textShadow: "0 1px 4px rgba(0,0,0,.55)", pointerEvents: "none",\n                  }}>\n                    <div style={{ fontSize: 11, fontWeight: 900, color: "#fff", maxWidth: 88, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>\n                      {(s.username || s.telegramId).replace(/^@/, "").slice(0, 10)}\n                    </div>\n                    <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,.95)" }}>\n                      {(s.chance || s.share * 100).toFixed(1)}%\n                    </div>\n                  </div>\n                )}'''
            if old_lab in t:
                t = t.replace(old_lab, new_lab)
                c.append("labels")
            else:
                c.append("WARN labels")
    else:
        c.append("WARN no paddingTop")
else:
    c.append("avatar already absolute")

print("changes:", c)
p.write_text(t)
print("OK", p.stat().st_size)
print("has topX", "topX" in t)
print("has ax", "left: ax - av" in t)
print("has zoom2", "setBoardZoom(2)" in t)
