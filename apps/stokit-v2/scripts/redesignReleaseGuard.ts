const EXPECTED_VARIANT = 'redesign';
const EXPECTED_NAME = 'Stokit Redesign';
const EXPECTED_BUNDLE_ID = 'com.hewadadil.stokit.redesign';
const EXPECTED_CHANNEL = 'shopping-redesign-test';
const EXPECTED_RUNTIME = '1.0.0';

type ExpoConfig = {
  name?: string;
  version?: string;
  ios?: { bundleIdentifier?: string };
  runtimeVersion?: string | { policy?: string };
  updates?: { requestHeaders?: Record<string, string> };
};

function runtimeVersion(config: ExpoConfig): string | undefined {
  if (typeof config.runtimeVersion === 'string') return config.runtimeVersion;
  if (config.runtimeVersion?.policy === 'appVersion') return config.version;
  return undefined;
}

export function assertRedesignReleaseConfig(variant: string | undefined, config: ExpoConfig): void {
  if (variant !== EXPECTED_VARIANT) throw new Error('APP_VARIANT=redesign is required.');
  if (config.name !== EXPECTED_NAME) throw new Error(`Expected redesign app name ${EXPECTED_NAME}.`);
  if (config.ios?.bundleIdentifier !== EXPECTED_BUNDLE_ID) throw new Error(`Expected redesign bundle ID ${EXPECTED_BUNDLE_ID}.`);
  if (config.updates?.requestHeaders?.['expo-channel-name'] !== EXPECTED_CHANNEL) {
    throw new Error(`Expected redesign channel ${EXPECTED_CHANNEL}.`);
  }
  if (runtimeVersion(config) !== EXPECTED_RUNTIME) throw new Error(`Expected redesign runtime ${EXPECTED_RUNTIME}.`);
}
