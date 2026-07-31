import { setDefaultAutoSelectFamily } from 'node:net';

/**
 * Keep one-off admin commands on the operating system's preferred address.
 *
 * Node 22 and 24 can stall their dual-stack race on networks that advertise
 * IPv6 DNS records without providing a working IPv6 route. This is scoped to
 * the short-lived CLI process; the deployed API keeps Node's runtime default.
 */
export function configureAdminCliNetwork(): void {
  setDefaultAutoSelectFamily(false);
}
