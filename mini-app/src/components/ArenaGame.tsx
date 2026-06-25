import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';

interface Player {
  id: string;
  name: string;
  color: string;
  stake: number;
  position: { x: number; y: number };
  initials: string;
  isAlive: boolean;
}

interface Territory {
  playerId: string;
  color: string;
  points: Array<{x: number; y: number}>;
  size: number;
}

const ArenaGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [players, setPlayers] = useState<Player[]>([
    { id: '1', name: 'Solar Muffin', color: '#8B00FF', stake: 1.65, position: { x: 150, y: 200 }, initials: 'SM', isAlive: true },
    { id: '2', name: 'Grey Oscar', color: '#00FFAA', stake: 1.0, position: { x: 350, y: 300 }, initials: 'GO', isAlive: true },
  ]);
  
  const [currentPlayer] = useState(players[0]);
  const [totalPot, setTotalPot] = useState(95.94);
  const [gameStarted, setGameStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [winner, setWinner] = useState<Player | null>(null);
  const [showWinPopup, setShowWinPopup] = useState(false);

  const animationRef = useRef<number>();
  const ballPos = useRef({ x: 250, y: 250 });
  const velocity = useRef({ x: 0, y: 0 });
  const territories = useRef<Territory[]>([]);

  // Расчёт территорий в зависимости от ставки
  const calculateTerritories = useCallback(() => {
    const totalStake = players.reduce((sum, p) => sum + p.stake, 0);
    const arenaSize = 500;
    
    const newTerritories: Territory[] = players.map((player, index) => {
      const fraction = player.stake / totalStake;
      const size = Math.floor(fraction * arenaSize * 0.65);
      
      // Диагональное разделение
      const startX = index === 0 ? 40 : arenaSize - size - 40;
      const startY = index === 0 ? 40 : arenaSize - size * 0.8 - 40;
      
      return {
        playerId: player.id,
        color: player.color,
        points: [
          {x: startX, y: startY},
          {x: startX + size, y: startY},
          {x: startX + size * 1.1, y: startY + size * 0.9},
          {x: startX - 20, y: startY + size * 1.3},
        ],
        size: size
      };
    });
    
    territories.current = newTerritories;
  }, [players]);

  // Отрисовка
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#0A0A0A';
    ctx.fillRect(0, 0, width, height);

    // Территории
    territories.current.forEach(territory => {
      ctx.beginPath();
      ctx.moveTo(territory.points[0].x, territory.points[0].y);
      
      for (let i = 1; i < territory.points.length; i++) {
        ctx.lineTo(territory.points[i].x, territory.points[i].y);
      }
      ctx.closePath();
      
      ctx.fillStyle = territory.color + '99';
      ctx.fill();

      ctx.strokeStyle = territory.color;
      ctx.lineWidth = 8;
      ctx.shadowColor = territory.color;
      ctx.shadowBlur = 25;
      ctx.stroke();
    });

    // Шарик
    const ballX = ballPos.current.x;
    const ballY = ballPos.current.y;

    // Тень
    ctx.beginPath();
    ctx.ellipse(ballX + 5, ballY + 10, 24, 11, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();

    // Основной шар
    ctx.beginPath();
    ctx.arc(ballX, ballY, 24, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    // Внутренний цвет
    ctx.beginPath();
    ctx.arc(ballX, ballY, 19, 0, Math.PI * 2);
    ctx.fillStyle = currentPlayer.color;
    ctx.fill();

    // Инициалы
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(currentPlayer.initials, ballX, ballY);

    // Свечение при движении
    if (velocity.current.x !== 0 || velocity.current.y !== 0) {
      ctx.beginPath();
      ctx.arc(ballX, ballY, 32, 0, Math.PI * 2);
      ctx.strokeStyle = currentPlayer.color + '55';
      ctx.lineWidth = 6;
      ctx.stroke();
    }
  }, [currentPlayer]);

  // Игровой цикл
  const gameLoop = useCallback(() => {
    ballPos.current.x += velocity.current.x * 1.6;
    ballPos.current.y += velocity.current.y * 1.6;

    // Отскок от стен
    if (ballPos.current.x < 40 || ballPos.current.x > 460) velocity.current.x *= -0.8;
    if (ballPos.current.y < 40 || ballPos.current.y > 460) velocity.current.y *= -0.8;

    velocity.current.x *= 0.96;
    velocity.current.y *= 0.96;

    draw();

    animationRef.current = requestAnimationFrame(gameLoop);
  }, [draw]);

  // Управление пальцем
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!gameStarted) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = (e.clientX - centerX) / 7;
    const dy = (e.clientY - centerY) / 7;

    velocity.current.x = Math.max(Math.min(dx, 14), -14);
    velocity.current.y = Math.max(Math.min(dy, 14), -14);
  };

  useEffect(() => {
    calculateTerritories();
    
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = 500;
      canvas.height = 500;
    }

    setTimeout(() => {
      setGameStarted(true);
      gameLoop();
    }, 600);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [calculateTerritories, gameLoop]);

  // Попап победы
  const WinPopup = () => winner && (
    <motion.div 
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="absolute inset-0 flex items-center justify-center bg-black/90 z-50"
    >
      <div className="bg-gradient-to-br from-green-900 to-emerald-900 p-8 rounded-3xl text-center max-w-[320px]">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-3xl font-bold mb-2 text-white">ВЫИГРАЛ</h2>
        <div className="flex justify-center mb-6">
          <div 
            className="w-24 h-24 rounded-full flex items-center justify-center text-4xl font-bold shadow-2xl"
            style={{ backgroundColor: winner.color }}
          >
            {winner.initials}
          </div>
        </div>
        <p className="text-white text-xl mb-6">{winner.name}</p>
        <button 
          onClick={() => window.location.reload()}
          className="bg-white text-black px-10 py-4 rounded-2xl font-semibold text-lg w-full"
        >
          ИГРАТЬ СНОВА
        </button>
      </div>
    </motion.div>
  );

  return (
    <div className="relative w-full max-w-[500px] mx-auto bg-black min-h-screen overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <button className="text-white">← Назад</button>
          <div>
            <div className="text-white font-medium">ПВП Арена</div>
            <div className="text-emerald-400 text-sm flex items-center gap-1">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
              В эфире
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-white text-sm">Таймер: {timeLeft}s</div>
          <div className="text-white/70 text-xs">Банк: {totalPot.toFixed(2)} GRAM</div>
        </div>
      </div>

      {/* Арена */}
      <div className="relative flex justify-center py-6 bg-zinc-950">
        <canvas
          ref={canvasRef}
          className="rounded-3xl border-4 border-white/10 touch-none shadow-2xl"
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerMove}
        />
      </div>

      {/* Инфо игроков */}
      <div className="p-4 border-t border-white/10 bg-black">
        <div className="flex gap-3 justify-center flex-wrap">
          {players.map(player => (
            <div key={player.id} className="flex items-center gap-2 bg-zinc-900 px-4 py-2 rounded-2xl">
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ backgroundColor: player.color }}
              >
                {player.initials}
              </div>
              <div>
                <div className="text-white text-sm">{player.name}</div>
                <div className="text-emerald-400 text-xs">{player.stake} GRAM</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showWinPopup && <WinPopup />}
    </div>
  );
};

export default ArenaGame;
