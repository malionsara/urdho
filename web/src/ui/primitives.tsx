import { useId, useState, type ReactNode, type TextareaHTMLAttributes, type InputHTMLAttributes } from 'react';
import { transitionName } from '../lib/motion';
import { Icon, type IconName } from './Icon';
import styles from './primitives.module.css';

/* Badge ------------------------------------------------------------------ */

type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'ink' | 'saffron';

export function Badge({ tone = 'neutral', icon, children }: { tone?: BadgeTone; icon?: IconName; children: ReactNode }) {
  return (
    <span className={`${styles.badge} ${styles[`badge_${tone}`]}`}>
      {icon && <Icon name={icon} size={13} strokeWidth={2.2} />}
      {children}
    </span>
  );
}

/* Stepper ---------------------------------------------------------------- */

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  size?: 'sm' | 'md';
  decreaseLabel: string;
  increaseLabel: string;
  /** Shown instead of the minus icon when the next decrease removes the line. */
  removeIcon?: boolean;
}

export function Stepper({ value, onChange, min = 1, max = 99, size = 'md', decreaseLabel, increaseLabel, removeIcon }: StepperProps) {
  const showTrash = removeIcon && value <= 1;
  // Bump the number when it changes, not when the stepper first appears.
  const [first] = useState(value);
  return (
    <div className={`${styles.stepper} ${styles[`stepper_${size}`]}`}>
      <button
        type="button"
        className={styles.stepperButton}
        onClick={() => onChange(value - 1)}
        disabled={!removeIcon && value <= min}
        aria-label={decreaseLabel}
      >
        <Icon name={showTrash ? 'trash' : 'minus'} size={size === 'sm' ? 16 : 20} strokeWidth={2.2} />
      </button>
      <output className={styles.stepperValue} aria-live="polite">
        {/* Keyed, so each change replays the little bump. */}
        <span key={value} className={value !== first ? styles.stepperNumber : undefined}>
          {value}
        </span>
      </output>
      <button
        type="button"
        className={styles.stepperButton}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={increaseLabel}
      >
        <Icon name="plus" size={size === 'sm' ? 16 : 20} strokeWidth={2.2} />
      </button>
    </div>
  );
}

/* Fields ----------------------------------------------------------------- */

interface FieldFrameProps {
  label: string;
  optionalLabel?: string;
  hint?: string;
  children: (id: string, hintId: string | undefined) => ReactNode;
}

function FieldFrame({ label, optionalLabel, hint, children }: FieldFrameProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
        {optionalLabel && <span className={styles.fieldOptional}>{optionalLabel}</span>}
      </label>
      {children(id, hintId)}
      {hint && (
        <p id={hintId} className={styles.fieldHint}>
          {hint}
        </p>
      )}
    </div>
  );
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & Omit<FieldFrameProps, 'children'>;

export function TextField({ label, optionalLabel, hint, ...input }: TextFieldProps) {
  return (
    <FieldFrame label={label} optionalLabel={optionalLabel} hint={hint}>
      {(id, hintId) => <input id={id} aria-describedby={hintId} className={styles.input} {...input} />}
    </FieldFrame>
  );
}

type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & Omit<FieldFrameProps, 'children'>;

export function TextArea({ label, optionalLabel, hint, ...textarea }: TextAreaProps) {
  return (
    <FieldFrame label={label} optionalLabel={optionalLabel} hint={hint}>
      {(id, hintId) => (
        <textarea id={id} aria-describedby={hintId} className={`${styles.input} ${styles.textarea}`} {...textarea} />
      )}
    </FieldFrame>
  );
}

/* Notice ----------------------------------------------------------------- */

export function Notice({ tone = 'warning', icon = 'info', children }: { tone?: 'warning' | 'info'; icon?: IconName; children: ReactNode }) {
  return (
    <div className={`${styles.notice} ${styles[`notice_${tone}`]}`}>
      <Icon name={icon} size={18} />
      <p>{children}</p>
    </div>
  );
}

/* Dish image ------------------------------------------------------------- */

interface DishImageProps {
  photoUrl: string | null;
  name: string;
  variant?: 'small' | 'thumb' | 'card' | 'hero';
  muted?: boolean;
  className?: string;
  /** A view-transition-name: the photo with the same name on the next screen grows out of this one. */
  transitionName?: string;
}

const SIZES: Record<NonNullable<DishImageProps['variant']>, string> = {
  small: '64px',
  thumb: '120px',
  card: '160px',
  hero: '(max-width: 480px) 100vw, 480px',
};

/** Photos come in two sizes, name.webp (800 px) and name-400.webp, as the upload step will make them. */
function srcSetFor(url: string): string | undefined {
  return url.endsWith('.webp') ? `${url.replace(/\.webp$/, '-400.webp')} 400w, ${url} 800w` : undefined;
}

/**
 * Fades a photo in once it arrives. One the browser already holds shows at once, so a photo coming
 * back into view (or growing into the next screen) never blinks.
 */
function revealWhenLoaded(img: HTMLImageElement | null) {
  if (!img) return;
  const reveal = () => (img.dataset.loaded = '');
  if (img.complete) reveal();
  else {
    img.addEventListener('load', reveal, { once: true });
    img.addEventListener('error', reveal, { once: true });
  }
}

/** A dish photo, or, when the venue has none, a quiet kilim tile. */
export function DishImage({ photoUrl, name, variant = 'thumb', muted, className, transitionName: vtName }: DishImageProps) {
  const cls = [styles.dish, styles[`dish_${variant}`], muted && styles.dishMuted, className].filter(Boolean).join(' ');
  const style = transitionName(vtName);

  if (photoUrl && variant === 'hero') {
    // The small copy the menu already showed sits underneath, so the large photo has something to
    // fade in over, and the photo growing in from the menu card never passes through an empty frame.
    const small = srcSetFor(photoUrl) ? photoUrl.replace(/\.webp$/, '-400.webp') : photoUrl;
    return (
      <div className={`${cls} ${styles.dishHeroFrame}`} style={style}>
        <img src={small} alt="" aria-hidden className={styles.dishHeroLayer} decoding="sync" />
        <img
          key={photoUrl}
          ref={revealWhenLoaded}
          src={photoUrl}
          srcSet={srcSetFor(photoUrl)}
          sizes={SIZES.hero}
          alt={name}
          className={`${styles.dishHeroLayer} ${styles.fadeIn}`}
          loading="eager"
          decoding="async"
        />
      </div>
    );
  }
  if (photoUrl) {
    return (
      <img
        key={photoUrl}
        ref={revealWhenLoaded}
        src={photoUrl}
        srcSet={srcSetFor(photoUrl)}
        sizes={SIZES[variant]}
        alt=""
        className={`${cls} ${styles.fadeIn}`}
        style={style}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <div className={`${cls} ${styles.dishPlaceholder}`} style={style} aria-hidden>
      <svg viewBox="0 0 14 14" className={styles.dishMark}>
        <polygon points="7,0 14,7 7,14 0,7" style={{ fill: 'var(--saffron)' }} />
        <polygon points="7,4 10,7 7,10 4,7" style={{ fill: 'var(--brand)' }} />
      </svg>
    </div>
  );
}

/* Skeleton --------------------------------------------------------------- */

interface SkeletonProps {
  width?: number | string;
  height: number | string;
  radius?: number | string;
  /** Use on dark backgrounds. */
  dark?: boolean;
}

export function Skeleton({ width, height, radius, dark }: SkeletonProps) {
  return (
    <span className={`${styles.skeleton} ${dark ? styles.skeletonDark : ''}`} style={{ width, height, borderRadius: radius }} aria-hidden />
  );
}
