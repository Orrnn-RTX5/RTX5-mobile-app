# RTX5 Mobile App

## New Windows laptop or desktop

Use the repository-root
[`SETUP_NEW_WINDOWS_MACHINE.ps1`](../SETUP_NEW_WINDOWS_MACHINE.ps1) entry point.
The complete clone, Node/npm, Android, EAS, secret, and OTA-parity instructions
are in
[`docs/guide/NEW_WINDOWS_MACHINE_SETUP.md`](../docs/guide/NEW_WINDOWS_MACHINE_SETUP.md).
Run npm, Expo, EAS, test, and release commands from this `rtx5-app` directory.

## Open on an Android phone over Wi-Fi

Run `npm start` from this directory or the repository root, or double-click
`START.bat`. The default is an Expo Go tunnel connection so Windows Public
network firewall rules do not block the phone. Scan the QR printed in the
terminal and keep that terminal open. Internet and Expo's ngrok dependency
are required. A fresh server also prints its QR when output is redirected.

Connect the phone and laptop to the same Wi-Fi and run `npm run start:lan`
from this directory (or the repository root). Scan the QR code in Expo Go.
The laptop can also use Ethernet while the phone uses Wi-Fi on the same router,
provided the router permits device-to-device connections and Windows allows
Node on that network. If both Wi-Fi and Ethernet are active on different networks,
use the adapter connected to the phone's network, for example in PowerShell:

```powershell
$env:REACT_NATIVE_PACKAGER_HOSTNAME = '192.168.1.19' # replace with that adapter's current IPv4
npm run start:lan
```

After changing networks, stop the old server with Ctrl+C, start again, and scan
the new QR. `npm start` uses a tunnel and works across different networks while
both devices have internet access.
The launcher prefers the Wi-Fi adapter when the laptop also has Ethernet or
VPN adapters. Set `REACT_NATIVE_PACKAGER_HOSTNAME` to override that selection.
Use `npm run start:android:usb` to explicitly select USB.

This project uses Expo SDK 54. Android needs the SDK 54 version of Expo Go,
available at <https://expo.dev/go?sdkVersion=54&platform=android&device=true>.
If Expo Go reports an SDK mismatch, install the matching version.
If the QR code contains `127.0.0.1` or `localhost`, stop that server with Ctrl+C
and start again with `npm run start:lan`. Those addresses require USB forwarding.
If the Wi-Fi network blocks device-to-device connections, use
`npm run start:tunnel` (requires internet and Expo's ngrok dependency).

With an existing Metro server and a USB-connected Android phone, run
`npm run open:android` to open Expo Go through USB on the same port (8081 by
default). This command never starts a server. `npm start` also reuses an already
running Metro server instead of starting another one. Wi-Fi can also reuse a
server advertising the selected LAN address, without requiring USB. Use `-- --port 8082` when
the existing server uses a different port. The server must belong to this project.
`START.bat` and `npm start` from the repository root use this same launcher.
When starting a server, the launcher opens the project on the connected phone
and restores USB forwarding after a reconnect while the launcher remains open.
Plain `npx expo start` from this directory also uses the project launcher. The
project's postinstall hook applies a local Expo CLI entry patch for this command;
it defaults to an Expo Go tunnel, uses the SDK runtime, and reuses an existing server.
Explicit `--go`, `--dev-client`, iOS, web, and help commands keep Expo's original
CLI behavior. For a native development build use `npm run start:dev-client:usb`.

## MyProp market data

MyProp quote traffic uses the broker-hosted webterminal path:

- REST API: `https://services.myprop.trade/api/v2`
- Quote feed: `wss://services.myprop.trade/ws/feed`
- Broker ID: `myprop-trade`
- Trading/candle socket: `wss://services.myprop.trade/ws/v2`

The broker service domain is resolved from broker discovery/login state rather than hardcoded into the runtime client. The feed token must be returned by an authenticated broker flow, is stored with the app's secure-storage wrapper, and is appended only when the MyProp quote socket connects. Do not commit broker feed tokens or put them in public Expo environment variables.

MyProp quote subscriptions use `{ "type": "subscribe", "symbols": [...] }`. Watchlist, chart, and other consumers share the existing demand-counted quote service, which unsubscribes unused symbols, resubscribes after reconnect, and reconnects when the app returns to the foreground. Quote metadata such as `source: "rtx_market_data"` and `authority: "rtx5_hub"` is retained for policy/diagnostics but is not rendered as a per-row badge.

Quotes remain displayable after their last update, but trading actions are disabled when the backend marks the quote stale/non-tradable or its age exceeds 15 seconds.

### Verification checklist

- Sign in to the `myprop-trade` broker and confirm the login response supplies a feed token.
- Subscribe to `EURUSD`, `XAUUSD`, and `BTCUSD`; confirm bid/ask ticks arrive while their markets are open.
- Disable the network, restore it, and confirm the socket reconnects and resubscribes.
- Background the app for 30 seconds, return to it, and confirm prices resume.
- Confirm quote rows do not show feed source, authority, sequence, or age debug labels.
- Confirm an explicitly stale/non-tradable quote, or a quote older than 15 seconds, disables order actions without removing its last displayed price.

Run the focused automated checks with:

```powershell
node .\scripts\run-tsx-cli.js --test src/api/feedAuth.test.ts src/api/ws/quoteTickNormalizer.test.ts src/api/ws/quoteSubscriptionState.test.ts src/features/quotes/liveQuoteSnapshot.test.ts src/market/quotePolicy.test.ts
npm.cmd run typecheck
```
