const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Config plugin to downgrade Gradle wrapper from 9.3.1 to 8.14.1
 * Gradle 9.x has breaking changes that affect the composite build setup
 * used by @react-native/gradle-plugin + expo-autolinking-plugin.
 * Gradle 8.14.1 is the latest stable 8.x and is fully supported by
 * AGP 8.12.0 and RN 0.85.3.
 */
const withGradleWrapper = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const wrapperPropsPath = path.join(
        config.modRequest.platformProjectRoot,
        'gradle',
        'wrapper',
        'gradle-wrapper.properties'
      );

      if (fs.existsSync(wrapperPropsPath)) {
        let content = fs.readFileSync(wrapperPropsPath, 'utf8');
        // Replace Gradle 9.x with 8.14.1
        content = content.replace(
          /distributionUrl=.*gradle-\d+\.\d+.*-bin\.zip/,
          'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.14.1-bin.zip'
        );
        fs.writeFileSync(wrapperPropsPath, content);
      }

      return config;
    },
  ]);
};

module.exports = withGradleWrapper;
