/** `build` (package.json's) for a Mac build at `version`: signed with the Developer ID certificate where `env` has it (CSC_LINK and MACOS_SIGNING_IDENTITY), else ad hoc as given. A copy. */
export function macBuildConfig<T extends { mac?: Record<string, unknown> }>(
  build: T,
  env: Record<string, string | undefined>,
  version: string,
): T & { mac: Record<string, unknown>; extraMetadata: { version: string } };
