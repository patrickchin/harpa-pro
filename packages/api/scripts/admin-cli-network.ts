import { setDefaultResultOrder } from 'node:dns';
import { setDefaultAutoSelectFamily } from 'node:net';

/**
 * Prefer a working IPv4 route for one-off admin commands.
 *
 * Node 22 and 24 can stall their dual-stack race on networks that advertise
 * IPv6 DNS records without providing a working IPv6 route. This is scoped to
 * the short-lived CLI process; the deployed API keeps Node's runtime default.
 */
export function configureAdminCliNetwork(): void {
  setDefaultResultOrder('ipv4first');
  setDefaultAutoSelectFamily(false);
}

/** Load a network client only after the CLI-specific policy is active. */
export async function loadAfterAdminCliNetworkConfigured<T>(load: () => Promise<T>): Promise<T> {
  configureAdminCliNetwork();
  return load();
}
