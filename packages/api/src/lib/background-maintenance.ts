import { env } from '../env.js';

/** Default for best-effort database housekeeping while Harpa has no users. */
export const LOW_TRAFFIC_MAINTENANCE_INTERVAL_MS = 24 * 60 * 60_000;

export function backgroundMaintenanceEnabled(): boolean {
  return env.BACKGROUND_MAINTENANCE_ENABLED === '1';
}
