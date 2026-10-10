// The app's recurring campus element: a line drawing of the ETH main
// building (dome, columned centre, two wings) with a dotted exploration
// trail leading to a yellow pin. Lines use currentColor; the trail and pin
// use the VIS yellow. Use it sparingly (home header, empty states).
export function CampusMotif({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      viewBox="0 0 320 120"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      >
        {/* Ground */}
        <path d="M8 108h304" />
        {/* Wings */}
        <path d="M34 108V66h88M198 66h88v42" />
        <path d="M30 66h96M194 66h96" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <g key={i}>
            <rect height="9" rx="1" width="7" x={43 + i * 12} y="74" />
            <rect height="9" rx="1" width="7" x={43 + i * 12} y="90" />
            <rect height="9" rx="1" width="7" x={207 + i * 12} y="74" />
            <rect height="9" rx="1" width="7" x={207 + i * 12} y="90" />
          </g>
        ))}
        {/* Columned centre with pediment */}
        <path d="M122 108V58h76v50" />
        <path d="M118 58h84M126 58l34-8 34 8" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <path d={`M${131 + i * 11.6} 64v40`} key={i} />
        ))}
        {/* Drum, dome and lantern */}
        <path d="M138 50V40h44v10" />
        {[0, 1, 2, 3].map((i) => (
          <path d={`M${146 + i * 9.3} 42v6`} key={i} />
        ))}
        <path d="M136 40a24 24 0 0 1 48 0" />
        <path d="M148 22.5c4 6 6 11 6 17.5M172 22.5c-4 6-6 11-6 17.5" />
        <path d="M156 16.8V10h8v6.8M160 10V5" />
      </g>
      {/* Exploration trail to a pin */}
      <path
        d="M14 117c40 0 70-4 104-6 46-3 88-2 128-12 20-5 34-14 46-26"
        stroke="var(--primary)"
        strokeDasharray="1 7"
        strokeLinecap="round"
        strokeWidth="3"
      />
      <path
        d="M300 66s9-9.3 9-16a9 9 0 0 0-18 0c0 6.7 9 16 9 16z"
        fill="var(--primary)"
        stroke="#181c22"
        strokeWidth="1.5"
      />
      <circle cx="300" cy="50" fill="#181c22" r="3" />
    </svg>
  );
}
