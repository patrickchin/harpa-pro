import { env } from '../env.js';

export function backgroundMaintenanceEnabled(): boolean {
  return env.BACKGROUND_MAINTENANCE_ENABLED === '1';
}
