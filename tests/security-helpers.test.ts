import { describe, expect, it, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = 'test-secret-for-vitest-only';
  process.env.STUDIO_PASSWORD = 'test-password';
});

describe('portal session cookie', () => {
  it('is valid only for the artist it was issued for', async () => {
    const { createPortalSessionToken, verifyPortalSessionToken } = await import('@/lib/studioAuth');
    const token = createPortalSessionToken('artistA')!;
    expect(verifyPortalSessionToken(token, 'artistA')).toBe(true);
    expect(verifyPortalSessionToken(token, 'artistB')).toBe(false);
    expect(verifyPortalSessionToken(`${token}x`, 'artistA')).toBe(false);
    expect(verifyPortalSessionToken(undefined, 'artistA')).toBe(false);
  });

  it('expires after its max age', async () => {
    const { verifyPortalSessionToken, PORTAL_SESSION_MAX_AGE_SECONDS } = await import('@/lib/studioAuth');
    const { createHmac } = await import('node:crypto');
    const old = String(Date.now() - (PORTAL_SESSION_MAX_AGE_SECONDS + 60) * 1000);
    const sig = createHmac('sha256', process.env.BETTER_AUTH_SECRET!).update(`portal-session:${old}:artistA`).digest('base64url');
    expect(verifyPortalSessionToken(`${old}.${sig}`, 'artistA')).toBe(false);
  });
});

describe('secretMatches', () => {
  it('needs a configured secret and an exact match', async () => {
    const { secretMatches } = await import('@/lib/studioAuth');
    expect(secretMatches('abc', 'abc')).toBe(true);
    expect(secretMatches('abd', 'abc')).toBe(false);
    expect(secretMatches('', '')).toBe(false);
    expect(secretMatches('abc', undefined)).toBe(false);
    expect(secretMatches(null, 'abc')).toBe(false);
  });
});

describe('studio password', () => {
  it('compares against the server-side password only', async () => {
    const { checkStudioPassword } = await import('@/lib/studioAuth');
    expect(checkStudioPassword('test-password')).toBe(true);
    expect(checkStudioPassword('wrong')).toBe(false);
    expect(checkStudioPassword(undefined)).toBe(false);
  });
});

describe('Drive queries', () => {
  it('escapes quotes and backslashes', async () => {
    const { escapeDriveQuery } = await import('@/lib/drive');
    expect(escapeDriveQuery(String.raw`a'b\c`)).toBe(String.raw`a\'b\\c`);
    expect(escapeDriveQuery('1AbC_x-9')).toBe('1AbC_x-9');
  });

  it('accepts only Drive-shaped ids', async () => {
    const { isDriveId } = await import('@/lib/driveScope');
    expect(isDriveId('1AbCdEfGhIjKlMnOpQrStUvWxYz012345')).toBe(true);
    expect(isDriveId("x' in parents or name='a")).toBe(false);
    expect(isDriveId('../etc')).toBe(false);
    expect(isDriveId(undefined)).toBe(false);
  });
});
