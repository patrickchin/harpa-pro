import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Conditional class joiner with Tailwind conflict resolution. Mirrors
 * the canonical port source's `lib/utils.ts` so primitives copy across
 * verbatim.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
