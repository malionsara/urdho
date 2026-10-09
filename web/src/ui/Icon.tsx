const PATHS = {
  back: 'M15 18l-6-6 6-6',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  bell: 'M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.5v.01',
  trash: 'M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13',
  pencil: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  cash: 'M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM6.5 9.5v.01M17.5 14.5v.01',
  card: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 10h18M7 15h3',
  leaf: 'M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19l7-7',
  chili: 'M15 7c2.8.3 4.5 2.4 4 5.4C18.2 17.3 12.6 20.6 5 20c4.4-2.6 5.7-6.4 6.2-9.4C11.6 8.2 13 6.8 15 7zM15 7c0-2 1-3.2 3-3.5',
  sparkle: 'M12 3l1.8 5.6L19.5 10.5l-5.7 1.9L12 18l-1.8-5.6-5.7-1.9 5.7-1.9z',
  bag: 'M5.5 8h13l-1 12.5h-11zM9 8V6.5a3 3 0 0 1 6 0V8',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
  pot: 'M4 11h16v2.5a6.5 6.5 0 0 1-6.5 6.5h-3A6.5 6.5 0 0 1 4 13.5zM2.5 11h19M9 7.5c0-1.2 1-1.3 1-2.5M14 7.5c0-1.2 1-1.3 1-2.5',
  cloche: 'M3 18.5h18M4.5 18.5a7.5 7.5 0 0 1 15 0M12 11V8.5M10.5 8.5h3',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.5 12h17M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18',
  wifiOff: 'M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.6M19 13a10 10 0 0 0-3-2M2 9.5a15 15 0 0 1 4.5-2.9M22 9.5A15 15 0 0 0 11 6M12 20h.01',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5V5.5M20 18v3H6.5M8 7.5h8M8 11h5',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2.5 21v-1a6 6 0 0 1 6-6h1a6 6 0 0 1 6 6v1M16 3.5a4 4 0 0 1 0 7.5M21.5 21v-1a5 5 0 0 0-3.5-4.8',
  sliders: 'M4 7h9M17 7h3M15 5v4M4 17h3M11 17h9M9 15v4',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11',
  volume: 'M4 9.5v5h3.5L13 19V5L7.5 9.5zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  volumeOff: 'M4 9.5v5h3.5L13 19V5L7.5 9.5zM17 9.5l5 5M22 9.5l-5 5',
  image: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 16l5-5 4 4 3-3 6 6M15.5 9.5v.01',
  printer: 'M7 9V3h10v6M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v7H7z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4.5V11h-6.5',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  utensils: 'M7 3v8M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10M17.5 3C15.5 5 14.5 7.5 14.5 11h3v10',
  mail: 'M3.5 6h17v12h-17zM3.5 7l8.5 6 8.5-6',
  chat: 'M20.5 12a8.5 8.5 0 0 1-12.4 7.5L3.5 20.5l1-4.4A8.5 8.5 0 1 1 20.5 12zM8.5 12h.01M12 12h.01M15.5 12h.01',
  lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Leave empty for decorative icons; they are hidden from screen readers. */
  label?: string;
}

export function Icon({ name, size = 20, strokeWidth = 1.9, className, label }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
