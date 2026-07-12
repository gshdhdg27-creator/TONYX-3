import { BOSSES, BOSS_REVIVE_COST } from "../constants/bosses";

/**
 * Boost/respawn percentages configured by the admin panel
 * (`Игра` tab → "Бусты" / "Возрождение"). These are mutable so the
 * whole app can react once `loadLiveGameConfig()` resolves.
 */
export const BOOST_CONFIG = {
  adBoostPct: 20,
  tonBoostPct1: 50,
  tonBoostPct2: 100,
  respawnHours: 24,
};

let loaded = false;
let inflight: Promise<void> | null = null;

/**
 * Fetches `/api/mini/admin/settings/game-config` (public endpoint) and
 * applies the admin-configured boss HP / revive cost / boost % values
 * on top of the static defaults in `constants/bosses.ts`.
 *
 * `BOSSES` and `BOSS_REVIVE_COST` are mutated in place (not replaced),
 * so every module that already imported them sees the live values.
 */
export function loadLiveGameConfig(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (inflight) return inflight;
  inflight = fetch("/api/mini/admin/settings/game-config")
    .then((r) => r.json())
    .then((d: {
      bosses?: { level: number; hp: number | null; reviveTon: number | null; reviveAds?: number | null }[];
      respawnHours?: number;
      adBoostPct?: number;
      tonBoostPct1?: number;
      tonBoostPct2?: number;
    }) => {
      for (const b of d.bosses ?? []) {
        const boss = BOSSES[b.level];
        if (boss && b.hp != null && b.hp > 0) boss.maxHp = b.hp;
        const revive = BOSS_REVIVE_COST[b.level];
        if (revive) {
          if (b.reviveTon != null) revive.ton = b.reviveTon;
          if (b.reviveAds !== undefined) revive.ads = b.reviveAds;
        }
      }
      if (d.respawnHours != null) BOOST_CONFIG.respawnHours = d.respawnHours;
      if (d.adBoostPct != null) BOOST_CONFIG.adBoostPct = d.adBoostPct;
      if (d.tonBoostPct1 != null) BOOST_CONFIG.tonBoostPct1 = d.tonBoostPct1;
      if (d.tonBoostPct2 != null) BOOST_CONFIG.tonBoostPct2 = d.tonBoostPct2;
      loaded = true;
    })
    .catch(() => {
      // Keep static defaults if the request fails (e.g. offline dev preview)
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
