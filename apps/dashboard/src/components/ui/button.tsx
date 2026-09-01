import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export type ButtonVariant =
  | 'primary'
  | 'hero'
  | 'secondary'
  | 'outline'
  | 'quiet'
  | 'destructive'
  | 'danger-solid';

export type ButtonSize = 'default' | 'small' | 'large' | 'icon';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'border-primary bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80',
  hero: 'border-accent bg-accent text-accent-foreground hover:bg-accent/90 active:bg-accent/80',
  secondary:
    'border-border bg-card text-foreground shadow-raised-ui hover:bg-surface-emphasis active:bg-surface-muted',
  outline: 'border-border bg-transparent text-foreground hover:bg-surface-muted',
  quiet:
    'border-transparent bg-transparent text-muted-foreground hover:bg-surface-muted hover:text-foreground',
  destructive:
    'border-danger-border bg-danger-soft text-danger-text hover:bg-danger-soft/70 active:bg-danger-soft/55',
  'danger-solid':
    'border-danger bg-danger text-destructive-foreground hover:bg-danger/90 active:bg-danger/80',
};

const sizeClasses: Record<ButtonSize, string> = {
  default: 'min-h-11 px-4 py-2.5 text-base',
  small: 'min-h-11 px-3 py-2 text-sm',
  large: 'min-h-13 px-5 py-3 text-base',
  icon: 'size-11 p-0',
};

export function buttonStyles({
  className,
  size = 'default',
  variant = 'primary',
}: {
  className?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
} = {}): string {
  return cn(
    'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-control-ui border font-semibold leading-none no-underline transition-colors disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
    variantClasses[variant],
    sizeClasses[size],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ButtonSize;
  variant?: ButtonVariant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, size, type = 'button', variant, ...props },
  ref,
) {
  return (
    <button
      className={buttonStyles({ className, size, variant })}
      ref={ref}
      type={type}
      {...props}
    />
  );
});
