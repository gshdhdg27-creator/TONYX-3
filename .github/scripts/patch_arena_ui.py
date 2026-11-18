from pathlib import Path
import re

p = Path("artifacts/mini-app/src/components/ArenaGame.tsx")
t = p.read_text()
orig = t
changed = []

# 1) Clear trail on stop + stronger final zoom
if "setBoardZoom(1.55)" in t:
    if "setTrail([])" not in t[t.find("if (raw >= 1)"):t.find("if (raw >= 1)") + 500]:
        t = t.replace(
            "setPuckPos(target);\n        setZoomOrigin",
            "setPuckPos(target);\n        setTrail([]);\n        setZoomOrigin",
            1,
        )
    t = t.replace("setBoardZoom(1.55)", "setBoardZoom(1.7)", 1)
    changed.append("trail+zoom-stop")
elif "setBoardZoom(1.7)" in t:
    changed.append("trail+zoom-stop already")
else:
    changed.append("WARN stop")

# 2) Zoom ramp earlier
if "raw > 0.55" in t:
    t = t.replace("raw > 0.55", "raw > 0.35")
    t = t.replace("(raw - 0.55) / 0.45", "(raw - 0.35) / 0.65")
    t = t.replace("ease * 0.55", "ease * 0.7")
    changed.append("zoom-ramp")
elif "raw > 0.35" in t:
    changed.append("zoom-ramp already")
else:
    changed.append("WARN zoom-ramp")

# 3) mk with place + area centroid
if "place?: Pt" not in t:
    pat = (
        r"const mk = \(\s*p: ArenaPlayer,\s*i: number,\s*share: number,\s*poly: Pt\[\],\s*shape: string,\s*\): Strip => \{\s*"
        r"let sx = 0, sy = 0;\s*for \(const q of poly\) \{ sx \+= q\.x; sy \+= q\.y; \}\s*"
        r"const cx = sx / Math\.max\(1, poly\.length\);\s*const cy = sy / Math\.max\(1, poly\.length\);"
    )
    repl = (
        "const mk = (\n"
        "    p: ArenaPlayer,\n"
        "    i: number,\n"
        "    share: number,\n"
        "    poly: Pt[],\n"
        "    shape: string,\n"
        "    place?: Pt,\n"
        "  ): Strip => {\n"
        "    let a = 0, cx = 0, cy = 0;\n"
        "    const nn = poly.length;\n"
        "    for (let k = 0; k < nn; k++) {\n"
        "      const j = (k + 1) % nn;\n"
        "      const cross = poly[k].x * poly[j].y - poly[j].x * poly[k].y;\n"
        "      a += cross;\n"
        "      cx += (poly[k].x + poly[j].x) * cross;\n"
        "      cy += (poly[k].y + poly[j].y) * cross;\n"
        "    }\n"
        "    a *= 0.5;\n"
        "    if (Math.abs(a) > 1e-3) { cx /= (6 * a); cy /= (6 * a); }\n"
        "    else {\n"
        "      let sx = 0, sy = 0;\n"
        "      for (const q of poly) { sx += q.x; sy += q.y; }\n"
        "      cx = sx / Math.max(1, nn); cy = sy / Math.max(1, nn);\n"
        "    }\n"
        "    if (place) { cx = place.x; cy = place.y; }"
    )
    t2, n = re.subn(pat, repl, t, count=1)
    if n == 1:
        t = t2
        changed.append("mk-centroid")
    else:
        changed.append("WARN mk n=" + str(n))
else:
    changed.append("mk already")

# 4) Corner place points
if "place = { x: inset" not in t:
    old = (
        '    let poly: Pt[];\n'
        '    if (corner === "tl") {\n'
        '      poly = [{ x: 0, y: 0 }, { x: f * W, y: 0 }, { x: 0, y: f * H }];\n'
        '    } else if (corner === "tr") {\n'
        '      poly = [{ x: W, y: 0 }, { x: W, y: f * H }, { x: W - f * W, y: 0 }];\n'
        '    } else if (corner === "br") {\n'
        '      poly = [{ x: W, y: H }, { x: W - f * W, y: H }, { x: W, y: H - f * H }];\n'
        '    } else {\n'
        '      poly = [{ x: 0, y: H }, { x: 0, y: H - f * H }, { x: f * W, y: H }];\n'
        '    }'
    )
    new = (
        '    const inset = f * 0.28;\n'
        '    let poly: Pt[];\n'
        '    let place: Pt;\n'
        '    if (corner === "tl") {\n'
        '      poly = [{ x: 0, y: 0 }, { x: f * W, y: 0 }, { x: 0, y: f * H }];\n'
        '      place = { x: inset * W, y: inset * H };\n'
        '    } else if (corner === "tr") {\n'
        '      poly = [{ x: W, y: 0 }, { x: W, y: f * H }, { x: W - f * W, y: 0 }];\n'
        '      place = { x: W - inset * W, y: inset * H };\n'
        '    } else if (corner === "br") {\n'
        '      poly = [{ x: W, y: H }, { x: W - f * W, y: H }, { x: W, y: H - f * H }];\n'
        '      place = { x: W - inset * W, y: H - inset * H };\n'
        '    } else {\n'
        '      poly = [{ x: 0, y: H }, { x: 0, y: H - f * H }, { x: f * W, y: H }];\n'
        '      place = { x: inset * W, y: H - inset * H };\n'
        '    }'
    )
    if old in t:
        t = t.replace(old, new)
        t = t.replace(
            'result.push(mk(p, origIdx >= 0 ? origIdx : idx + 1, share, poly, "corner"));',
            'result.push(mk(p, origIdx >= 0 ? origIdx : idx + 1, share, poly, "corner", place));',
        )
        changed.append("corner-place")
    else:
        changed.append("WARN corner-block")
else:
    changed.append("corner already")

# 5) Avatar size by isCorner
if "const isCorner = s.shape" not in t:
    needle = "const av = Math.round(Math.min(96, Math.max(28, 22 + s.share * 110)));"
    repl = (
        'const isCorner = s.shape === "corner";\n'
        '            const av = isCorner\n'
        '              ? Math.round(Math.min(36, Math.max(22, 18 + s.share * 80)))\n'
        '              : Math.round(Math.min(88, Math.max(36, 28 + s.share * 90)));'
    )
    if needle in t:
        t = t.replace(needle, repl)
        changed.append("av-size")
    else:
        # try the post-portals version
        needle2 = "const av = Math.round(Math.min(96, Math.max(28, 22 + s.share * 110)));"
        if needle2 in t:
            t = t.replace(needle2, repl)
            changed.append("av-size-2")
        else:
            changed.append("WARN av-size")
else:
    changed.append("av-size already")

# 6) Labels only non-corner
if "!isCorner && s.share" not in t:
    if "{s.share >= 0.12 && (" in t:
        t = t.replace("{s.share >= 0.12 && (", "{!isCorner && s.share >= 0.14 && (")
        changed.append("labels")
    else:
        changed.append("WARN labels")
else:
    changed.append("labels already")

print("changes:", changed)
if t == orig:
    raise SystemExit("No changes applied!")
p.write_text(t)
print("OK", p.stat().st_size)
