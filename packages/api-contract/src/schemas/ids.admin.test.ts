import { describe, expect, it } from 'vitest';
import { ID_SPEC, adminIdentityId, adminSessionId } from './ids.js';

describe('admin identity IDs', () => {
  it('defines distinct identity and session prefixes', () => {
    expect(ID_SPEC.adm.brand).toBe('AdminIdentityId');
    expect(ID_SPEC.ads.brand).toBe('AdminSessionId');
    expect(adminIdentityId.parse('adm_0123456789ab')).toBe('adm_0123456789ab');
    expect(adminSessionId.parse('ads_0123456789ab')).toBe('ads_0123456789ab');
  });

  it('does not accept app user or app session IDs at the admin boundary', () => {
    expect(adminIdentityId.safeParse('usr_0123456789ab').success).toBe(false);
    expect(adminSessionId.safeParse('ses_0123456789ab').success).toBe(false);
  });
});
