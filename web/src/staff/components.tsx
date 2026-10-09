import { createContext, useCallback, useContext, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { navMotion, transitionName } from '../lib/motion';
import { router } from '../router';
import type { LocalizedText, Venue } from '@shared/types';
import { localize } from '../i18n';
import { Button } from '../ui/Button';
import { Icon, type IconName } from '../ui/Icon';
import { useStaff } from './session';
import styles from './staff.module.css';

/* Navigation ------------------------------------------------------------------ */

const NAV: { page: string; icon: IconName }[] = [
  { page: 'orders', icon: 'receipt' },
  { page: 'tables', icon: 'grid' },
  { page: 'menu', icon: 'book' },
  { page: 'qr', icon: 'qr' },
  { page: 'team', icon: 'users' },
  { page: 'settings', icon: 'sliders' },
];

/**
 * Switches dashboard page with a quick cross-fade. The dashboard's pages are nested routes, and
 * React Router drops the view-transition option on their links, so the click goes to the router
 * itself. Opening in a new tab (middle click, Ctrl or Cmd) still works as a normal link.
 */
function swapPage(to: string) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void router.navigate(to, { viewTransition: true, state: navMotion('swap') });
  };
}

export function Rail({ venue, badges }: { venue: Venue | undefined; badges: Partial<Record<string, number>> }) {
  const { t } = useTranslation();
  const { user, can, signOut, service } = useStaff();
  const initials = (venue?.name ?? '')
    .split(/[\s&]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toLocaleUpperCase('sq');

  return (
    <nav className={styles.rail} aria-label={t('staff.nav.label')} style={transitionName('staff-rail')}>
      <div className={styles.railVenue} title={venue?.name}>
        {venue?.logoUrl ? <img src={venue.logoUrl} alt="" /> : <span>{initials}</span>}
      </div>
      <ul className={styles.railNav}>
        {NAV.filter((n) => can(n.page)).map((n) => (
          <li key={n.page}>
            <NavLink to={`/staff/${n.page}`} className={styles.railLink} onClick={swapPage(`/staff/${n.page}`)}>
              <span className={styles.railIcon}>
                <Icon name={n.icon} size={22} />
                {badges[n.page] ? <span className={styles.railBadge}>{badges[n.page]}</span> : null}
              </span>
              <span className={styles.railLabel}>{t(`staff.nav.${n.page}`)}</span>
            </NavLink>
          </li>
        ))}
      </ul>
      <div className={styles.railFoot}>
        {service.on && (
          <button
            type="button"
            className={styles.railLink}
            onClick={service.toggleMute}
            aria-pressed={!service.muted}
            aria-label={service.muted ? t('staff.nav.soundOff') : t('staff.nav.soundOn')}
          >
            <span className={styles.railIcon}>
              <Icon name={service.muted ? 'volumeOff' : 'volume'} size={22} />
            </span>
            <span className={styles.railLabel}>{service.muted ? t('staff.nav.muted') : t('staff.nav.sound')}</span>
          </button>
        )}
        <button type="button" className={styles.railLink} onClick={signOut}>
          <span className={styles.railAvatar} aria-hidden>
            {user?.name
              .split(' ')
              .map((w) => w[0])
              .join('')
              .slice(0, 2)}
          </span>
          <span className={styles.railLabel}>{t('staff.nav.logout')}</span>
        </button>
      </div>
    </nav>
  );
}

export function PageHeader({ title, meta, actions }: { title: string; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageTitleRow}>
        <h1 className={styles.pageTitle}>{title}</h1>
        {meta}
      </div>
      {actions && <div className={styles.pageActions}>{actions}</div>}
    </header>
  );
}

/* Switch ---------------------------------------------------------------------- */

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={styles.switch}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    >
      <span className={styles.switchThumb} />
    </button>
  );
}

/* Dialogs --------------------------------------------------------------------- */

function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, [onClose]);
  return ref;
}

interface ConfirmProps {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel, tone = 'primary', busy, onConfirm, onClose }: ConfirmProps) {
  const ref = useDialog(open, onClose);
  return (
    <dialog ref={ref} className={styles.dialog} onClick={(e) => e.target === ref.current && onClose()}>
      <div className={styles.dialogBody}>
        <h2 className={styles.dialogTitle}>{title}</h2>
        {body && <div className={styles.dialogText}>{body}</div>}
        <div className={styles.dialogActions}>
          <Button variant="outline" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'dark' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

/** A panel that slides in from the right on tablets and up from the bottom on phones. */
export function Sheet({ open, title, onClose, children, footer }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const { t } = useTranslation();
  const ref = useDialog(open, onClose);
  return (
    <dialog ref={ref} className={styles.sheet} onClick={(e) => e.target === ref.current && onClose()}>
      <div className={styles.sheetInner}>
        <header className={styles.sheetHeader}>
          <h2 className={styles.sheetTitle}>{title}</h2>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label={t('common.close')}>
            <Icon name="close" size={20} strokeWidth={2.4} />
          </button>
        </header>
        <div className={styles.sheetContent}>{children}</div>
        {footer && <footer className={styles.sheetFooter}>{footer}</footer>}
      </div>
    </dialog>
  );
}

/* Toast ----------------------------------------------------------------------- */

const ToastContext = createContext<(message: string) => void>(() => {});

export const useStaffToast = () => useContext(ToastContext);

export function StaffToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((message: string) => {
    setToast((current) => ({ id: (current?.id ?? 0) + 1, message }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={styles.toastRegion} aria-live="polite">
        {toast && (
          <div key={toast.id} className={styles.toast}>
            <span className={styles.toastIcon}>
              <Icon name="check" size={14} strokeWidth={3.2} />
            </span>
            {toast.message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

/* Time ------------------------------------------------------------------------ */

/** The current time, refreshed every `everyMs`, for "3 min ago" labels and the clock. */
export function useNow(everyMs = 15_000): number {
  const [time, setTime] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setTime(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return time;
}

export function useElapsed() {
  const { t } = useTranslation();
  return (iso: string, nowMs: number) => {
    const minutes = Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 60_000));
    if (minutes < 1) return t('staff.time.justNow');
    if (minutes < 60) return t('staff.time.minutes', { count: minutes });
    return t('staff.time.hours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
  };
}

/** Menu texts for staff: in the dashboard language, falling back to the venue default. */
export function useStaffText(venue: Venue | undefined) {
  const { i18n } = useTranslation();
  return (text: LocalizedText) => localize(text, i18n.language as Venue['defaultLanguage'], venue?.defaultLanguage ?? 'sq');
}

export function clockTime(nowMs: number, lang: string) {
  return new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(nowMs);
}
