interface BrandIconProps {
  className?: string;
}

/**
 * Logo resmi OBS Studio (Simple Icons) dengan warna adaptif terhadap tema gelap dan terang.
 */
export function ObsLogo({ className = 'h-5 w-5' }: BrandIconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-label="OBS Studio"
    >
      <path d="M12 24C5.383 24 0 18.617 0 12S5.383 0 12 0s12 5.383 12 12-5.383 12-12 12m0-22.891C5.995 1.109 1.11 5.995 1.11 12S5.995 22.89 12 22.89 22.89 18.005 22.89 12 18.005 1.109 12 1.109M6.182 5.99c.352-1.698 1.503-3.229 3.05-3.996-.269.273-.595.483-.844.78-1.02 1.1-1.48 2.692-1.199 4.156.355 2.235 2.455 4.06 4.732 4.028 1.765.079 3.485-.937 4.348-2.468 1.848.063 3.645 1.017 4.7 2.548.54.799.962 1.736.991 2.711-.342-1.295-1.202-2.446-2.375-3.095a4.9 4.9 0 0 0-3.772-.425c-1.56.448-2.849 1.723-3.293 3.293-.377 1.25-.216 2.628.377 3.772-.825 1.429-2.315 2.449-3.932 2.756-1.244.261-2.551.059-3.709-.464 1.036.302 2.161.355 3.191-.011a4.91 4.91 0 0 0 3.024-2.935c.556-1.49.345-3.261-.591-4.54-.7-1.007-1.803-1.717-3.002-1.969-.38-.068-.764-.098-1.148-.134-.611-1.231-.834-2.66-.528-3.996z" />
    </svg>
  );
}

/**
 * Logo resmi Steam (Simple Icons) dengan latar putih di dalam agar kontras di tema gelap maupun terang.
 */
export function SteamLogo({ className = 'h-5 w-5' }: BrandIconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-label="Steam">
      <defs>
        <linearGradient id="steamBrandGrad" x1="12" y1="0" x2="12" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#171D25" />
          <stop offset="100%" stopColor="#1A9FFF" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10.5" fill="#FFFFFF" />
      <path
        fill="url(#steamBrandGrad)"
        d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658a3.4 3.4 0 0 1 1.912-.59q.094.001.188.006l2.861-4.142V8.91a4.53 4.53 0 0 1 4.524-4.524c2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911l.004.159a3.39 3.39 0 0 1-3.39 3.396a3.41 3.41 0 0 1-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0M7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25a2.551 2.551 0 0 0 3.337-3.324a2.547 2.547 0 0 0-3.255-1.413l1.523.63a1.878 1.878 0 0 1-1.445 3.467zm11.415-9.303a3.02 3.02 0 0 0-3.015-3.015a3.015 3.015 0 1 0 3.015 3.015m-5.273-.005a2.264 2.264 0 1 1 4.531 0a2.267 2.267 0 0 1-2.266 2.265a2.264 2.264 0 0 1-2.265-2.265"
      />
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
