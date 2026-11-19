interface BrandIconProps {
  className?: string;
}

/**
 * Logo resmi OBS Studio dengan cincin adaptif agar tetap terlihat jelas pada tema gelap maupun terang.
 */
export function ObsLogo({ className = 'h-5 w-5' }: BrandIconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-label="OBS Studio">
      <circle cx="32" cy="32" r="30" fill="#1E232E" stroke="#64748B" strokeWidth="2.5" />
      <path
        d="M32 10C22.4 10 14.7 17.3 13.7 26.6C16.8 23.4 21.4 22.1 25.9 23.6C23.1 19.6 24.7 13.6 32 10Z"
        fill="#F8FAFC"
      />
      <path
        d="M12.9 43C17.7 51.3 27.9 54.6 36.4 50.8C32.1 49.7 28.7 46.4 27.7 41.8C25.6 46.2 19.6 47.8 12.9 43Z"
        fill="#F8FAFC"
      />
      <path
        d="M51.1 43C55.9 34.7 53.6 24.2 46 18.8C47.2 23.1 46.1 27.7 42.6 30.8C47.5 30.4 51.9 34.9 51.1 43Z"
        fill="#F8FAFC"
      />
      <circle cx="32" cy="32" r="5.5" fill="#F8FAFC" />
    </svg>
  );
}

/**
 * Logo resmi Steam dengan kontras adaptif untuk tema gelap dan terang.
 */
export function SteamLogo({ className = 'h-5 w-5' }: BrandIconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-label="Steam">
      <defs>
        <linearGradient id="steamGrad" x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1B2838" />
          <stop offset="100%" stopColor="#1A9FFF" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#steamGrad)" stroke="#475569" strokeWidth="2" />
      <circle cx="42" cy="22" r="7.5" stroke="#FFFFFF" strokeWidth="3.5" />
      <circle cx="42" cy="22" r="3" fill="#FFFFFF" />
      <path
        d="M11 38.5L23.5 43.8C26.5 45.1 30 43.7 31.3 40.7C32.6 37.7 31.2 34.2 28.2 32.9L16 27.8"
        stroke="#FFFFFF"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path d="M27.5 34.5L36.5 25.5" stroke="#FFFFFF" strokeWidth="5.5" strokeLinecap="round" />
      <circle cx="26" cy="38.5" r="4.5" fill="#1B2838" stroke="#FFFFFF" strokeWidth="2.5" />
    </svg>
  );
}

/**
 * Logo resmi YouTube.
 */
export function YouTubeLogo({ className = 'h-4 w-6' }: BrandIconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 64 46" fill="none" className={className} aria-label="YouTube">
      <rect x="2" y="2" width="60" height="42" rx="12" fill="#FF0000" />
      <path d="M26 14.5L43 23L26 31.5V14.5Z" fill="#FFFFFF" />
    </svg>
  );
}

/**
 * Logo resmi Twitch.
 */
export function TwitchLogo({ className = 'h-5 w-5' }: BrandIconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-label="Twitch">
      <path d="M12 8H56V38L44 50H34L26 58V50H16V16L12 8Z" fill="#9146FF" />
      <path d="M18 13H51V36L42 45H32L25 52V45H18V13Z" fill="#FFFFFF" />
      <rect x="30" y="21" width="4.5" height="12" rx="1" fill="#9146FF" />
      <rect x="41" y="21" width="4.5" height="12" rx="1" fill="#9146FF" />
    </svg>
  );
}
