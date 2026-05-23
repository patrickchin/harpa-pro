/**
 * Re-exports the shared event taxonomy so mobile screens can
 *   import { MOBILE_EVENTS } from '@/lib/analytics/events';
 *
 * without depending on the workspace path. Same names as the API +
 * marketing site — funnels stitch without manual mapping.
 */
export {
  MOBILE_EVENTS,
  type EventName,
  type EventMap,
} from '@harpa/analytics-events';
