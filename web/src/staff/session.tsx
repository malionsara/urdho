import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { StaffRole } from '@shared/types';
import { isApiError } from '../lib/http';
import { logout, type StaffMe } from './api';
import { ME_KEY, useMeQuery } from './queries';

/*
 * Who is signed in (from the session cookie, via /api/staff/me) and whether service has started on
 * this screen. Service lives in memory only: after a reload the browser needs a fresh tap before it
 * may play sound again, and the same goes when the browser silenced the page while the screen was off.
 */

export const ROLE_PAGES: Record<StaffRole, string[]> = {
  owner: ['start', 'orders', 'tables', 'menu', 'qr', 'team', 'settings'],
  manager: ['orders', 'tables', 'menu', 'qr'],
  waiter: ['orders', 'tables'],
};

type ChimeKind = 'order' | 'call';

interface StaffSession {
  user: StaffMe['user'] | null;
  /** True until we know whether this device is signed in. */
  loading: boolean;
  signIn: (me: StaffMe) => void;
  signOut: () => Promise<void>;
  passwordChanged: () => void;
  can: (page: string) => boolean;
  service: {
    on: boolean;
    muted: boolean;
    start: () => void;
    toggleMute: () => void;
    chime: (kind: ChimeKind) => void;
    /** Whether to hold the screen on during service: off once the venue is closed and settled. */
    keepAwake: (on: boolean) => void;
  };
}

const StaffSessionContext = createContext<StaffSession | null>(null);

export function useStaff(): StaffSession {
  const value = useContext(StaffSessionContext);
  if (!value) throw new Error('useStaff must be used inside StaffSessionProvider');
  return value;
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
  const queryClient = useQueryClient();
  const me = useMeQuery();
  const [serviceOn, setServiceOn] = useState(false);
  const [muted, setMuted] = useState(false);
  const [awake, setAwake] = useState(true);
  const audio = useRef<AudioContext | null>(null);
  const user = me.data?.user ?? null;

  /** Forgets who is signed in on this device, which sends every page back to the login screen. */
  const forgetDevice = useCallback(() => {
    setServiceOn(false);
    // The account first: removing it from under the screens watching it would leave them stuck.
    queryClient.setQueryData(ME_KEY, null);
    queryClient.removeQueries({ queryKey: ['staff'], predicate: (q) => q.queryKey[1] !== 'me' });
  }, [queryClient]);

  // Signed out somewhere else (account removed, session ended on the server): the first refusal
  // from the API sends this device to the login screen, instead of leaving it showing errors.
  useEffect(() => {
    const onError = (error: unknown) => {
      if (isApiError(error, 'unauthorized')) setTimeout(forgetDevice, 0);
    };
    const stopQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error' && event.query.queryKey[0] === 'staff') onError(event.action.error);
    });
    const stopMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') onError(event.action.error);
    });
    return () => {
      stopQueries();
      stopMutations();
    };
  }, [queryClient, forgetDevice]);

  // The screen stays on through service, and may sleep once the venue is closed and settled. The
  // browser drops the lock whenever the tab is hidden, so it's taken back on return.
  useEffect(() => {
    if (!serviceOn || !awake) return;
    let lock: WakeLockSentinel | null = null;
    let asking = false;
    let stopped = false;
    const request = async () => {
      if (asking || (lock && !lock.released)) return;
      asking = true;
      try {
        lock = (await navigator.wakeLock?.request('screen')) ?? null;
        if (stopped) void lock?.release();
      } catch {
        // Not supported or refused (low battery): the screen may dim, sound still works.
      } finally {
        asking = false;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [serviceOn, awake]);

  // Back from a locked screen, some browsers (iPhones and iPads) keep the sound switched off until
  // the next tap. Then the board shows "Start service" again rather than staying silent.
  useEffect(() => {
    if (!serviceOn) return;
    const onVisible = async () => {
      const ctx = audio.current;
      if (document.visibilityState !== 'visible' || !ctx || ctx.state === 'running') return;
      await Promise.race([ctx.resume(), new Promise((resolve) => setTimeout(resolve, 1000))]);
      if ((ctx.state as string) !== 'running') setServiceOn(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [serviceOn]);

  const value = useMemo<StaffSession>(
    () => ({
      user,
      loading: me.isPending,
      signIn: (next) => queryClient.setQueryData(ME_KEY, next),
      signOut: async () => {
        try {
          await logout();
        } catch {
          // Already signed out on the server, or offline: forget this device's session either way.
        }
        forgetDevice();
      },
      passwordChanged: () =>
        queryClient.setQueryData<StaffMe | null>(ME_KEY, (old) => (old ? { ...old, user: { ...old.user, mustChangePassword: false } } : old)),
      can: (page) => (user ? ROLE_PAGES[user.role].includes(page) : false),
      service: {
        on: serviceOn,
        muted,
        // Must run inside a tap: that is what lets the browser play sound later.
        start: () => {
          audio.current ??= new AudioContext();
          void audio.current.resume();
          playChime(audio.current, 'order');
          setServiceOn(true);
        },
        toggleMute: () => setMuted((m) => !m),
        chime: (kind) => {
          if (audio.current && !muted) playChime(audio.current, kind);
        },
        keepAwake: setAwake,
      },
    }),
    [user, me.isPending, queryClient, serviceOn, muted, forgetDevice],
  );

  return <StaffSessionContext.Provider value={value}>{children}</StaffSessionContext.Provider>;
}
