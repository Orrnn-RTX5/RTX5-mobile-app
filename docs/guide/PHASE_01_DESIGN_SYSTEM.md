# Phase 01 - Design System and App Shell

## Objective
Implement the dark themed design system and responsive shell to support near parity UI across phone and tablet.

## In Scope
- Theme tokens: colors, typography, spacing, radius, elevation.
- Reusable primitives: text, buttons, rows, cards, list items, badges.
- Bottom tab shell parity.
- Adaptive layout framework for tablet split panes.

## Out of Scope
- Feature-specific business behavior.
- Live data integrations.

## Exact Implementation Tasks
1. Define design tokens in a central theme module.
2. Build reusable primitives and wrappers.
3. Create shared price and PnL display components.
4. Implement tab icons, selected states, and safe-area handling.
5. Add tablet breakpoint utilities and split-pane scaffolds.
6. Build global sheet/modal presentation style matching reference app.

## API Dependencies
- None.

## Acceptance Checklist
- [ ] Dark theme visually matches target baseline.
- [ ] Shared components are used by all feature modules.
- [ ] Tablet and phone render without layout breakage.
- [ ] Modal/action sheet style parity achieved.
- [x] App identity assets use the RTX5 white mark with the green center `5` across Expo icon, dark splash/startup surface, adaptive icon, favicon, and in-app logo consumers.

## Test Checklist
- [ ] Snapshot tests for primitives.
- [ ] Visual regression checks for shell screens.
- [ ] Manual orientation test on tablet.
- [x] Manual asset reference and dimension verification for app identity assets.

## Exit Criteria
- UI foundation is complete and feature teams only consume shared components.

## Progress Notes
- 2026-06-11: Enabled landscape-capable orientation in the root Expo scaffold by setting `orientation: default`, matching the active `rtx5-app` Expo config. The active bottom tab shell now compacts in landscape phone width so Quotes, Chart, Trade, History, and Settings keep more usable vertical content area. Native orientation config changes require a fresh native build; OTA-only delivery is not sufficient.
- 2026-05-25: Tightened the MT5-smooth ActionSheet path after device recheck. Shared sheets now virtualize action rows instead of mounting every item, intercept Android hardware Back while open, and support explicit touch-start activation for non-scrollable dropdown launchers that sit above native surfaces.
- 2026-05-25: Reworked shared ActionSheet interaction timing toward MT5-style first-frame behavior. Global sheets now normalize to instant open, seed visible opacity/translate in the first render, avoid Android native Modal geometry settle/slide paths, execute row actions immediately by default, and keep adaptive sheet floors stable without reflowing after paint.
- 2026-05-21: Replaced the referenced app identity assets with the dark-square RTX5 mark, white symbol, and green center `5` across the active Expo app assets and root Expo scaffold assets. Verified current logo consumers continue to reference the updated asset paths.
- 2026-05-21: Centralized in-app logo rendering through a shared `AppLogo` component, added a branded first-render startup surface, and aligned the native splash background with the supplied dark RTX5 logo.

