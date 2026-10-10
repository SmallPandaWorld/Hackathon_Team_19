"use client";

import type { MouseEvent } from "react";

export type MapPin = {
  id: number;
  x: number; // % of map width
  y: number; // % of map height
  label: string;
  done?: boolean;
};

type Props = {
  pins: MapPin[];
  selectedId?: number | null;
  onSelect?: (id: number) => void;
  // Editor mode: clicking the map reports the position in percent.
  onPick?: (x: number, y: number) => void;
};

// Schematic of the ETH main building area (HG + Polyterrasse), not to scale.
// Quest pins use percent coordinates on this drawing, so if you replace it,
// keep the 4:3 aspect ratio or re-place the pins in the quest editor.
function MapDrawing() {
  return (
    <svg
      aria-hidden
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 400 300"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#ecfdf5" height="300" width="400" />
      {/* Slope down to the city */}
      <rect fill="#d1fae5" height="300" width="34" />
      <text
        fill="#047857"
        fontSize="9"
        transform="translate(20 150) rotate(-90)"
        textAnchor="middle"
      >
        ← view over the old town
      </text>

      {/* Polybahn upper station */}
      <rect
        fill="#fde68a"
        height="22"
        rx="3"
        stroke="#d97706"
        width="34"
        x="40"
        y="44"
      />
      <text fill="#92400e" fontSize="8" textAnchor="middle" x="57" y="58">
        Polybahn
      </text>

      {/* Polyterrasse */}
      <rect
        fill="#e2e8f0"
        height="122"
        rx="4"
        stroke="#94a3b8"
        width="112"
        x="40"
        y="70"
      />
      <text
        fill="#334155"
        fontSize="11"
        fontWeight="600"
        textAnchor="middle"
        x="96"
        y="134"
      >
        Polyterrasse
      </text>

      {/* Mensa building under the terrace */}
      <rect
        fill="#fef3c7"
        height="56"
        rx="4"
        stroke="#d97706"
        width="112"
        x="40"
        y="196"
      />
      <text
        fill="#92400e"
        fontSize="9"
        fontWeight="600"
        textAnchor="middle"
        x="96"
        y="238"
      >
        Mensa Polyterrasse
      </text>
      <text fill="#92400e" fontSize="8" textAnchor="middle" x="96" y="248">
        (MM building)
      </text>

      {/* HG main building with two courtyards and the main hall between them */}
      <rect
        fill="#c7d2fe"
        height="220"
        rx="4"
        stroke="#4f46e5"
        strokeWidth="1.5"
        width="190"
        x="170"
        y="40"
      />
      <rect
        fill="#eef2ff"
        height="120"
        rx="3"
        stroke="#818cf8"
        width="47"
        x="185"
        y="90"
      />
      <rect
        fill="#eef2ff"
        height="120"
        rx="3"
        stroke="#818cf8"
        width="81"
        x="264"
        y="90"
      />
      <rect fill="#a5b4fc" height="120" width="32" x="232" y="90" />
      <text
        fill="#312e81"
        fontSize="12"
        fontWeight="700"
        textAnchor="middle"
        x="265"
        y="64"
      >
        HG – Main building
      </text>
      <text
        fill="#312e81"
        fontSize="7.5"
        textAnchor="middle"
        transform="translate(248 150) rotate(-90)"
      >
        Main hall
      </text>
      <text fill="#4338ca" fontSize="7.5" textAnchor="middle" x="208" y="154">
        Courtyard
      </text>
      <text fill="#4338ca" fontSize="7.5" textAnchor="middle" x="304" y="154">
        Courtyard
      </text>
      <text fill="#312e81" fontSize="8" textAnchor="middle" x="265" y="240">
        Lecture halls &amp; offices
      </text>

      {/* Connection terrace → HG */}
      <rect fill="#e2e8f0" height="24" width="18" x="152" y="128" />

      <text fill="#64748b" fontSize="7" textAnchor="end" x="394" y="294">
        Schematic, not to scale
      </text>
    </svg>
  );
}

export function CampusMap({ pins, selectedId, onSelect, onPick }: Props) {
  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (!onPick) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    onPick(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
  }

  return (
    <div
      className={`relative aspect-[4/3] w-full overflow-hidden rounded-2xl shadow-sm ring-1 ring-slate-200 ${
        onPick ? "cursor-crosshair" : ""
      }`}
      onClick={handleClick}
    >
      <MapDrawing />
      {pins.map((pin) => {
        const selected = pin.id === selectedId;
        return (
          <button
            aria-label={pin.label}
            aria-pressed={selected}
            className={`absolute flex h-8 w-8 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full rounded-bl-none text-sm font-bold text-white shadow-md ring-2 ring-white transition ${
              pin.done ? "bg-emerald-600" : "bg-indigo-600"
            } ${selected ? "z-10 scale-125" : ""} -rotate-45`}
            key={pin.id}
            onClick={(event) => {
              event.stopPropagation();
              onSelect?.(pin.id);
            }}
            style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
            type="button"
          >
            <span className="rotate-45">{pin.done ? "✓" : "!"}</span>
          </button>
        );
      })}
    </div>
  );
}
