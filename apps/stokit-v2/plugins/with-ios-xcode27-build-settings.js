const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

function applyXcodeBuildSettings(project, buildNumber, deploymentTarget) {
  const configurations = project.pbxXCBuildConfigurationSection();

  for (const [key, configuration] of Object.entries(configurations)) {
    if (key.endsWith('_comment') || !configuration.buildSettings) {
      continue;
    }

    const buildSettings = configuration.buildSettings;

    if (buildSettings.PRODUCT_BUNDLE_IDENTIFIER?.includes('com.hewadadil.pantrypal')) {
      buildSettings.CURRENT_PROJECT_VERSION = buildNumber;
    }

    if (buildSettings.IPHONEOS_DEPLOYMENT_TARGET) {
      buildSettings.IPHONEOS_DEPLOYMENT_TARGET = deploymentTarget;
    }
  }
}

function patchPodfile(contents, deploymentTarget) {
  const marker = `    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
      :ccache_enabled => ccache_enabled?(podfile_properties),
    )
`;
  const patch = `${marker}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${deploymentTarget}'
      end
    end
`;

  if (contents.includes("config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']")) {
    return contents;
  }

  return contents.replace(marker, patch);
}

function patchProjectFile(contents, buildNumber) {
  return contents
    .replaceAll('CURRENT_PROJECT_VERSION = "1";', `CURRENT_PROJECT_VERSION = "${buildNumber}";`)
    .replaceAll('CURRENT_PROJECT_VERSION = 1;', `CURRENT_PROJECT_VERSION = ${buildNumber};`);
}

module.exports = function withIosXcode27BuildSettings(config, props = {}) {
  const buildNumber = props.buildNumber || '73';
  const deploymentTarget = props.deploymentTarget || '16.4';

  config = withXcodeProject(config, (modConfig) => {
    applyXcodeBuildSettings(modConfig.modResults, buildNumber, deploymentTarget);
    return modConfig;
  });

  config = withDangerousMod(config, [
    'ios',
    (modConfig) => {
      const podfile = path.join(modConfig.modRequest.platformProjectRoot, 'Podfile');
      const projectFile = path.join(
        modConfig.modRequest.platformProjectRoot,
        `${modConfig.modRequest.projectName}.xcodeproj`,
        'project.pbxproj',
      );

      fs.writeFileSync(podfile, patchPodfile(fs.readFileSync(podfile, 'utf8'), deploymentTarget));
      fs.writeFileSync(projectFile, patchProjectFile(fs.readFileSync(projectFile, 'utf8'), buildNumber));
      return modConfig;
    },
  ]);

  return config;
};
