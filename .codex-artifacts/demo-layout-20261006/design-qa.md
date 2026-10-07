---

**Demo Account screenshot implementation ? 2026-10-06**

**Comparison Target**

- Source visual truth: the two Demo Account screenshots attached to the user's request, both 1080 x 2400 physical pixels. The same legacy top layout was also captured locally at `../.codex-artifacts/logout-shrink-20261006/updated.png`; it is used on the left of the combined comparison. The original chat attachments have no local image path.
- Rendered implementation: `../.codex-artifacts/demo-layout-20261006/top-final.png` and `bottom-v2.png`.
- Full-view combined comparison: `../.codex-artifacts/demo-layout-20261006/top-comparison.png` (legacy left, current right).
- Focused header/field comparison: `../.codex-artifacts/demo-layout-20261006/fields-comparison.png`.
- Viewport: connected realme RMX3521, Android 14, Expo Go; 1080 x 2400 physical pixels, density 480 (3x), equivalent 360 x 800 dp including system bars. Both comparison inputs retain their original dimensions and density. No browser frame or synthetic device chrome was added.
- State: portrait, dark theme, selected Orrnn broker, empty Demo Account form; top and scrolled-to-bottom captures. Screenshot content differs intentionally where the new registration contract does not expose legacy policy defaults.

**Findings and Comparison History**

1. [P1, fixed] The first native capture (`open.png`) contained a second status-bar-height gap above the header. The root auth modal now extends under native system bars and the screen applies its safe area once. `top-v3.png` and `top-final.png` confirm the reference header/body alignment.
2. [P2, fixed] Initial footer spacing left an additional 12 dp below Register (`bottom-v1.png`). Idle padding was reduced from 24 dp to 12 dp plus the bottom inset. `bottom-v2.png` places Phone, Group, terms, and Register at the same vertical positions as the second source screenshot.
3. All requested rows are present: first name, optional last name, email, phone, master password/strength, currency/leverage, initial balance, origin broker, group, terms, and Register.
4. Expected contract differences: Phone reads ?Not required?; currency, leverage, and balance display ?--? because the new API assigns those values and does not publish a demo-group policy here. Origin broker uses the exact selected broker ID. Group reads ?Assigned automatically.? These rows are read-only and are excluded from the registration payload. Legacy USD/10000/origin defaults are not represented as actual server policy.
5. Expected flow difference: the first valid Register tap reveals required password confirmation. Only the later confirmed action can invoke registration. An error-only Login recovery link remains available without adding a footer to the pristine reference layout.
6. Keyboard interaction check exposed a newly mounted confirmation field below the keyboard (`confirmation-keyboard.png`). The screen now retries focused-field scrolling after keyboard layout and field layout, and ignores missing coordinates. Code review found no focus-remount issue in the final callbacks. The final uninterrupted physical keyboard recheck remains unverified: phone focus and scroll state changed between captures, and an async request to leave the phone untouched was unanswered at report time. This is a residual interaction-validation gap, not evidence that the final keyboard fix passed on-device.

**Required Fidelity Surfaces**

- Fonts and typography: existing native font family, 17 dp centered header, 14 dp labels, 16 dp editable values, and optional-label weight match the reference in the combined and focused captures. Long values retain single-line truncation in policy rows.
- Spacing and layout rhythm: 24 dp horizontal form spacing, 48 dp fields, 8 dp corners, 11 dp row gaps, paired Currency/Leverage, and the 54 dp action match the source. The two-column section collapses for narrow windows or large text. Large-text/landscape device checks were not performed.
- Colors and visual tokens: existing dark background, raised field surfaces, gray borders/icons, and blue gradient/links are retained. The reference button was disabled by its legacy group state; the current button is brighter when signup is available, an expected state difference.
- Image quality and asset fidelity: the same existing Ionicons vector family is used. No generated images, substitutes, dependencies, or native configuration were introduced.
- Copy and content: all requested field labels and ?Register a demo account? are present. Server-owned and unsupported values use the explicit states described above. Confirmation is shown only when requested.

**Verification**

- `npm run typecheck`: passed after final source edits.
- Focused authentication, flow, trading gate, keyboard-source, and responsive suites: 37/37 passed. The keyboard-source suite covers existing legacy source contracts; it is not an automated native UI test of the new confirmation step.
- Physical Android: top and bottom layout, typing, password strength, scrolling, and the first Register action exercised. No account creation or trade was submitted.
- iOS, landscape, large-text, legal-link destinations, backend signup, and final uninterrupted keyboard retry were not validated in this task.
- Code review confirmed strict registration payload and duplicate-submit/authoritative confirmation validation remain in the shared coordinator. Recovery Login and external-error precedence were retained after review.

**Implementation Checklist**

- [x] Show every screenshot row in the active Demo Account screen.
- [x] Match reference header, field geometry, pairing, terms, and action layout on Android.
- [x] Keep the current broker-scoped registration contract and confirmation validation.
- [x] Preserve existing local changes and capture a task-only diff.
- [x] Pass TypeScript and focused regression checks.
- [ ] Repeat the final keyboard-confirmation interaction on an uninterrupted device.

The visual result below applies to the requested empty top/bottom screenshot layouts. It does not certify the outstanding interaction/device checks.

final result: passed
