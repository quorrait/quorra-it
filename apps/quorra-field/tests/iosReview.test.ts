import assert from "node:assert/strict";
import { test } from "node:test";
import { IOS_ACCOUNT_ATTENTION, iosAccountCopy, iosAccountState, isIOSNative, isIosBlockedSignupPath } from "../src/lib/platform.ts";
import { iosTapToPayEntitled, tapToPayOffer } from "../src/lib/tapToPay.ts";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEBUG_ENTITLEMENTS, IOS_BUILD_NUMBER, IOS_DEPLOYMENT_FLOOR, IOS_MARKETING_VERSION, RELEASE_ENTITLEMENTS, ensureWorkspaceContents, highestDeploymentTarget, installSharedAppScheme, nativeAppTargetId, patchInfoVersions, patchIosProject, patchPodfile, sharedAppScheme } from "../scripts/prepare-native.mjs";

test("isIOSNative is only the native iOS platform", () => {
  assert.equal(isIOSNative("ios"), true);
  assert.equal(isIOSNative("android"), false);
  assert.equal(isIOSNative("web"), false);
});

test("signup, start, and plan routes are blocked and service plans are not", () => {
  for (const path of ["/start", "/start?plan=basic", "#/signup", "/plans", "plans/", "/plans?interval=year"]) {
    assert.equal(isIosBlockedSignupPath(path), true, path);
  }
  for (const path of ["/", "/login", "/join", "/billing", "/service-plans", "/contact", "/invoices"]) {
    assert.equal(isIosBlockedSignupPath(path), false, path);
  }
});

test("iOS account copy has no price, trial, or purchase instruction", () => {
  const attention = iosAccountCopy("attention");
  const active = iosAccountCopy("active");
  assert.equal(attention, IOS_ACCOUNT_ATTENTION);
  assert.equal(attention, "Your account needs attention. Contact your account administrator.");
  assert.equal(active, "Your account is active.");
  for (const copy of [attention, active]) {
    assert.doesNotMatch(copy, /\$|trial|subscribe|upgrade|website|pricing|plan|http/i);
  }
  assert.equal(iosAccountState({ status: "active" }), "active");
  assert.equal(iosAccountState({ status: "active", locked: true }), "attention");
  assert.equal(iosAccountState({ status: "past_due" }), "attention");
  assert.equal(iosAccountState({ status: "active", phase: "grace" }), "attention");
  assert.equal(iosAccountState({ status: "active", phase: "reviewer" }), "attention");
  assert.equal(iosAccountState({ status: "canceled" }), "attention");
  assert.equal(iosAccountState({}), "attention");
});

test("Tap to Pay stays hidden on iOS unless the entitlement build flag is on", () => {
  assert.equal(iosTapToPayEntitled(undefined), false);
  assert.equal(iosTapToPayEntitled("1"), true);
  assert.equal(tapToPayOffer("ios", true, false), "hidden");
  assert.equal(tapToPayOffer("ios", true, true), "ready");
  assert.equal(tapToPayOffer("android", true, false), "ready");
  assert.equal(tapToPayOffer("web", true, true), "hidden");
  assert.equal(tapToPayOffer("ios", false, true), "hidden");
});

const PBX = `
\t\t504EC3151FED79650016851F /* Debug */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 14.0;
\t\t\t\tMARKETING_VERSION = 1.0;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = com.quorrait.dispatch;
\t\t\t\tTARGETED_DEVICE_FAMILY = 1;
\t\t\t};
\t\t\tname = Debug;
\t\t};
\t\t504EC3161FED79650016851F /* Release */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;
\t\t\t\tCURRENT_PROJECT_VERSION = 5;
\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 14.0;
\t\t\t\tMARKETING_VERSION = 1.0;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = com.quorrait.dispatch;
\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";
\t\t\t};
\t\t\tname = Release;
\t\t};
`;

test("the deployment target stays at 15.0 unless a podspec asks for more", () => {
  const stripe = "s.ios.deployment_target  = '14.0'\n";
  const core = "s.ios.deployment_target = '13.0'\n";
  assert.equal(highestDeploymentTarget([stripe, core]), IOS_DEPLOYMENT_FLOOR);
  assert.equal(highestDeploymentTarget([stripe, "s.ios.deployment_target = '16.0'"]), "16.0");
  assert.equal(patchPodfile("platform :ios, '13.0'\n", "15.0"), "platform :ios, '15.0'\n");
  assert.match(patchIosProject("IPHONEOS_DEPLOYMENT_TARGET = 13.0;\nIPHONEOS_DEPLOYMENT_TARGET = 13.0;\n", "15.0"), /IPHONEOS_DEPLOYMENT_TARGET = 15\.0;/g);
});

test("App Store entitlements omit Tap to Pay and Release does not sign with it", () => {
  assert.equal(RELEASE_ENTITLEMENTS.includes("proximity-reader"), false);
  assert.equal(DEBUG_ENTITLEMENTS.includes("com.apple.developer.proximity-reader.payment.acceptance"), true);
  const patched = patchIosProject(PBX);
  const [debug, release] = patched.split("/* Release */");
  assert.match(debug, /CODE_SIGN_ENTITLEMENTS = App\/App\.debug\.entitlements;/);
  assert.match(release, /CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/);
  assert.doesNotMatch(release, /App\.debug\.entitlements/);
  assert.match(patched, new RegExp(`CURRENT_PROJECT_VERSION = ${IOS_BUILD_NUMBER};`, "g"));
  assert.equal(IOS_BUILD_NUMBER > 5, true);
  assert.equal(IOS_MARKETING_VERSION, "1.0");
  assert.match(patched, /MARKETING_VERSION = 1\.0;/);
  assert.match(patched, /IPHONEOS_DEPLOYMENT_TARGET = 15\.0;/);
});

const NATIVE_TARGET = `504EC3031FED79650016851F /* App */ = {
			isa = PBXNativeTarget;
			buildConfigurationList = 504EC3161FED79650016851F /* Build configuration list for PBXNativeTarget "App" */;
			name = App;
			productName = App;
		};`;

test("the shared App scheme names the App target and archives with Release", () => {
  assert.equal(nativeAppTargetId(NATIVE_TARGET), "504EC3031FED79650016851F");
  const scheme = sharedAppScheme(nativeAppTargetId(NATIVE_TARGET));
  assert.match(scheme, /BlueprintIdentifier = "504EC3031FED79650016851F"/);
  assert.match(scheme, /BlueprintName = "App"/);
  assert.match(scheme, /ReferencedContainer = "container:App\.xcodeproj"/);
  assert.match(scheme, /<ArchiveAction[\s\S]*buildConfiguration = "Release"/);
  const dir = mkdtempSync(join(tmpdir(), "qd-scheme-"));
  const project = join(dir, "App.xcodeproj");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "project.pbxproj"), NATIVE_TARGET);
  const written = installSharedAppScheme(dir);
  assert.deepEqual(written, [
    join(dir, "App.xcodeproj/xcshareddata/xcschemes/App.xcscheme"),
    join(dir, "App.xcworkspace/xcshareddata/xcschemes/App.xcscheme"),
  ]);
  for (const schemePath of written) {
    const onDisk = readFileSync(schemePath, "utf8");
    assert.match(onDisk, /BlueprintIdentifier = "504EC3031FED79650016851F"/);
    assert.match(onDisk, /<ArchiveAction[\s\S]*buildConfiguration = "Release"/);
  }
  const contents = readFileSync(ensureWorkspaceContents(dir), "utf8");
  assert.match(contents, /group:App\.xcodeproj/);
  const withPods = mkdtempSync(join(tmpdir(), "qd-pods-"));
  mkdirSync(join(withPods, "Pods/Pods.xcodeproj"), { recursive: true });
  mkdirSync(join(withPods, "App.xcworkspace"), { recursive: true });
  writeFileSync(join(withPods, "App.xcworkspace/contents.xcworkspacedata"), `<?xml version="1.0" encoding="UTF-8"?>
<Workspace version = "1.0">
   <FileRef location = "group:Pods/Pods.xcodeproj">
   </FileRef>
</Workspace>
`);
  const kept = readFileSync(ensureWorkspaceContents(withPods), "utf8");
  assert.match(kept, /Pods\/Pods\.xcodeproj/);
  assert.match(kept, /group:App\.xcodeproj/);
  const appOnly = mkdtempSync(join(tmpdir(), "qd-app-only-"));
  mkdirSync(join(appOnly, "Pods/Pods.xcodeproj"), { recursive: true });
  mkdirSync(join(appOnly, "App.xcworkspace"), { recursive: true });
  writeFileSync(join(appOnly, "App.xcworkspace/contents.xcworkspacedata"), `<?xml version="1.0" encoding="UTF-8"?>
<Workspace version = "1.0">
   <FileRef location = "group:App.xcodeproj">
   </FileRef>
</Workspace>
`);
  const withBoth = readFileSync(ensureWorkspaceContents(appOnly), "utf8");
  assert.match(withBoth, /group:App\.xcodeproj/);
  assert.match(withBoth, /Pods\/Pods\.xcodeproj/);
});

test("a literal bundle version below 6 is raised and the marketing version stays 1.0", () => {
  const xml = `<dict>\n\t<key>CFBundleShortVersionString</key>\n\t<string>1.0</string>\n\t<key>CFBundleVersion</key>\n\t<string>5</string>\n</dict>`;
  const next = patchInfoVersions(xml);
  assert.match(next, /<key>CFBundleVersion<\/key>\s*<string>6<\/string>/);
  assert.match(next, /<key>CFBundleShortVersionString<\/key>\s*<string>1\.0<\/string>/);
  const variable = patchInfoVersions(`<key>CFBundleVersion</key>\n\t<string>$(CURRENT_PROJECT_VERSION)</string>\n<key>CFBundleShortVersionString</key>\n\t<string>$(MARKETING_VERSION)</string>`);
  assert.match(variable, /\$\(CURRENT_PROJECT_VERSION\)/);
  assert.match(variable, /\$\(MARKETING_VERSION\)/);
});
