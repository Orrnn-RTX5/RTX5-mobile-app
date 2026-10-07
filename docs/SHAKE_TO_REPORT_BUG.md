# Shake to report a bug

On Android and iOS, shake the phone briskly back and forth while RTX5 is open.
The existing Report a Bug form opens above the current page. Its back button,
Android system back, and Done button return to that page.

The root host starts after app startup completes. Detection uses the
accelerometer at 20 Hz, requires three strong alternating impulses, and has a
three-second cooldown. Shaking while a bug report is already open does not
replace the draft. Motion samples are processed in memory, never recorded or
uploaded. Listeners stop when the app leaves the foreground or unmounts.
Unavailable sensors and web builds retain normal manual bug reporting.

## Native builds

`expo-sensors` is installed for Expo SDK 54 and configured with an iOS motion
usage description. Rebuild the Android/iOS app or development client to include
the native module; an OTA-only update cannot add it to an older binary. Expo Go
already includes this module. Its development shake menu may also appear;
verify the final experience in a release build.

## Verification on a physical phone

1. From Quotes, Chart (including fullscreen), Trade, History, Settings, and a
   sidebar detail, shake briskly. Confirm the full form is visible, safe areas
   are respected, and category, severity, file upload and submission still work.
2. Enter a draft, then shake again. Confirm the draft stays intact.
3. Close the form and confirm the previous page and its state remain available.
4. Try a single bump, slow rotation, and ordinary walking. They should not open
   a report. Sensitivity may need tuning against real-device motion traces.
5. Background the app, shake, and return. No report should have opened in the
   background. After the cooldown, a new deliberate shake should work.
6. Repeat on Android and iOS devices in portrait and landscape, light and dark
   themes. Simulators without an accelerometer are not a physical shake test.

Automated detector and subscription tests cover motion filtering, cooldown,
existing-report suppression, lifecycle cleanup, async startup races, and
unavailable sensors.
