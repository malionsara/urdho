import { useLayoutEffect, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { useLocation, useNavigationType } from 'react-router';

/*
 * Motion helpers. Screen changes use React Router's viewTransition (on <Link> and navigate());
 * the CSS for them is in styles/global.css.
 */

/** How a screen change should move: forward slides left, back slides right, swap cross-fades. */
export type NavMotion = 'forward' | 'back' | 'swap';

/** Link state that makes a forward navigation move like going back (a "back" arrow) or cross-fade. */
export const navMotion = (motion: NavMotion) => ({ motion });

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Applies a state change inside a View Transition, so elements with a view-transition-name glide
 * to where the change puts them: basket lines closing up, an order card moving to its next column.
 * Instant where the browser can't animate it, or when the person asked for less motion.
 */
export function animateChange(update: () => void) {
  if (typeof document === 'undefined' || !document.startViewTransition || reducedMotion()) {
    update();
    return;
  }
  // Not a screen change: the page stays where it is and only the named pieces move.
  document.documentElement.dataset.nav = 'change';
  document.startViewTransition(async () => {
    flushSync(update);
    // TanStack Query hands changes to React a moment later; let them land before the new picture.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Names an element for View Transitions, so it moves as one piece between two states. */
export function transitionName(name: string | undefined, className?: string): CSSProperties | undefined {
  if (!name) return undefined;
  return { viewTransitionName: name, ...(className ? { viewTransitionClass: className } : {}) } as CSSProperties;
}

/** Tells the screen-change CSS which way this navigation goes (data-nav on <html>). */
export function useNavMotion() {
  const type = useNavigationType();
  const location = useLocation();
  const requested = (location.state as { motion?: NavMotion } | null)?.motion;
  const motion: NavMotion = type === 'POP' ? 'back' : (requested ?? 'forward');
  // A layout effect, so the direction is set before the browser animates the new screen.
  useLayoutEffect(() => {
    document.documentElement.dataset.nav = motion;
  }, [motion, location.key]);
}
