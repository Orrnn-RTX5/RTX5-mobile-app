# RTX5 Security Guide

## Security Objectives
- Protect credentials, sessions, and account data.
- Prevent unauthorized trade actions.
- Reduce impact of compromised devices/networks.

## Mandatory Controls

### 1) Secure Storage
- Store tokens and secrets in platform secure storage only.
- Do not store tokens in AsyncStorage or plaintext files.

Pass criteria:
- [ ] Access/refresh tokens are only persisted via secure keystore/keychain wrapper.
- [ ] Sensitive values are removed from logs and crash reports.

### 2) Biometric App Lock
- Require biometric or local PIN unlock after inactivity timeout.

Pass criteria:
- [ ] Lock engages after configured idle interval.
- [ ] Unlock required when app returns from background beyond threshold.

### 3) Certificate Pinning
- Pin production API certificates for critical endpoints.

Pass criteria:
- [ ] Pinned hosts configured for release builds.
- [ ] Connection fails closed when pin validation fails.

### 4) Device Integrity Checks
- Detect root/jailbreak and emulator risk state.
- Apply policy tiers (warn, restrict, block) by environment.

Pass criteria:
- [ ] Integrity checks run at startup and resume.
- [ ] Restricted actions are blocked based on configured policy.

### 5) Session Lifecycle
- Support refresh token rotation and forced logout.
- Prevent stale or replayed sessions.

Pass criteria:
- [ ] Expired tokens trigger refresh path.
- [ ] Refresh failures hard-logout and clear secure state.
- [ ] Device ID is included in auth/session requests.

### 6) Logging and Redaction
- Redact account identifiers, token fragments, and personal data.
- No PII in analytics breadcrumbs.

Pass criteria:
- [ ] Redaction middleware active for all logging layers.
- [ ] Security review confirms no sensitive fields in telemetry payloads.

## Threat-Model Notes
- Primary threats: credential theft, MITM tampering, unauthorized trade action, compromised device state.
- Mitigation stack: secure storage + pinning + integrity checks + app lock + redaction.

## Security Release Gate
A beta/public release is blocked if any mandatory control above is not green.

## Release Status Notes
- 2026-06-04: App Review privacy hardening added. Demo registration legal consent is no longer preselected, registration Terms/Privacy labels open absolute configured legal URLs or an in-app legal document fallback, About exposes direct Privacy Policy and Account Deletion request paths, and the unused Android microphone permission was removed. Legal/account-deletion fulfillment still depends on the operator's published policy, public App Store metadata URL, and support process.
- 2026-06-04: QR Scanner was removed from Settings/search and the unused camera module, plugin, and permission declarations were removed from the app config and dependency manifest. Current account and trading flows do not request camera, microphone, contacts, photos, or location access.
- 2026-06-03: Production EAS store builds were created with existing remote signing credentials, but production OTA publish and store submission remain blocked. Mandatory secure storage, certificate pinning, integrity checks, app lock, and redaction controls are still not green.
- 2026-05-22: Expo/EAS project ownership was relinked to `@chinese-hedger/rtx5-app` using an existing authenticated Expo session with owner access. No Expo tokens, passwords, service account keys, or signing credentials were added to the repository; release remains blocked until the mandatory security controls above are green.
- 2026-05-06: Candle `/ws/v2` connections now read the active access token at connect time and reconnect on token changes so authenticated candle channels are not left on stale anonymous sockets. No token logging was added, and release remains blocked until the mandatory secure-storage, pinning, integrity, app-lock, and redaction controls above are green.
- 2026-05-05: Play Store production build profile was switched to store app-bundle output only. No security gates were bypassed; mandatory controls above still block public release until green.

