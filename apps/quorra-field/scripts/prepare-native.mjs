// After `cap add` / asset generation, force the phone shell we actually want.
// iOS is created on the build machine; Android is in the repo and can be overwritten by @capacitor/assets.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

/** Capacitor's iOS template has no shared scheme. Xcode 26 does not invent one for xcodebuild -scheme. */
export const APP_TARGET_FALLBACK_ID = "504EC3031FED79650016851F";

/** App Store build number. Build 5 was rejected; the next upload must be higher. */
export const IOS_BUILD_NUMBER = 6;
/** Marketing version stays 1.0. */
export const IOS_MARKETING_VERSION = "1.0";
/**
 * Floor for the app. CapacitorCommunityStripeTerminal's podspec asks for 14.0,
 * and StripeTerminal 4.1 needs that too. The Podfile template is 13.0, which is
 * why pod install fails until this is raised first.
 */
export const IOS_DEPLOYMENT_FLOOR = "15.0";

export function compareIosVersions(a, b) {
  const pa = String(a).split(".").map((n) => Number(n) || 0);
  const pb = String(b).split(".").map((n) => Number(n) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** Highest podspec deployment target, never below the app floor. */
export function highestDeploymentTarget(texts, floor = IOS_DEPLOYMENT_FLOOR) {
  let best = floor;
  for (const text of texts) {
    const re = /s\.ios\.deployment_target\s*=\s*['"]([0-9.]+)['"]/g;
    let match;
    while ((match = re.exec(text))) {
      if (compareIosVersions(match[1], best) > 0) best = match[1];
    }
  }
  return best;
}

const PODSPECS = [
  "@capacitor-community/stripe-terminal/CapacitorCommunityStripeTerminal.podspec",
  "@capacitor/ios/Capacitor.podspec",
  "@capacitor/push-notifications/CapacitorPushNotifications.podspec",
  "@capacitor/browser/CapacitorBrowser.podspec",
  "@capacitor/splash-screen/CapacitorSplashScreen.podspec",
  "@capacitor/status-bar/CapacitorStatusBar.podspec",
];

export function podspecTexts(fieldRoot) {
  const texts = [];
  for (const rel of PODSPECS) {
    const path = join(fieldRoot, "node_modules", rel);
    if (existsSync(path)) texts.push(readFileSync(path, "utf8"));
  }
  return texts;
}

export function patchPodfile(text, deploymentTarget = IOS_DEPLOYMENT_FLOOR) {
  if (/platform :ios, '[0-9.]+'/.test(text)) {
    return text.replace(/platform :ios, '[0-9.]+'/g, `platform :ios, '${deploymentTarget}'`);
  }
  return `platform :ios, '${deploymentTarget}'\n${text}`;
}

/**
 * Release / App Store entitlements. Apple granted Tap to Pay for development only,
 * so this file must not include com.apple.developer.proximity-reader.payment.acceptance.
 */
export const RELEASE_ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>aps-environment</key>
	<string>production</string>
</dict>
</plist>
`;

/** Debug entitlements. The development Tap to Pay entitlement can live here and be turned back on later. */
export const DEBUG_ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>aps-environment</key>
	<string>development</string>
	<key>com.apple.developer.proximity-reader.payment.acceptance</key>
	<true/>
</dict>
</plist>
`;

/** Point Debug at the development entitlements and Release at the App Store file, and keep the version above build 5. */
export function patchIosProject(text, deploymentTarget = IOS_DEPLOYMENT_FLOOR) {
  let next = text.replace(/IPHONEOS_DEPLOYMENT_TARGET = [0-9.]+;/g, `IPHONEOS_DEPLOYMENT_TARGET = ${deploymentTarget};`);
  next = next.replace(/CURRENT_PROJECT_VERSION = (\d+);/g, (_, n) => `CURRENT_PROJECT_VERSION = ${Math.max(Number(n), IOS_BUILD_NUMBER)};`);
  next = next.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${IOS_MARKETING_VERSION};`);
  next = next.replace(/PRODUCT_BUNDLE_IDENTIFIER = com\.quorrait\.dispatch;[\s\S]*?\n\t\t\t\};\n\t\t\tname = (Debug|Release);/g, (block, name) => {
    const file = name === "Debug" ? "App/App.debug.entitlements" : "App/App.entitlements";
    let updated = block;
    if (updated.includes("CODE_SIGN_ENTITLEMENTS")) {
      updated = updated.replace(/CODE_SIGN_ENTITLEMENTS = [^;]+;/, `CODE_SIGN_ENTITLEMENTS = ${file};`);
    } else {
      updated = updated.replace(
        "PRODUCT_BUNDLE_IDENTIFIER = com.quorrait.dispatch;",
        `PRODUCT_BUNDLE_IDENTIFIER = com.quorrait.dispatch;\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = ${file};`,
      );
    }
    if (updated.includes("TARGETED_DEVICE_FAMILY")) {
      updated = updated.replace(/TARGETED_DEVICE_FAMILY = [^;]+;/, 'TARGETED_DEVICE_FAMILY = "1,2";');
    } else {
      updated = updated.replace(/\n\t\t\t\};/, '\n\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";\n\t\t\t};');
    }
    return updated;
  });
  return next;
}

/** The App target id inside a project.pbxproj. Capacitor's template id is the fallback. */
export function nativeAppTargetId(pbxproj) {
  const match = pbxproj.match(/([A-F0-9]{24}) \/\* App \*\/ = \{\s*isa = PBXNativeTarget;/);
  return match ? match[1] : APP_TARGET_FALLBACK_ID;
}

/** Shared scheme xcodebuild looks up by name. Archive uses the Release configuration. */
export function sharedAppScheme(blueprintId) {
  const id = /^[A-F0-9]{24}$/.test(blueprintId) ? blueprintId : APP_TARGET_FALLBACK_ID;
  const reference = `            <BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "${id}"
               BuildableName = "App.app"
               BlueprintName = "App"
               ReferencedContainer = "container:App.xcodeproj">
            </BuildableReference>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Scheme
   LastUpgradeVersion = "1430"
   version = "1.7">
   <BuildAction
      parallelizeBuildables = "YES"
      buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry
            buildForTesting = "YES"
            buildForRunning = "YES"
            buildForProfiling = "YES"
            buildForArchiving = "YES"
            buildForAnalyzing = "YES">
${reference}
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      shouldUseLaunchSchemeArgsEnv = "YES"
      shouldAutocreateTestPlan = "YES">
   </TestAction>
   <LaunchAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      launchStyle = "0"
      useCustomWorkingDirectory = "NO"
      ignoresPersistentStateOnLaunch = "NO"
      debugDocumentVersioning = "YES"
      debugServiceExtension = "internal"
      allowLocationSimulation = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
${reference}
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction
      buildConfiguration = "Release"
      shouldUseLaunchSchemeArgsEnv = "YES"
      savedToolIdentifier = ""
      useCustomWorkingDirectory = "NO"
      debugDocumentVersioning = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
${reference}
      </BuildableProductRunnable>
   </ProfileAction>
   <AnalyzeAction
      buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction
      buildConfiguration = "Release"
      revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
`;
}

/** Write the scheme on the project and on the workspace xcodebuild -workspace opens. */
export function installSharedAppScheme(appDir) {
  const pbxPath = join(appDir, "App.xcodeproj/project.pbxproj");
  const xml = sharedAppScheme(nativeAppTargetId(existsSync(pbxPath) ? readFileSync(pbxPath, "utf8") : ""));
  const paths = [
    join(appDir, "App.xcodeproj/xcshareddata/xcschemes/App.xcscheme"),
    join(appDir, "App.xcworkspace/xcshareddata/xcschemes/App.xcscheme"),
  ];
  for (const schemePath of paths) {
    mkdirSync(dirname(schemePath), { recursive: true });
    writeFileSync(schemePath, xml);
  }
  ensureWorkspaceContents(appDir);
  return paths;
}

/** CocoaPods normally writes this. Keep the App project and add Pods once pod install has created it. */
export function ensureWorkspaceContents(appDir) {
  const contentsPath = join(appDir, "App.xcworkspace/contents.xcworkspacedata");
  mkdirSync(dirname(contentsPath), { recursive: true });
  let xml = existsSync(contentsPath) ? readFileSync(contentsPath, "utf8") : "";
  const appRef = `   <FileRef
      location = "group:App.xcodeproj">
   </FileRef>`;
  const podsRef = `   <FileRef
      location = "group:Pods/Pods.xcodeproj">
   </FileRef>`;
  const podsExist = existsSync(join(appDir, "Pods/Pods.xcodeproj"));
  if (!xml.includes("</Workspace>")) {
    const refs = [appRef];
    if (podsExist) refs.push(podsRef);
    xml = `<?xml version="1.0" encoding="UTF-8"?>
<Workspace
   version = "1.0">
${refs.join("\n")}
</Workspace>
`;
    writeFileSync(contentsPath, xml);
    return contentsPath;
  }
  if (!xml.includes("group:App.xcodeproj") && !xml.includes('location = "App.xcodeproj"')) {
    xml = xml.replace("</Workspace>", `${appRef}\n</Workspace>`);
  }
  if (podsExist && !xml.includes("Pods/Pods.xcodeproj")) {
    xml = xml.replace("</Workspace>", `${podsRef}\n</Workspace>`);
  }
  writeFileSync(contentsPath, xml);
  return contentsPath;
}

/** Raise a literal CFBundleVersion above 5. Variable versions ($(CURRENT_PROJECT_VERSION)) are left for the build setting. */
export function patchInfoVersions(xml) {
  let next = xml.replace(/(<key>CFBundleVersion<\/key>\s*<string>)(\d+)(<\/string>)/, (_, open, n, close) => `${open}${Math.max(Number(n), IOS_BUILD_NUMBER)}${close}`);
  next = next.replace(/(<key>CFBundleShortVersionString<\/key>\s*<string>)(?!\$\()[^<]*(<\/string>)/, `$1${IOS_MARKETING_VERSION}$2`);
  return next;
}

function isDirectRun() {
  const arg = process.argv[1] ?? "";
  if (arg.endsWith("prepare-native.mjs")) return true;
  try {
    return Boolean(arg) && import.meta.url === pathToFileURL(arg).href;
  } catch {
    return false;
  }
}
if (isDirectRun()) {
const root = new URL("..", import.meta.url).pathname;
const which = process.argv[2] ?? "all";
const runIos = which === "all" || which === "ios";
const runAndroid = which === "all" || which === "android";

const LAUNCH = `<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="21701" targetRuntime="iOS.CocoaTouch" propertyAccessControl="none" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" useSafeAreas="YES" colorMatched="YES" initialViewController="01J-lp-oVM">
    <device id="retina6_12" orientation="portrait" appearance="light"/>
    <dependencies>
        <deployment identifier="iOS"/>
        <plugIn identifier="com.apple.InterfaceBuilder.IBCocoaTouchPlugin" version="21679"/>
        <capability name="Safe area layout guides" minToolsVersion="9.0"/>
        <capability name="documents saved in the Xcode 8 format" minToolsVersion="8.0"/>
    </dependencies>
    <scenes>
        <scene sceneID="EHf-IW-A2E">
            <objects>
                <viewController id="01J-lp-oVM" sceneMemberID="viewController">
                    <view key="view" contentMode="scaleToFill" id="Ze5-6b-2t3">
                        <rect key="frame" x="0.0" y="0.0" width="393" height="852"/>
                        <autoresizingMask key="autoresizingMask" widthSizable="YES" heightSizable="YES"/>
                        <viewLayoutGuide key="safeArea" id="6Tk-OE-BBY"/>
                        <color key="backgroundColor" red="0.058823529411764705" green="0.09019607843137255" blue="0.12549019607843137" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>
                    </view>
                </viewController>
                <placeholder placeholderIdentifier="IBFirstResponder" id="iYj-Kq-Ea1" userLabel="First Responder" sceneMemberID="firstResponder"/>
            </objects>
            <point key="canvasLocation" x="53" y="375"/>
        </scene>
    </scenes>
</document>
`;

function upsertPlistString(xml, key, value) {
  const pattern = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`);
  if (pattern.test(xml)) return xml.replace(pattern, `$1${value}$2`);
  return xml.replace("</dict>\n</plist>", `\t<key>${key}</key>\n\t<string>${value}</string>\n</dict>\n</plist>`);
}

function patch(path, fn) {
  if (!existsSync(path)) {
    console.log(`skip missing ${path}`);
    return;
  }
  const next = fn(readFileSync(path, "utf8"));
  writeFileSync(path, next);
  console.log(`updated ${path}`);
}

if (runIos) {
  const ios = join(root, "ios");
  if (!existsSync(ios)) {
    console.log("no ios project yet");
  } else {
    patch(join(ios, "App/App/Info.plist"), (xml) => {
      let next = xml;
      if (next.includes("<key>CFBundleDisplayName</key>")) {
        next = next.replace(/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/, "$1Dispatch$2");
      } else {
        next = next.replace("</dict>\n</plist>", "\t<key>CFBundleDisplayName</key>\n\t<string>Dispatch</string>\n</dict>\n</plist>");
      }
      // Written into the generated Info.plist. There is no Info.plist in the repo; Capacitor creates the iOS project on the build machine.
      next = upsertPlistString(next, "NSLocationWhenInUseUsageDescription", "Dispatch uses your location to check you in at job sites and to take a card payment with Tap to Pay on iPhone.");
      next = upsertPlistString(next, "NFCReaderUsageDescription", "Dispatch uses NFC so a customer can tap a card on this iPhone.");
      const iphoneOrient = `\t<key>UISupportedInterfaceOrientations</key>
\t<array>
\t\t<string>UIInterfaceOrientationPortrait</string>
\t\t<string>UIInterfaceOrientationLandscapeLeft</string>
\t\t<string>UIInterfaceOrientationLandscapeRight</string>
\t</array>`;
      const ipadOrient = `\t<key>UISupportedInterfaceOrientations~ipad</key>
\t<array>
\t\t<string>UIInterfaceOrientationPortrait</string>
\t\t<string>UIInterfaceOrientationPortraitUpsideDown</string>
\t\t<string>UIInterfaceOrientationLandscapeLeft</string>
\t\t<string>UIInterfaceOrientationLandscapeRight</string>
\t</array>`;
      if (next.includes("<key>UISupportedInterfaceOrientations</key>")) {
        next = next.replace(/<key>UISupportedInterfaceOrientations<\/key>\s*<array>[\s\S]*?<\/array>/, iphoneOrient.trim());
      }
      if (next.includes("<key>UISupportedInterfaceOrientations~ipad</key>")) {
        next = next.replace(/<key>UISupportedInterfaceOrientations~ipad<\/key>\s*<array>[\s\S]*?<\/array>/, ipadOrient.trim());
      } else {
        next = next.replace("</dict>\n</plist>", `${ipadOrient}\n</dict>\n</plist>`);
      }
      if (!next.includes("<string>remote-notification</string>")) {
        if (next.includes("<key>UIBackgroundModes</key>")) {
          next = next.replace(/(<key>UIBackgroundModes<\/key>\s*<array>)/, "$1\n\t\t<string>remote-notification</string>");
        } else {
          next = next.replace("</dict>\n</plist>", "\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>remote-notification</string>\n\t</array>\n</dict>\n</plist>");
        }
      }
      return patchInfoVersions(next);
    });
    const entitlements = join(ios, "App/App/App.entitlements");
    const debugEntitlements = join(ios, "App/App/App.debug.entitlements");
    mkdirSync(dirname(entitlements), { recursive: true });
    // Release is what Codemagic's ios-release workflow archives. No Tap to Pay key.
    writeFileSync(entitlements, RELEASE_ENTITLEMENTS);
    writeFileSync(debugEntitlements, DEBUG_ENTITLEMENTS);
    console.log(`updated ${entitlements}`);
    console.log(`updated ${debugEntitlements}`);
    const deploymentTarget = highestDeploymentTarget(podspecTexts(root));
    console.log(`iOS deployment target ${deploymentTarget}`);
    const pbxprojPath = join(ios, "App/App.xcodeproj/project.pbxproj");
    patch(pbxprojPath, (text) => patchIosProject(text, deploymentTarget));
    if (existsSync(pbxprojPath)) {
      for (const schemePath of installSharedAppScheme(join(ios, "App"))) console.log(`updated ${schemePath}`);
    }
    patch(join(ios, "App/Podfile"), (text) => patchPodfile(text, deploymentTarget));
    const storyboard = join(ios, "App/App/Base.lproj/LaunchScreen.storyboard");
    if (existsSync(storyboard)) {
      writeFileSync(storyboard, LAUNCH);
      console.log(`updated ${storyboard}`);
    }
  }
}

if (runAndroid) {
  const strings = join(root, "android/app/src/main/res/values/strings.xml");
  patch(strings, (xml) =>
    xml
      .replace(/(<string name="app_name">)[^<]*(<\/string>)/, "$1Dispatch$2")
      .replace(/(<string name="title_activity_main">)[^<]*(<\/string>)/, "$1Dispatch$2"),
  );
  const styles = join(root, "android/app/src/main/res/values/styles.xml");
  if (existsSync(styles)) {
    const launch = `    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">#0F1720</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/splash_icon</item>
        <item name="windowSplashScreenIconBackgroundColor">#0F1720</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
        <item name="android:windowBackground">#0F1720</item>
        <item name="android:statusBarColor">#0F1720</item>
        <item name="android:navigationBarColor">#0F1720</item>
    </style>`;
    patch(styles, (xml) => xml.replace(/<style name="AppTheme\.NoActionBarLaunch"[\s\S]*?<\/style>/, launch.trim()));
  }
}
}
