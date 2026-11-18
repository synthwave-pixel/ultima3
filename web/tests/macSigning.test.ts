// web/tests/macSigning.test.ts
import { describe, expect, it } from 'vitest';
import { macBuildConfig } from '../../desktop/macSigning.cjs';

/** The Mac build's settings, signed or not (desktop/macSigning.cjs), as dist.cjs hands them to electron-builder. */
describe('the Mac build signed', () => {
  const build = { appId: 'x', mac: { identity: '-', hardenedRuntime: false, category: 'games' } };
  const SIGNING = { CSC_LINK: 'base64-p12', MACOS_SIGNING_IDENTITY: 'Developer ID Application: Someone (ABCDE12345)' };

  it('signs ad hoc, as before, without a certificate', () => {
    expect(macBuildConfig(build, {}, '1.2.3')).toEqual({ ...build, extraMetadata: { version: '1.2.3' } });
    // An identity without the certificate (a fork's build, its secrets missing) signs ad hoc too.
    expect(macBuildConfig(build, { MACOS_SIGNING_IDENTITY: SIGNING.MACOS_SIGNING_IDENTITY }, '1').mac.identity).toBe('-');
  });

  it("signs with the Developer ID certificate, under the hardened runtime and the app's entitlements", () => {
    const c = macBuildConfig(build, SIGNING, '1.2.3');
    expect(c.mac).toEqual({
      ...build.mac,
      // electron-builder wants the name without its kind, and chooses the Developer ID certificate itself.
      identity: 'Someone (ABCDE12345)',
      hardenedRuntime: true,
      entitlements: 'build/entitlements.mac.plist',
      entitlementsInherit: 'build/entitlements.mac.plist',
      // Not signed with it, the build fails instead of shipping ad hoc.
      forceCodeSigning: true,
    });
    // Signed, the app may replace itself with a newer release (desktop/updates.cjs updateKind); ad hoc, it may not.
    expect(c.extraMetadata).toEqual({ version: '1.2.3', selfUpdate: true });
    expect(c.appId).toBe('x');
  });

  it('never changes the settings it was given', () => {
    const before = structuredClone(build);
    macBuildConfig(build, SIGNING, '1');
    expect(build).toEqual(before);
  });
});
