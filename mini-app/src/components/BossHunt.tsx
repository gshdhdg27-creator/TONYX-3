import React, {
  useEffect,
  useMemo,
  useState
} from "react";

import {
  motion,
  AnimatePresence
} from "framer-motion";

import {
  BOSSES,
  getBossByTier
} from "../data/bosses";

import {
  HEROES,
  DEFAULT_HERO_SLOTS,
  calculateTeamDps
} from "../data/heroes";

import {
  createBattle,
  calculateBattleTime,
  getCurrentBossHp,
  getBattleProgress,
  getRemainingTime,
  formatTimeLeft,
  isBattleFinished,
  saveBattleState,
  loadBattleState
} from "../engine/battleEngine";

import {
  BattleState,
  BossTier
} from "../types/game";

const BossHunt = () => {
  const [selectedTier, setSelectedTier] =
    useState<BossTier>(1);

  const [battle, setBattle] =
    useState<BattleState | null>(null);

  const [currentHp, setCurrentHp] =
    useState(0);

  const [progress, setProgress] =
    useState(0);

  const [remainingTime, setRemainingTime] =
    useState("0д 0ч 0м 0с");

  const [showVictory, setShowVictory] =
    useState(false);

  const [selectedHeroes, setSelectedHeroes] =
    useState<number[]>([1]);

  const [bossAnimation, setBossAnimation] =
    useState("idle");

  const selectedBoss = useMemo(
    () => getBossByTier(selectedTier),
    [selectedTier]
  );

  const totalDps = useMemo(() => {
    return calculateTeamDps(
      selectedHeroes
    );
  }, [selectedHeroes]);

  const estimatedTime = useMemo(() => {
    return calculateBattleTime(
      selectedBoss.maxHp,
      totalDps
    );
  }, [selectedBoss, totalDps]);

  useEffect(() => {
    const saved =
      loadBattleState();

    if (saved) {
      setBattle(saved);
    }
  }, []);

  useEffect(() => {
    if (!battle) return;

    const interval =
      setInterval(() => {
        const hp =
          getCurrentBossHp(
            battle
          );

        const battleProgress =
          getBattleProgress(
            battle
          );

        setCurrentHp(hp);

        setProgress(
          battleProgress
        );

        setRemainingTime(
          formatTimeLeft(
            getRemainingTime(
              battle
            )
          )
        );

        if (
          isBattleFinished(
            battle
          )
        ) {
          setShowVictory(true);

          clearInterval(
            interval
          );
        }
      }, 1000);

    return () =>
      clearInterval(
        interval
      );
  }, [battle]);

  const startBattle = () => {
    if (totalDps <= 0) {
      return;
    }

    const newBattle =
      createBattle(
        selectedBoss,
        totalDps
      );

    saveBattleState(
      newBattle
    );

    setBattle(
      newBattle
    );
  };

  const toggleHero = (
    heroId: number
  ) => {
    if (
      selectedHeroes.includes(
        heroId
      )
    ) {
      if (
        selectedHeroes.length ===
        1
      ) {
        return;
      }

      setSelectedHeroes(
        selectedHeroes.filter(
          id =>
            id !== heroId
        )
      );

      return;
    }

    if (
      selectedHeroes.length >=
      5
    ) {
      return;
    }

    setSelectedHeroes([
      ...selectedHeroes,
      heroId
    ]);
  };

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="max-w-6xl mx-auto">

        <h1 className="text-5xl font-black text-center mb-8">
          👹 Boss Hunt
        </h1>

        <div className="grid grid-cols-5 gap-3 mb-8">
          {BOSSES.map(
            boss => (
              <button
                key={boss.id}
                onClick={() =>
                  setSelectedTier(
                    boss.tier
                  )
                }
                className={`
                  rounded-xl
                  p-4
                  border
                  ${
                    selectedTier ===
                    boss.tier
                      ? "border-yellow-500 bg-yellow-500/10"
                      : "border-zinc-700"
                  }
                `}
              >
                <div className="font-bold">
                  {boss.name}
                </div>

                <div className="text-sm text-zinc-400">
                  HP:
                  {" "}
                  {boss.maxHp.toLocaleString()}
                </div>

                <div className="text-xs text-yellow-400">
                  {boss.chestType}
                </div>
              </button>
            )
          )}
        </div>

        <motion.div
          animate={{
            scale:
              bossAnimation ===
              "rage"
                ? [1, 1.04, 1]
                : 1
          }}
          className="
            bg-zinc-900
            rounded-3xl
            p-8
            mb-8
            text-center
          "
        >
          <div className="text-8xl mb-4">
            👹
          </div>

          <div className="text-3xl font-bold">
            {selectedBoss.name}
          </div>

          <div className="mt-3 text-zinc-400">
            HP:
            {" "}
            {selectedBoss.maxHp.toLocaleString()}
          </div>
        </motion.div>

        {battle ? (
          <div className="mb-8">

            <div className="bg-zinc-900 rounded-3xl p-6">

              <div className="flex justify-between mb-3">
                <span>
                  Текущий бой
                </span>

                <span>
                  {remainingTime}
                </span>
              </div>

              <div className="w-full h-6 bg-zinc-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-red-500"
                  animate={{
                    width: `${100 - progress}%`
                  }}
                  transition={{
                    duration: 0.5
                  }}
                />
              </div>

              <div className="flex justify-between mt-2 text-sm text-zinc-400">
                <span>
                  HP:
                  {" "}
                  {Math.floor(
                    currentHp
                  ).toLocaleString()}
                </span>

                <span>
                  {progress.toFixed(
                    1
                  )}
                  %
                </span>
              </div>

            </div>

          </div>
        ) : (
          <div className="mb-8">

            <div className="bg-zinc-900 rounded-3xl p-6">

              <div className="text-xl font-bold mb-3">
                Прогноз боя
              </div>

              <div className="grid grid-cols-2 gap-4">

                <div>
                  <div className="text-zinc-400">
                    DPS команды
                  </div>

                  <div className="text-2xl font-bold text-green-400">
                    {totalDps.toFixed(
                      2
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-zinc-400">
                    Время победы
                  </div>

                  <div className="text-2xl font-bold text-yellow-400">
                    {estimatedTime.days}д{" "}
                    {estimatedTime.hours}ч{" "}
                    {estimatedTime.minutes}м
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

        <div className="bg-zinc-900 rounded-3xl p-6 mb-8">

          <div className="text-2xl font-bold mb-6">
            Маги
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">

            {HEROES.map(hero => {

              const selected =
                selectedHeroes.includes(
                  hero.id
                );

              return (
                <button
                  key={hero.id}
                  onClick={() =>
                    toggleHero(
                      hero.id
                    )
                  }
                  className={`
                    p-4
                    rounded-2xl
                    border
                    text-left

                    ${
                      selected
                        ? "border-green-500 bg-green-500/10"
                        : "border-zinc-700"
                    }
                  `}
                >

                  <div className="font-bold">
                    {hero.name}
                  </div>

                  <div className="text-sm text-zinc-400">
                    DPS:
                    {" "}
                    {hero.dps}
                  </div>

                  <div className="text-sm text-zinc-400">
                    Скорость:
                    {" "}
                    {hero.attackSpeed}с
                  </div>

                  <div className="text-xs text-yellow-400 mt-2">
                    {hero.attackType}
                  </div>

                </button>
              );
            })}

          </div>

        </div>

        <div className="bg-zinc-900 rounded-3xl p-6 mb-8">

          <div className="text-2xl font-bold mb-6">
            Боевые слоты
          </div>

          <div className="grid grid-cols-5 gap-3">

            {DEFAULT_HERO_SLOTS.map(
              slot => {

                const heroId =
                  selectedHeroes[
                    slot.slotId - 1
                  ];

                const hero =
                  HEROES.find(
                    h =>
                      h.id ===
                      heroId
                  );

                return (
                  <div
                    key={slot.slotId}
                    className="
                      border
                      border-zinc-700
                      rounded-2xl
                      p-4
                      min-h-[120px]
                    "
                  >

                    <div className="text-zinc-500 text-sm mb-2">
                      Слот {slot.slotId}
                    </div>

                    {hero ? (
                      <>
                        <div className="font-bold">
                          {hero.name}
                        </div>

                        <div className="text-green-400 text-sm mt-1">
                          {hero.dps} DPS
                        </div>
                      </>
                    ) : (
                      <div className="text-zinc-600">
                        Пусто
                      </div>
                    )}

                  </div>
                );
              }
            )}

          </div>

        </div>

        {!battle && (
          <button
            onClick={
              startBattle
            }
            className="
              w-full
              py-5
              rounded-3xl
              bg-yellow-500
              text-black
              font-black
              text-xl
            "
          >
            ⚔ Начать бой
          </button>
        )}

        <div className="grid md:grid-cols-3 gap-4 mt-8">

          <button
            className="
              bg-blue-600
              rounded-2xl
              p-4
              font-bold
            "
          >
            📺 +20% DPS
            <div className="text-sm opacity-80 mt-1">
              10 реклам / 24 часа
            </div>
          </button>

          <button
            className="
              bg-purple-600
              rounded-2xl
              p-4
              font-bold
            "
          >
            ⚡ x2 Буст
            <div className="text-sm opacity-80 mt-1">
              Только на текущий бой
            </div>
          </button>

          <button
            className="
              bg-red-600
              rounded-2xl
              p-4
              font-bold
            "
          >
            ⚔ Добить босса
            <div className="text-sm opacity-80 mt-1">
              TON / Stars / Реклама
            </div>
          </button>

        </div>

        <AnimatePresence>

          {showVictory && (

            <motion.div
              className="
                fixed
                inset-0
                bg-black/90
                flex
                items-center
                justify-center
                z-50
              "
              initial={{
                opacity: 0
              }}
              animate={{
                opacity: 1
              }}
              exit={{
                opacity: 0
              }}
            >

              <motion.div
                initial={{
                  scale: 0.8
                }}
                animate={{
                  scale: 1
                }}
                className="
                  bg-zinc-900
                  rounded-3xl
                  p-10
                  text-center
                  max-w-md
                  w-full
                "
              >

                <div className="text-8xl mb-6">
                  🎁
                </div>

                <div className="text-4xl font-black mb-4">
                  БОСС ПОВЕРЖЕН
                </div>

                <div className="text-zinc-400 mb-6">
                  Вы получили сундук
                </div>

                <button
                  className="
                    w-full
                    py-4
                    rounded-2xl
                    bg-yellow-500
                    text-black
                    font-black
                  "
                >
                  Открыть сундук
                </button>

              </motion.div>

            </motion.div>

          )}

        </AnimatePresence>

      </div>
    </div>
  );
};

export default BossHunt;
