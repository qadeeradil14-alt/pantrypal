const { withAppDelegate, withDangerousMod, withInfoPlist, withXcodeProject } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const sceneManifest = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: 'Default Configuration',
        UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
      },
    ],
  },
};

const sceneDelegate = `import UIKit
import React

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else {
      return
    }

    let appDelegate = UIApplication.shared.delegate as? AppDelegate
    appDelegate?.configureReactNativeFactory()

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate?.window = window
    appDelegate?.reactNativeFactory?.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: nil)

    if let urlContext = connectionOptions.urlContexts.first {
      RCTLinkingManager.application(
        UIApplication.shared,
        open: urlContext.url,
        options: [:])
    }

    if let userActivity = connectionOptions.userActivities.first {
      RCTLinkingManager.application(
        UIApplication.shared,
        continue: userActivity,
        restorationHandler: { _ in })
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let url = URLContexts.first?.url else {
      return
    }

    RCTLinkingManager.application(
      UIApplication.shared,
      open: url,
      options: [:])
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    RCTLinkingManager.application(
      UIApplication.shared,
      continue: userActivity,
      restorationHandler: { _ in })
  }
}
`;

function patchAppDelegate(contents) {
  if (contents.includes('func configureReactNativeFactory()')) {
    return contents;
  }

  const factoryProperties = `  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?
`;
  const factoryMethod = `${factoryProperties}
  func configureReactNativeFactory() {
    if reactNativeFactory != nil {
      return
    }

    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
  }
`;
  let next = contents.replace(factoryProperties, factoryMethod);

  const oldStartup = `  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }`;
  const newStartup = `  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    configureReactNativeFactory()
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }`;

  next = next.replace(oldStartup, newStartup);
  return next;
}

module.exports = function withIosSceneLifecycle(config) {
  config = withInfoPlist(config, (modConfig) => {
    modConfig.modResults.UIApplicationSceneManifest = sceneManifest;
    return modConfig;
  });

  config = withAppDelegate(config, (modConfig) => {
    modConfig.modResults.contents = patchAppDelegate(modConfig.modResults.contents);
    return modConfig;
  });

  config = withDangerousMod(config, [
    'ios',
    (modConfig) => {
      const targetName = modConfig.modRequest.projectName;
      const targetDir = path.join(modConfig.modRequest.platformProjectRoot, targetName);
      fs.writeFileSync(path.join(targetDir, 'SceneDelegate.swift'), sceneDelegate);
      return modConfig;
    },
  ]);

  config = withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    const target = project.getFirstTarget().uuid;
    const group = project.findPBXGroupKey({ name: modConfig.modRequest.projectName });

    if (!project.hasFile(`${modConfig.modRequest.projectName}/SceneDelegate.swift`)) {
      project.addSourceFile(
        `${modConfig.modRequest.projectName}/SceneDelegate.swift`,
        { target },
        group,
      );
    }

    return modConfig;
  });

  return config;
};
