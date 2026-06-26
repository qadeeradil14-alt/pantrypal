const { withXcodeProject, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');
const plist = require('@expo/plist').default;

module.exports = function withWidgetVersion(config) {
  config = withXcodeProject(config, (modConfig) => {
    const buildSettings = modConfig.modResults.pbxXCBuildConfigurationSection();
    const widgetBundleIdentifier = `${config.ios.bundleIdentifier}.widgets`;

    for (const value of Object.values(buildSettings)) {
      if (String(value?.buildSettings?.PRODUCT_BUNDLE_IDENTIFIER).replaceAll('"', '') === widgetBundleIdentifier) {
        value.buildSettings.MARKETING_VERSION = `"${config.version}"`;
        value.buildSettings.CURRENT_PROJECT_VERSION = `"${config.ios.buildNumber ?? '73'}"`;
        // EAS's CONFIGURE_XCODE_PROJECT build step only patches the literal Info.plist
        // CFBundleVersion, not this build setting. With GENERATE_INFOPLIST_FILE = YES
        // (expo-widgets' default), Xcode ignores that literal patch and synthesizes
        // CFBundleVersion from this setting instead, so the widget's build number never
        // tracks EAS's autoIncrement and the archive step rejects the mismatch. Switching
        // to the literal Info.plist (matching the main app target) makes EAS's patch take effect.
        value.buildSettings.GENERATE_INFOPLIST_FILE = '"NO"';
      }
    }

    return modConfig;
  });

  // expo-widgets regenerates ExpoWidgetsTarget/Info.plist from a minimal template on every
  // prebuild and doesn't include the keys Xcode normally synthesizes via GENERATE_INFOPLIST_FILE.
  // Since we just disabled that synthesis above, add them back literally so the widget target
  // still has a complete Info.plist.
  config = withDangerousMod(config, [
    'ios',
    (modConfig) => {
      const infoPlistPath = path.join(modConfig.modRequest.platformProjectRoot, 'ExpoWidgetsTarget', 'Info.plist');
      const parsed = plist.parse(fs.readFileSync(infoPlistPath, 'utf8'));
      parsed.CFBundleExecutable = '$(EXECUTABLE_NAME)';
      parsed.CFBundleIdentifier = '$(PRODUCT_BUNDLE_IDENTIFIER)';
      parsed.CFBundlePackageType = 'XPC!';
      parsed.CFBundleName = '$(PRODUCT_NAME)';
      parsed.CFBundleDisplayName = 'Low Stock';
      parsed.CFBundleShortVersionString = config.version ?? '1.0.0';
      parsed.CFBundleVersion = String(config.ios?.buildNumber ?? '73');
      fs.writeFileSync(infoPlistPath, plist.build(parsed));
      return modConfig;
    },
  ]);

  return config;
};
