import { afterEach, describe, expect, it } from 'vitest';
import { getDefaultResultOrder, setDefaultResultOrder } from 'node:dns';
import { getDefaultAutoSelectFamily, setDefaultAutoSelectFamily } from 'node:net';
import {
  configureAdminCliNetwork,
  loadAfterAdminCliNetworkConfigured,
} from '../../scripts/admin-cli-network.js';

const originalAutoSelectFamily = getDefaultAutoSelectFamily();
const originalResultOrder = getDefaultResultOrder();

describe('administrator provisioning CLI network setup', () => {
  afterEach(() => {
    setDefaultAutoSelectFamily(originalAutoSelectFamily);
    setDefaultResultOrder(originalResultOrder);
  });

  it('uses IPv4 first without Node 22/24 dual-stack address racing', () => {
    setDefaultAutoSelectFamily(true);
    setDefaultResultOrder('verbatim');

    configureAdminCliNetwork();

    expect(getDefaultAutoSelectFamily()).toBe(false);
    expect(getDefaultResultOrder()).toBe('ipv4first');
  });

  it('applies the network policy before loading the database client', async () => {
    setDefaultAutoSelectFamily(true);
    setDefaultResultOrder('verbatim');

    const observed = await loadAfterAdminCliNetworkConfigured(async () => ({
      autoSelectFamily: getDefaultAutoSelectFamily(),
      resultOrder: getDefaultResultOrder(),
    }));

    expect(observed).toEqual({
      autoSelectFamily: false,
      resultOrder: 'ipv4first',
    });
  });
});
