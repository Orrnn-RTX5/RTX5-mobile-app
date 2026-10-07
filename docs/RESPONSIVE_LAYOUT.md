# Responsive layout

Layout follows the current app window, not a saved phone model or installation-time screen size. Rotation, tablet split view, browser resizing, foldable resizing, keyboard resizing, and system text size can change the available space while the app is open.

- Use `useResponsiveLayout()` for usable width/height and layout breakpoints. Use `onLayout` when sizing a chart or control inside a smaller pane.
- Use `Screen` for ordinary pages. It applies lateral safe-area padding and bottom padding. Set `noBottomInset` when a list/footer already handles the bottom edge. Set `noSideInset` only when the page explicitly handles both side insets. Nested shared headers avoid applying these side insets twice.
- Keep original safe-area context available: native modals occupy their own window and must handle safe areas independently.
- Use flex, wrapping text, `minWidth: 0`, and minimum touch-target heights. Keep long forms and modal content scrollable. Avoid module-level cached screen dimensions, forced minimum chart sizes, and fixed-height text rows.
- Use the shared bottom-tab height resolver for chart keyboard docks and navigation so both reserve the same space.
- Keep form/dialog widths bounded on large screens. A narrow tablet split view should use the same compact layout as a phone.
- Trade and History pin their compact account summary only when usable height and text size leave enough room for records. Short windows and large text move the summary into the list header so all information remains reachable.

Automated geometry checks cover small phones, landscape cutouts, tablets, split view, large text, and resized windows. Before release, visually check the main tabs, authentication, order entry, drawers, settings, and modal forms at 320 × 568, 390 × 844, 844 × 390, 768 × 1024, 1024 × 768, and narrow split-view widths. Repeat with larger system text and the keyboard open on supported iOS and Android versions. Automated layout tests do not replace device/emulator visual verification.
