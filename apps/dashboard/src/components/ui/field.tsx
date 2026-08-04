import {
  forwardRef,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import { cn } from '@/lib/cn';

export const controlClassName =
  'min-h-11 w-full rounded-control-ui border border-input bg-card px-4 py-2.5 text-body font-normal tracking-normal text-foreground normal-case shadow-raised-ui placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted-disabled disabled:shadow-none';

export const labelClassName =
  'flex flex-col gap-2 text-foreground';

interface FieldProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children: ReactNode;
  error?: string;
  label: string;
  optional?: boolean;
}

export function Field({
  children,
  className,
  error,
  label,
  optional = false,
  ...props
}: FieldProps): React.JSX.Element {
  return (
    <label className={cn(labelClassName, className)} {...props}>
      <span className="text-label text-muted-foreground">
        {label}
        {optional ? (
          <span className="ml-1 text-meta font-medium normal-case tracking-normal text-muted-foreground">
            Optional
          </span>
        ) : null}
      </span>
      {children}
      {error ? (
        <span className="text-meta font-medium normal-case tracking-normal text-danger-text" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input className={cn(controlClassName, className)} ref={ref} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return <select className={cn(controlClassName, className)} ref={ref} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        className={cn(controlClassName, 'min-h-28 resize-y leading-6', className)}
        ref={ref}
        {...props}
      />
    );
  },
);
