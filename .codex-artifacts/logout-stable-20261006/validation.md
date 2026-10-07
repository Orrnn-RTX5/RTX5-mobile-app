Logout popup and redirect validation ? 2026-10-06

The popup now receives explicit width/height and a fixed viewport frame before its scrollable content is measured. The frame remains unchanged for each opening across transient window/inset changes; physical screen rotation or font-scale changes can create a new fitting frame. The native popup has no show/hide animation and disappears when its session-bound confirmation is consumed.

Confirming logout synchronously invalidates the session, reveals the existing root Login form and then replaces the route. The Login entry owns the route handoff, so it does not open another auth flow. Confirmation uses the existing press-in deduplication and session-bound consume guard.

Serialized cleanup waits for the next visual frame with an 80 ms fallback rather than waiting for interactions with a 250 ms fallback. Disposable cache pruning runs after credential cleanup, and already-cleared preferences are not reset again. Secure deletion remains serialized ahead of a new credential commit.

Verification:
- TypeScript passed.
- 34 focused tests passed, including fitting/stable card bounds, duplicate-confirm protection, old-session protection, and immediate Login handoff with no retained order intent.
- Full regression: all 429 test files passed in 18 batches.
- Device access was available. The foreground app changed between Settings, the Expo menu, Journal, and Quotes during validation. No uninterrupted popup/redirect capture or actual latency measurement was completed. An optional request to leave the phone untouched remained unanswered at recording time.
- No trade was submitted during this task. No deployment, dependency, or native-configuration change was made.

Task-only source diff: source-changes.patch. Existing dirty changes were preserved.
