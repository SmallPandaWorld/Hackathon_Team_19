"use client";

import { useState, type CSSProperties } from "react";

const COLORS = [
  "var(--primary)",
  "var(--accent)",
  "var(--motif-pin)",
  "var(--danger)",
  "var(--link)",
];
const PIECE_COUNT = 60;

// Repeatable pseudo-random number in [0, 1), so every render draws the same burst.
function spread(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

const PIECES = Array.from({ length: PIECE_COUNT }, (_, index) => {
  const delay = spread(index, 1) * 0.15;
  const duration = 1.5 + spread(index, 2) * 1.1;
  const size = 6 + spread(index, 7) * 6;
  const round = index % 4 === 0;
  return {
    end: delay + duration,
    style: {
      "--dx": `${(spread(index, 3) - 0.5) * 90}vw`,
      "--peak": `${-(12 + spread(index, 4) * 32)}vh`,
      "--fall": `${35 + spread(index, 5) * 25}vh`,
      "--spin": `${(spread(index, 6) - 0.5) * 1440}deg`,
      animationDelay: `${delay}s`,
      animationDuration: `${duration}s`,
      background: COLORS[index % COLORS.length],
      borderRadius: round ? "9999px" : "2px",
      height: round ? size : size * 1.6,
      width: size,
    } as CSSProperties,
  };
});
const LAST_PIECE = PIECES.reduce(
  (last, piece, index) => (piece.end > PIECES[last].end ? index : last),
  0,
);

// A one-off confetti burst over the whole screen (keyframes in globals.css).
// It removes itself when the last piece has landed, so returning to a cached
// page doesn't replay it. Hidden for players who prefer reduced motion.
export function Confetti() {
  const [done, setDone] = useState(false);
  if (done) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[1200] overflow-hidden"
    >
      {PIECES.map((piece, index) => (
        <span
          className="confetti-piece absolute left-1/2 top-[45%]"
          key={index}
          onAnimationEnd={
            index === LAST_PIECE ? () => setDone(true) : undefined
          }
          style={piece.style}
        />
      ))}
    </div>
  );
}
