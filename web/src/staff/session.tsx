import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { StaffRole, StaffUser } from '@shared/types';

/*
 * Who is signed in, and whether service has started on this screen. Service lives in memory
 * only: after a reload the browser needs a fresh tap before it may play sound again.
 */

const USER_KEY = 'urdho-staff-user';

export const ROLE_PAGES: Record<StaffRole, string[]> = {
  owner: ['orders', 'tables', 'menu', 'qr', 'team', 'settings'],
  manager: ['orders', 'tables', 'menu', 'qr'],
  waiter: ['orders', 'tables'],
};

type ChimeKind = 'order' | 'call';

interface StaffSession {
  user: StaffUser | null;
  signIn: (user: StaffUser) => void;
  signOut: () => void;
  can: (page: string) => boolean;
  service: {
    on: boolean;
    muted: boolean;
    start: () => void;
    toggleMute: () => void;
    chime: (kind: ChimeKind) => void;
  };
}

const StaffSessionContext = createContext<StaffSession | null>(null);

export function useStaff(): StaffSession {
  const value = useContext(StaffSessionContext);
  if (!value) throw new Error('useStaff must be used inside StaffSessionProvider');
  return value;
}

function readUser(): StaffUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as StaffUser) : null;
  } catch {
    return null;
  }
}

/** Two rising notes for a new order, three quick ones for a waiter call. */
function playChime(ctx: AudioContext, kind: ChimeKind) {
  const notes = kind === 'order' ? [784, 1175] : [988, 988, 988];
  const gap = kind === 'order' ? 0.16 : 0.12;
  notes.forEach((frequency, i) => {
    const start = ctx.currentTime + i * gap;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.4, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.65);
  });
}

export function StaffSessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StaffUser | null>(readUser);
  const [serviceOn, setServiceOn] = useState(false);
  const [muted, setMuted] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  const requestWakeLock = useCallback(async () => {
    try {
      wakeLock.current = (await navigator.wakeLock?.request('screen')) ?? null;
    } catch {
      // Not supported or refused (low battery): the screen may dim, sound still works.
    }
  }, []);

  // The browser drops the wake lock when the tab is hidden; take it back on return.
  useEffect(() => {
    if (!serviceOn) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void requestWakeLock();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [serviceOn, requestWakeLock]);

  const value = useMemo<StaffSession>(
    () => ({
      user,
      signIn: (next) => {
        try {
          sessionStorage.setItem(USER_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        setUser(next);
      },
      signOut: () => {
        try {
          sessionStorage.removeItem(USER_KEY);
        } catch {
          // ignore
        }
        void wakeLock.current?.release();
        setServiceOn(false);
        setUser(null);
      },
      can: (page) => (user ? ROLE_PAGES[user.role].includes(page) : false),
      service: {
        on: serviceOn,
        muted,
        // Must run inside a tap: that is what lets the browser play sound later.
        start: () => {
          audio.current ??= new AudioContext();
          void audio.current.resume();
          playChime(audio.current, 'order');
          void requestWakeLock();
          setServiceOn(true);
        },
        toggleMute: () => setMuted((m) => !m),
        chime: (kind) => {
          if (audio.current && !muted) playChime(audio.current, kind);
        },
      },
    }),
    [user, serviceOn, muted, requestWakeLock],
  );

  return <StaffSessionContext.Provider value={value}>{children}</StaffSessionContext.Provider>;
}
