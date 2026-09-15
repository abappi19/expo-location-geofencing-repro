# expo-location geofencing requires `UIBackgroundModes: location` on iOS

Minimal reproduction for [expo/expo#XXXXX](https://github.com/expo/expo/issues).

`Location.startGeofencingAsync` refuses to start unless the app declares the `location`
background mode, even though it only uses Core Location **region monitoring**, which does not
require that mode. Apps whose only location feature is geofencing are therefore forced to declare a
background mode they have no feature for, and App Review rejects them under guideline 2.5.4.

This is a `npx create-expo-app --template blank` app plus `expo-location` and `expo-task-manager`.
Nothing else. No third-party libraries.

## Reproduce (iOS Simulator is enough — no device, no walking around, no movement)

```bash
npm install
npx expo run:ios
```

The app calls `startGeofencingAsync` on mount. Grant **Always** when asked, or pre-grant it and
skip both dialogs:

```bash
xcrun simctl privacy booted grant location-always dev.repro.expolocationgeofencing
xcrun simctl terminate booted dev.repro.expolocationgeofencing
xcrun simctl launch booted dev.repro.expolocationgeofencing
```

### Expected

Geofencing starts. Region monitoring does not need the `location` background mode — iOS delivers
region events to a backgrounded or terminated app on `Always` authorization without it.

### Actual

Both permissions are granted, and `startGeofencingAsync` still refuses:

```
 LOG  foreground: granted
 LOG  background: granted
 LOG  threw ERR_LOCATION_UPDATES_UNAVAILABLE
 LOG  FunctionCallException: Calling the 'startGeofencingAsync' function has failed (at ExpoModulesCore/AsyncFunctionDefinition.swift:123)
→ Caused by: LocationUpdatesUnavailable: Background location has not been configured, make sure to add 'location' to 'UIBackgroundModes' in the Info.plist file (at ExpoLocation/LocationModule.swift:267)
```

Verified on `expo@57.0.22`, `expo-location@57.0.17`, `expo-task-manager@57.0.17`, Xcode 26.6,
iPhone 14 simulator (iOS 26).

## Why the repro is this small

The check is a static `Info.plist` read, so it fails deterministically — no GPS, no movement, no
physical device.

`startGeofencingAsync` guards on the background mode before it does anything else:

[`packages/expo-location/ios/LocationModule.swift:266`](https://github.com/expo/expo/blob/main/packages/expo-location/ios/LocationModule.swift#L266)

```swift
guard try taskManager.hasBackgroundModeEnabled("location") else {
  throw Exceptions.LocationUpdatesUnavailable()
}
```

and [`EXTaskService.m:324`](https://github.com/expo/expo/blob/main/packages/expo-task-manager/ios/EXTaskManager/EXTaskService.m#L324)
is just:

```objc
NSArray *backgroundModes = [[NSBundle mainBundle] infoDictionary][@"UIBackgroundModes"];
return backgroundModes != nil && [backgroundModes containsObject:backgroundMode];
```

Confirm the app does not declare the mode:

```bash
plutil -extract UIBackgroundModes xml1 -o - ios/expolocationgeofencingrepro/Info.plist
# -> only "fetch", added by the expo-task-manager plugin. No "location".
```

## Second gate, behind the first

Setting `isIosBackgroundLocationEnabled: true` in the `expo-location` plugin config makes this work
(rerun `npx expo prebuild -p ios --clean` first — a plain `npx expo run:ios` will not re-apply the plugin
change to an existing `ios/` directory) — and that is precisely the `Info.plist` entry that gets the app
rejected. Removing only the
`LocationModule.swift` guard is not enough either: the task consumer then crashes, because

[`EXGeofencingTaskConsumer.m:74`](https://github.com/expo/expo/blob/main/packages/expo-location/ios/TaskConsumers/EXGeofencingTaskConsumer.m#L74)
sets `allowsBackgroundLocationUpdates = YES` unconditionally:

```
*** Assertion failure in -[CLLocationManager setAllowsBackgroundLocationUpdates:]
NSInternalInconsistencyException: Invalid parameter not satisfying:
!stayUp || CLClientIsBackgroundable(internal->fClient) || _CFMZEnabled()
```

That consumer never calls `startUpdatingLocation` or `startMonitoringSignificantLocationChanges` —
only `startMonitoringForRegion:` and `requestStateForRegion:` — so both
`allowsBackgroundLocationUpdates` and `pausesLocationUpdatesAutomatically` are inert there. They
only impose the `Info.plist` requirement.

## Relevant files

- [`App.js`](./App.js) — defines the task, requests permissions, calls `startGeofencingAsync` on mount.
- [`app.json`](./app.json) — `expo-location` plugin with usage strings only; **no**
  `isIosBackgroundLocationEnabled`.
