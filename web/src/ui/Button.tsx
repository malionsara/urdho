import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import styles from './Button.module.css';

type Variant = 'primary' | 'dark' | 'outline' | 'ghost';
type Size = 'md' | 'lg';

interface StyleProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

function classes({ variant = 'primary', size = 'md', block }: StyleProps, extra?: string) {
  return [styles.button, styles[variant], styles[size], block && styles.block, extra]
    .filter(Boolean)
    .join(' ');
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, StyleProps {
  loading?: boolean;
  children: ReactNode;
}

export function Button({ variant, size, block, loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classes({ variant, size, block }, className)}
    >
      {loading && <span className={styles.spinner} aria-hidden />}
      {children}
    </button>
  );
}

interface ButtonLinkProps extends LinkProps, StyleProps {}

/** A link styled as a button. Like a tap on a button, it moves to the next screen with a transition. */
export function ButtonLink({ variant, size, block, className, ...rest }: ButtonLinkProps) {
  return <Link viewTransition {...rest} className={classes({ variant, size, block }, className)} />;
}
