import { useId } from 'react';

/*
 * A strip of Albanian kilim-style geometry: sawtooth edges and stacked diamonds.
 * It picks up the venue's brand colour, so every restaurant gets its own version.
 */

type Variant = 'brand' | 'ink';

const COLOURS: Record<Variant, { ground: string; teeth: string; diamond: string; core: string; side: string }> = {
  brand: { ground: 'var(--brand)', teeth: 'var(--ink)', diamond: 'var(--saffron)', core: 'var(--brand)', side: 'var(--cream)' },
  ink: { ground: 'var(--ink)', teeth: 'var(--brand)', diamond: 'var(--saffron)', core: 'var(--ink)', side: 'var(--cream)' },
};

export function KilimBand({ height = 24, variant = 'brand', className }: { height?: number; variant?: Variant; className?: string }) {
  const id = useId().replace(/:/g, '');
  const c = COLOURS[variant];
  const scale = height / 24;
  return (
    <svg className={className} width="100%" height={height} aria-hidden focusable="false" style={{ display: 'block' }}>
      <defs>
        <pattern id={`kilim-${id}`} width={32 * scale} height={height} patternUnits="userSpaceOnUse">
          <g transform={`scale(${scale})`}>
            <rect width="32" height="24" style={{ fill: c.ground }} />
            <polygon points="0,0 8,7 16,0 24,7 32,0" style={{ fill: c.teeth }} />
            <polygon points="0,24 8,17 16,24 24,17 32,24" style={{ fill: c.teeth }} />
            <polygon points="16,5 23,12 16,19 9,12" style={{ fill: c.diamond }} />
            <polygon points="16,9 19,12 16,15 13,12" style={{ fill: c.core }} />
            <polygon points="0,8 4,12 0,16" style={{ fill: c.side }} />
            <polygon points="32,8 28,12 32,16" style={{ fill: c.side }} />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height={height} fill={`url(#kilim-${id})`} />
    </svg>
  );
}

/** A single kilim diamond, used as a bullet before section titles. */
export function KilimDiamond({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden focusable="false">
      <polygon points="7,0 14,7 7,14 0,7" style={{ fill: 'var(--saffron)' }} />
      <polygon points="7,4 10,7 7,10 4,7" style={{ fill: 'var(--brand)' }} />
    </svg>
  );
}
