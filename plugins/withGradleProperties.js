const { withGradleProperties } = require('@expo/config-plugins');

/**
 * Config plugin to set Android Gradle properties for improved EAS build compatibility.
 * - Increases JVM heap size for C++ compilation (reanimated + worklets + expo-modules-core)
 * - Keeps parallel builds enabled but with safer settings
 */
const withCustomGradleProperties = (config) => {
  return withGradleProperties(config, (config) => {
    // Remove existing JVM args and replace with higher memory limit
    config.modResults = config.modResults.filter(
      (item) => item.type !== 'property' || item.key !== 'org.gradle.jvmargs'
    );
    config.modResults.push({
      type: 'property',
      key: 'org.gradle.jvmargs',
      value: '-Xmx4096m -XX:MaxMetaspaceSize=512m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8',
    });

    // Ensure configuration cache is disabled (can cause issues with some plugins)
    config.modResults = config.modResults.filter(
      (item) => item.type !== 'property' || item.key !== 'org.gradle.configuration-cache'
    );
    config.modResults.push({
      type: 'property',
      key: 'org.gradle.configuration-cache',
      value: 'false',
    });

    return config;
  });
};

module.exports = withCustomGradleProperties;
