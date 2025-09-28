"use client";

import { useEffect, useState } from "react";

interface BetTimerProps {
  deadline: bigint;
  onExpired?: () => void;
}

export const BetTimer = ({ deadline, onExpired }: BetTimerProps) => {
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    let hasExpired = false;

    const updateTimer = () => {
      const now = Math.floor(Date.now() / 1000);
      const deadlineTime = Number(deadline);

      if (now >= deadlineTime) {
        setIsExpired(true);
        setTimeLeft("Expired");
        if (onExpired && !hasExpired) {
          hasExpired = true;
          onExpired();
        }
        return;
      }

      const secondsLeft = deadlineTime - now;

      if (secondsLeft < 60) {
        setTimeLeft(`${secondsLeft}s`);
      } else if (secondsLeft < 3600) {
        const minutes = Math.floor(secondsLeft / 60);
        const seconds = secondsLeft % 60;
        setTimeLeft(`${minutes}m ${seconds}s`);
      } else {
        const hours = Math.floor(secondsLeft / 3600);
        const minutes = Math.floor((secondsLeft % 3600) / 60);
        setTimeLeft(`${hours}h ${minutes}m`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [deadline, onExpired]);

  return <span className={`font-mono ${isExpired ? "text-green-600" : "text-orange-600"}`}>{timeLeft}</span>;
};
