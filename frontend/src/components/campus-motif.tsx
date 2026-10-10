// The app's recurring campus element: a line drawing of the ETH main
// building seen from the Polyterrasse side: a rotunda with a tall arched
// drum, a flat copper dome with a lantern, a two-storey colonnade on a
// rounded base with arched doors, and two wings with hipped roofs. A dotted
// exploration trail leads to a pin; trail and pin swap teal/gold per theme
// (--motif-trail / --motif-pin) so both stay visible. Lines use currentColor.
// Use it sparingly (home header, sidebar, empty states).
export function CampusMotif({ className = "" }: { className?: string }) {
  const leftWindows = [0, 1, 2, 3, 4].map((i) => 36 + i * 15);
  const rightWindows = [0, 1, 2, 3, 4].map((i) => 216 + i * 15);
  const windows = [...leftWindows, ...rightWindows];
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
        <path d="M8 112h304" />

        {/* Wings: hipped roofs, three rows of windows (arched on top) */}
        <path d="M28 112V50l8-8h76l8 8v8M208 58v-8l8-8h76l8 8v62" />
        <path d="M28 50h84M208 50h84" />
        {windows.map((x) => (
          <g key={x}>
            <path d={`M${x} 66v-7a3.5 3.5 0 0 1 7 0v7z`} />
            <rect height="10" rx="1" width="7" x={x} y="76" />
            <rect height="10" rx="1" width="7" x={x} y="94" />
          </g>
        ))}
        {/* String course under the top-floor windows */}
        <path d="M28 70h84M208 70h84" />

        {/* Rotunda: rounded base with arched doors, balustrade, colonnade */}
        <path d="M112 112V58h96v54" />
        <path d="M112 90q48 7 96 0" />
        {[140, 160, 180].map((x) => (
          <path d={`M${x - 6} 112v-10a6 6 0 0 1 12 0v10`} key={x} />
        ))}
        <path d="M112 58h96M112 62h96" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <path d={`M${120 + i * 11.4} 62v26`} key={i} />
        ))}

        {/* Drum with a ring of arched windows */}
        <path d="M126 58V38h68v20" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <path d={`M${131 + i * 9.2} 55v-9a3 3 0 0 1 6 0v9`} key={i} />
        ))}
        {/* Flat copper dome, lantern and spire */}
        <path d="M124 38a36 26 0 0 1 72 0" />
        <path d="M144 16c6 5 9 11 10 22M176 16c-6 5-9 11-10 22" />
        <path d="M155 12V5h10v7M155 5a5 4 0 0 1 10 0M160 1v4" />
      </g>

      {/* Exploration trail to a pin */}
      <path
        d="M14 118c40 0 70-4 104-6 46-3 88-2 128-12 22-5 38-14 54-28"
        strokeDasharray="1 7"
        strokeLinecap="round"
        strokeWidth="3"
        style={{ stroke: "var(--motif-trail)" }}
      />
      <path
        d="M304 68s9-9.3 9-16a9 9 0 0 0-18 0c0 6.7 9 16 9 16z"
        style={{ fill: "var(--motif-pin)" }}
      />
      <circle cx="304" cy="52" r="3" style={{ fill: "var(--surface)" }} />
    </svg>
  );
}
