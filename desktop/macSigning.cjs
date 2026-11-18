// The Mac build's electron-builder settings, signed with the Developer ID certificate where the build has one, else ad
// hoc as package.json has it. In CI the certificate comes from the repository's secrets (desktop.yml): CSC_LINK is the
// .p12 (base64), which electron-builder puts in a keychain of its own, and MACOS_SIGNING_IDENTITY the certificate's
// name. Signed, the app runs under the hardened runtime with build/entitlements.mac.plist; electron-builder then
// notarizes it wherever APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID are set (the release build). A build
// without the certificate - a local one, or a fork's - is signed ad hoc as before, and runs only where it was built
// or once the player has let it. A signed build is marked selfUpdate in its package.json: such a Mac app may replace
// itself with a newer release (updates.cjs updateKind), as one signed ad hoc may not.
const ENTITLEMENTS = 'build/entitlements.mac.plist';
/** The kinds a certificate's name may start with: electron-builder wants the name alone, and finds the kind itself. */
const KINDS = ['Developer ID Application: ', 'Apple Development: ', 'Mac Developer: '];

/** `build` (package.json's) for a Mac build at `version`, signed where `env` has the certificate. A copy. */
function macBuildConfig(build, env, version) {
  const c = structuredClone(build);
  c.extraMetadata = { ...(c.extraMetadata ?? {}), version };
  const name = (env.MACOS_SIGNING_IDENTITY ?? '').trim();
  if (!env.CSC_LINK || !name) return c;
  const kind = KINDS.find((k) => name.startsWith(k));
  c.extraMetadata.selfUpdate = true;
  c.mac = {
    ...c.mac,
    identity: kind ? name.slice(kind.length) : name,
    hardenedRuntime: true,
    entitlements: ENTITLEMENTS,
    entitlementsInherit: ENTITLEMENTS,
    // A build given the certificate fails rather than ship ad hoc: electron-builder otherwise only warns when the
    // certificate is not the one named (an Apple Development one, say), or its password is wrong.
    forceCodeSigning: true,
  };
  return c;
}

module.exports = { macBuildConfig };
