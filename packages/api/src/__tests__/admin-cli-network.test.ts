import { afterEach, describe, expect, it } from 'vitest';
import {
  getDefaultAutoSelectFamily,
  setDefaultAutoSelectFamily,
} from 'node:net';
import { configureAdminCliNetwork } from '../../scripts/admin-cli-network.js';

const originalAutoSelectFamily = getDefaultAutoSelectFamily();

describe('administrator provisioning CLI network setup', () => {
  afterEach(() => {
    setDefaultAutoSelectFamily(originalAutoSelectFamily);
  });

  it('avoids the Node 22/24 dual-stack connection path that stalls on unreachable IPv6', () => {
    setDefaultAutoSelectFamily(true);

    configureAdminCliNetwork();

    expect(getDefaultAutoSelectFamily()).toBe(false);
  });
});
