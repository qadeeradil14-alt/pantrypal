const { withXcodeProject } = require('expo/config-plugins');

module.exports = function withWidgetVersion(config) {
  return withXcodeProject(config, (modConfig) => {
    const buildSettings = modConfig.modResults.pbxXCBuildConfigurationSection();
    const widgetBundleIdentifier = `${config.ios.bundleIdentifier}.widgets`;

    for (const value of Object.values(buildSettings)) {
      if (String(value?.buildSettings?.PRODUCT_BUNDLE_IDENTIFIER).replaceAll('"', '') === widgetBundleIdentifier) {
        value.buildSettings.MARKETING_VERSION = `"${config.version}"`;
        value.buildSettings.CURRENT_PROJECT_VERSION = `"${config.ios.buildNumber ?? '73'}"`;
      }
    }

    return modConfig;
  });
};
