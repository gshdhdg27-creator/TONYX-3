from pathlib import Path

def patch_arena(p: Path):
    t = p.read_text()
    if "WinnerModal" not in t:
        needle = 'from "./arenaPhysics";'
        if needle not in t:
            raise SystemExit("arena import anchor missing")
        t = t.replace(needle, needle + '\nimport WinnerModal from "./WinnerModal";', 1)
    old_type = "name: string; payout: number; mult: number; photo?: string | null; color: string;"
    new_type = "name: string; payout: number; mult: number; photo?: string | null; color: string; prizes: { name: string; valueTon: number; imageUrl?: string | null }[];"
    if old_type in t:
        t = t.replace(old_type, new_type, 1)
    old_set = """        setWinnerData({
          name: data.winnerUsername || winner.username || winner.telegramId,
          payout, mult, photo: winner.photoUrl, color: winner.color,
        });"""
    new_set = """        const prizes: { name: string; valueTon: number; imageUrl?: string | null }[] = [];
        for (const pl of data.players) {
          if (pl.telegramId === winner.telegramId) continue;
          for (const n of (pl.nftStakes ?? [])) {
            prizes.push({ name: n.nameRu || n.itemId || "NFT", valueTon: Number(n.valueTon) || 0, imageUrl: n.imageUrl });
          }
        }
        const totalPure = data.players.reduce((s, pl) => {
          const nftSum = (pl.nftStakes ?? []).reduce((a, n) => a + (Number(n.valueTon) || 0), 0);
          return s + Math.max(0, pl.stake - nftSum);
        }, 0);
        const othersPool = Math.max(0, data.totalPool - winner.stake);
        const burned = totalPure + 1e-9 < othersPool * COMMISSION;
        setWinnerData({
          name: data.winnerUsername || winner.username || winner.telegramId,
          payout, mult, photo: winner.photoUrl, color: winner.color,
          prizes: burned ? [] : prizes,
        });"""
    if old_set in t:
        t = t.replace(old_set, new_set, 1)
    t = t.replace("const WINNER_HOLD_MS = 2000;", "const WINNER_HOLD_MS = 4500;", 1)
    start = t.find('{phase === "winner" && winnerData && (')
    if start < 0:
        raise SystemExit("arena modal not found")
    line_start = t.rfind("\n", 0, start) + 1
    end = t.find("\n      {/* History", start)
    if end < 0:
        end = t.find("\n      {showHistory", start)
    if end < 0:
        raise SystemExit("arena modal end not found")
    modal = '''      {phase === "winner" && winnerData && (
        <WinnerModal
          name={winnerData.name}
          payout={winnerData.payout}
          mult={winnerData.mult}
          photo={winnerData.photo}
          color={winnerData.color}
          prizes={winnerData.prizes || []}
        />
      )}
'''
    t = t[:line_start] + modal + t[end:]
    p.write_text(t)
    print("arena", p.stat().st_size)

def patch_spin(p: Path):
    t = p.read_text()
    if "WinnerModal" not in t:
        needle = 'from "react";'
        if needle in t:
            t = t.replace(needle, needle + '\nimport WinnerModal from "./WinnerModal";', 1)
        else:
            raise SystemExit("spin import anchor missing")
    old = """  const [winnerBanner, setWinnerBanner] = useState<{
    name: string;
    payout: number;
    chance: number;
  } | null>(null);"""
    new = """  const [winnerBanner, setWinnerBanner] = useState<{
    name: string;
    payout: number;
    chance: number;
    mult: number;
    photo?: string | null;
    prizes: { name: string; valueTon: number; imageUrl?: string | null }[];
  } | null>(null);"""
    if old in t:
        t = t.replace(old, new, 1)
    old_set = """            setWinnerBanner({
              name: data.winnerUsername || data.winnerId || "?",
              payout,
              chance,
            });"""
    new_set = """            const prizes: { name: string; valueTon: number; imageUrl?: string | null }[] = [];
            for (const pl of data.players) {
              if (pl.telegramId === data.winnerId) continue;
              for (const n of (pl.nftStakes ?? [])) {
                prizes.push({
                  name: (n as any).nameRu || (n as any).itemId || "NFT",
                  valueTon: Number((n as any).valueTon) || 0,
                  imageUrl: (n as any).imageUrl,
                });
              }
            }
            const totalPure = data.players.reduce((s, pl) => {
              const nftSum = (pl.nftStakes ?? []).reduce((a, n) => a + (Number((n as any).valueTon) || 0), 0);
              return s + Math.max(0, (pl.stake || 0) - nftSum);
            }, 0);
            const burned = totalPure + 1e-9 < others * 0.2;
            const mult = stake > 0 ? Math.round((payout / stake) * 100) / 100 : 0;
            setWinnerBanner({
              name: data.winnerUsername || data.winnerId || "?",
              payout,
              chance,
              mult,
              photo: wp?.photoUrl,
              prizes: burned ? [] : prizes,
            });"""
    if old_set in t:
        t = t.replace(old_set, new_set, 1)
    start = t.find("{winnerBanner && (")
    if start < 0:
        raise SystemExit("spin banner not found")
    line_start = t.rfind("\n", 0, start) + 1
    end = t.find("\n      {error &&", start)
    if end < 0:
        raise SystemExit("spin banner end not found")
    modal = '''      {winnerBanner && (
        <WinnerModal
          name={winnerBanner.name}
          payout={Number(winnerBanner.payout)}
          mult={winnerBanner.mult ?? 0}
          photo={winnerBanner.photo}
          prizes={winnerBanner.prizes || []}
          onClose={() => setWinnerBanner(null)}
        />
      )}
'''
    t = t[:line_start] + modal + t[end:]
    p.write_text(t)
    print("spin", p.stat().st_size)

patch_arena(Path("artifacts/mini-app/src/components/ArenaGame.tsx"))
patch_spin(Path("artifacts/mini-app/src/components/SpinGame.tsx"))
print("ok")
