/**
 * Tailwind class merger used inside the shared components. Identical
 * pattern to mobile's existing primitives, just lifted out so we
 * don't import from `apps/mobile`.
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
