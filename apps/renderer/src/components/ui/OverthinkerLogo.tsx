interface NgegameLogoProps {
  className?: string;
  withText?: boolean;
}

export function NgegameLogo({
  className = 'h-8 w-8',
  withText = false,
}: NgegameLogoProps): React.JSX.Element {
  return (
    <svg
      viewBox={withText ? '0 0 220 205' : '0 0 220 155'}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Logo Ngegame"
    >
      <defs>
        <linearGradient id="ngegame-blue" x1="15" y1="15" x2="100" y2="145" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#009EEB" />
          <stop offset="100%" stopColor="#0074BD" />
        </linearGradient>
        <linearGradient id="ngegame-orange" x1="120" y1="15" x2="205" y2="145" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF9233" />
          <stop offset="100%" stopColor="#E66A12" />
        </linearGradient>
      </defs>

      {/* Left Blue Gamepad Half (Transparent Background) */}
      <path
        d="M98 24H82C69 24 63 14 53 14C34 14 14 58 14 108C14 134 26 146 42 146C55 146 66 131 76 119C82 112 89 110 98 110V24Z"
        fill="url(#ngegame-blue)"
      />
      {/* Crisp White Plus (+) */}
      <path
        d="M52 54V92M33 73H71"
        stroke="#FFFFFF"
        strokeWidth="13"
        strokeLinecap="round"
      />

      {/* Right Orange Gamepad Half (Transparent Background) */}
      <path
        d="M122 24H138C151 24 157 14 167 14C186 14 206 58 206 108C206 134 194 146 178 146C165 146 154 131 144 119C138 112 131 110 122 110V24Z"
        fill="url(#ngegame-orange)"
      />
      {/* Crisp White Ring (O) */}
      <circle
        cx="166"
        cy="73"
        r="19"
        stroke="#FFFFFF"
        strokeWidth="12"
      />

      {withText && (
        <text
          x="110"
          y="192"
          textAnchor="middle"
          fontFamily="Inter, system-ui, -apple-system, sans-serif"
          fontWeight="900"
          fontSize="33"
          letterSpacing="1.5"
        >
          <tspan fill="#0094E0">NGE</tspan>
          <tspan fill="#F47E20">GAME</tspan>
        </text>
      )}
    </svg>
  );
}

// Alias for backward compatibility
export const OverthinkerLogo = NgegameLogo;
