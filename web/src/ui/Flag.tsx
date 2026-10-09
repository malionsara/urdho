import { useId } from 'react';

/*
 * Round flags for the language switch. Drawn here rather than as emoji, which Windows shows as two
 * plain letters. Albanian: the black double-headed eagle on red. English: the Union Jack.
 */

const EAGLE =
  'M32 56L30 51L26 54L27 49L23 50L26 44L23 41L16 41L18 38L12 36L15 33L9 31L13 28L7 25L11 22L6 17L25 26L23 21L19 20L15 19L18 16L21 13L25 11L28 13L28 19L32 26' +
  'L36 19L36 13L39 11L43 13L46 16L49 19L45 20L41 21L39 26L58 17L53 22L57 25L51 28L55 31L49 33L52 36L46 38L48 41L41 41L38 44L41 50L37 49L38 54L34 51Z';

export function Flag({ lang, size = 18 }: { lang: 'sq' | 'en'; size?: number }) {
  const clip = `flag-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden focusable="false" style={{ flex: 'none' }}>
      <defs>
        <clipPath id={clip}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        {lang === 'sq' ? (
          <>
            <rect width="64" height="64" fill="#e41e20" />
            <path d={EAGLE} fill="#000" />
          </>
        ) : (
          <>
            <rect width="64" height="64" fill="#012169" />
            <path d="M0 0L64 64M64 0L0 64" stroke="#fff" strokeWidth="13" />
            <path d="M0 0L64 64M64 0L0 64" stroke="#c8102e" strokeWidth="5" />
            <path d="M32 0V64M0 32H64" stroke="#fff" strokeWidth="20" />
            <path d="M32 0V64M0 32H64" stroke="#c8102e" strokeWidth="11" />
          </>
        )}
      </g>
    </svg>
  );
}
