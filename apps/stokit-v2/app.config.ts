import type { ConfigContext, ExpoConfig } from 'expo/config';

const REDESIGN_BUNDLE_ID = 'com.hewadadil.stokit.redesign';
const REDESIGN_APP_GROUP = 'group.com.hewadadil.stokit.redesign';
const PRODUCTION_APP_GROUP = 'group.com.hewadadil.pantrypal';

export default ({ config }: ConfigContext): ExpoConfig => {
  const isRedesign = process.env.APP_VARIANT === 'redesign';
  const base = config as ExpoConfig;

  if (!isRedesign) {
    return {
      ...base,
      ios: {
        ...base.ios,
        entitlements: {
          ...base.ios?.entitlements,
          'com.apple.security.application-groups': [PRODUCTION_APP_GROUP],
        },
      },
    };
  }

  return {
    ...base,
    name: 'Stokit Redesign',
    scheme: 'stokitredesign',
    icon: './assets/icon-light.png',
    ios: {
      ...base.ios,
      bundleIdentifier: REDESIGN_BUNDLE_ID,
      icon: './assets/icon-light.png',
      entitlements: {
        ...base.ios?.entitlements,
        'com.apple.security.application-groups': [REDESIGN_APP_GROUP],
      },
    },
    updates: {
      ...base.updates,
      requestHeaders: { 'expo-channel-name': 'shopping-redesign-test' },
    },
    plugins: base.plugins?.map((plugin) => {
      if (Array.isArray(plugin) && plugin[0] === 'expo-widgets') {
        return [
          plugin[0],
          {
            ...plugin[1],
            bundleIdentifier: `${REDESIGN_BUNDLE_ID}.widgets`,
            groupIdentifier: REDESIGN_APP_GROUP,
          },
        ];
      }
      return plugin;
    }),
  };
};
