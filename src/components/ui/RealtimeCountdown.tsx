'use client';

import { useState, useEffect } from 'react';
import { Timer } from 'lucide-react';

interface RealtimeCountdownProps {
  expiresAt: number | string;
  onClick?: (e: React.MouseEvent) => void;
}

export function RealtimeCountdown({ expiresAt, onClick }: RealtimeCountdownProps) {
  const numericExpiresAt = typeof expiresAt === 'string' ? parseInt(expiresAt, 10) : expiresAt;
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!numericExpiresAt || isNaN(numericExpiresAt)) return;

    const updateCountdown = () => {
      const now = Date.now();
      const diff = numericExpiresAt - now;

      if (diff <= 0) {
        setTimeLeft('Expirado');
        setIsExpired(true);
        return;
      }

      setIsExpired(false);
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const pad = (n: number) => n.toString().padStart(2, '0');
      
      if (hours > 24) {
        const days = Math.floor(hours / 24);
        setTimeLeft(`${days}d ${hours % 24}h`);
      } else if (hours > 0) {
        setTimeLeft(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
      } else {
        setTimeLeft(`${pad(minutes)}:${pad(seconds)}`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [numericExpiresAt]);

  if (!numericExpiresAt || isNaN(numericExpiresAt)) return null;

  return (
    <span 
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border transition-colors ${
        isExpired 
          ? 'bg-error/10 text-error border-error/20' 
          : 'bg-accent/10 text-accent border-accent/20'
      } ${onClick ? 'cursor-pointer hover:opacity-80 active:scale-95' : ''}`}
      title={`Expira: ${new Date(numericExpiresAt).toLocaleString()}`}
    >
      <Timer className="w-3 h-3 shrink-0 opacity-70" />
      {timeLeft}
    </span>
  );
}
