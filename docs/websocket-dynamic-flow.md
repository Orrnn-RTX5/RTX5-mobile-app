# RTX5 Dynamic WebSocket Flow

This single file contains the complete dynamic WebSocket flow: broker/session setup, quotes, chart candles, account/positions realtime, reconnect behavior, and the main files involved.

Image version: [websocket-dynamic-flow.svg](./websocket-dynamic-flow.svg)

Copy the Mermaid block below into any Mermaid renderer, Markdown preview, Notion, GitHub, or diagrams.net Mermaid import.

```mermaid
flowchart TD
  Start([App start / Login]) --> BrokerSelect[User selects broker]
  BrokerSelect --> PersistBroker[Persist brokerId, brokerServerUrl, brokerLogoUrl]
  Start --> Login[Login API returns account + tokens]
  Login --> PersistTokens[Persist accessToken, refreshToken, expiresAt]

  PersistBroker --> UrlBuilder[buildBrokerWsUrl]
  PersistTokens --> Session[Broker session available]

  subgraph QuoteFlow[Quotes live bid/ask flow]
    QuoteScreen[Quotes screen active] --> Watchlist[Read persisted quote watchlist]
    Watchlist --> ResolveSymbols[Resolve display symbols to broker feed symbols]
    ResolveSymbols --> SetQuoteSubs[quotesWsService.setSubscriptions(symbols)]
    SetQuoteSubs --> MergeDemand[Merge sticky + component + store consumer demand]
    MergeDemand --> QuoteDemand{Active symbols?}
    QuoteDemand -- No --> CloseQuoteWs[Close quotes socket]
    QuoteDemand -- Yes --> ResolveQuoteUrl[Resolve quote WS URL]
    UrlBuilder --> ResolveQuoteUrl
    ResolveQuoteUrl --> OpenQuoteWs[Open WebSocket: wss://broker/ws/feed]
    OpenQuoteWs --> QuoteOpen[onopen]
    QuoteOpen --> SendQuoteSub[Send subscribe message with active symbols]
    SendQuoteSub --> QuoteMessages[Incoming quote tick messages]
    QuoteMessages --> ProcessPayload[processIncomingPayload]
    ProcessPayload --> NormalizeTick[normalizeQuoteTickPayload]
    NormalizeTick --> DirectListeners[Emit per-symbol listeners immediately]
    DirectListeners --> QuoteSnapshots[useLiveQuoteSnapshot external store]
    QuoteSnapshots --> QuoteRows[Quote rows update]
    NormalizeTick --> StageStore[Stage pending quote updates]
    StageStore --> FlushStore[Flush batched updates to useTradingState.quotes]
    FlushStore --> StoreConsumers[Store-backed screens update]
  end

  subgraph CandleFlow[Chart candle flow]
    ChartActive[Chart screen active] --> UseCandles[useLiveCandles(symbol, timeframe)]
    UseCandles --> CandleSub[candlesWsService.subscribe(symbol, timeframe)]
    CandleSub --> ResolveCandleUrl[Resolve candle WS URL]
    UrlBuilder --> ResolveCandleUrl
    Session --> AppendToken[Append JWT token when available]
    ResolveCandleUrl --> AppendToken
    AppendToken --> OpenCandleWs[Open WebSocket: wss://broker/ws/v2?token=JWT]
    OpenCandleWs --> SendCandleSub[Send subscribe channel candles.SYMBOL.TF]
    SendCandleSub --> CandleMessages[Incoming candle payloads]
    CandleMessages --> RouteCandles[Route by channel / symbol / timeframe]
    RouteCandles --> IngestCandles[liveCandleStream.ingestLiveCandle]
    IngestCandles --> ChartSeries[Chart candle series updates]
    NormalizeTick --> ExtendActiveCandle[extendActiveCandlesFromQuoteTick]
    ExtendActiveCandle --> IngestCandles
  end

  subgraph AccountFlow[Account and positions realtime flow]
    LoggedIn[Logged-in app boot / foreground] --> BrokerRealtime[brokerRealtimeService.connect]
    BrokerRealtime --> GetWsUrl[brokerApi.getWebSocketUrl]
    Session --> GetWsUrl
    UrlBuilder --> GetWsUrl
    GetWsUrl --> OpenAccountWs[Open WebSocket: wss://broker/ws/v2?token=JWT]
    OpenAccountWs --> ResolveChannels[Resolve channels from current login]
    ResolveChannels --> SubAccount[Subscribe account.LOGIN]
    ResolveChannels --> SubPositions[Subscribe positions.LOGIN]
    SubAccount --> AccountMessages[Incoming account updates]
    SubPositions --> PositionMessages[Incoming position updates]
    AccountMessages --> AccountState[useLiveAccountState.updateMetrics]
    PositionMessages --> PositionsState[usePositionsState apply / upsert]
    AccountState --> TradeUi[Trade / History / Settings UI updates]
    PositionsState --> TradeUi
  end

  QuoteDemand -- Symbol list changes --> SetQuoteSubs
  UseCandles -- Symbol/timeframe changes --> CandleSub
  PersistTokens -- Token rotates --> ReconnectCandles[Reconnect candle/account sockets]
  ReconnectCandles --> OpenCandleWs
  ReconnectCandles --> OpenAccountWs
```

## Flow Notes

1. Broker selection and login persist `brokerServerUrl`, broker metadata, and tokens.
2. `buildBrokerWsUrl` converts the broker HTTP origin into the correct WebSocket origin.
3. Quotes are driven by active screen demand and the persisted user watchlist.
4. Quote subscriptions are dynamic: when symbols change, `quotesWsService.setSubscriptions(symbols)` recalculates active symbols and sends a fresh subscribe message.
5. The Quotes screen uses direct per-symbol listeners for low-latency bid/ask rendering.
6. Store-backed consumers use batched Zustand updates through the quote flush pipeline.
7. Chart candles subscribe by current `symbol + timeframe`, using `/ws/v2`.
8. Quote ticks also extend the active candle so the forming candle moves between backend candle snapshots.
9. Account and position updates use the logged-in account ID and JWT-backed `/ws/v2` connection.
10. If token/server URL changes, candle/account sockets reconnect and resubscribe.

## Main Files

- `app/login.tsx` - stores selected broker and login tokens.
- `src/api/brokerRouting.ts` - builds broker API and WebSocket URLs.
- `src/api/brokerApi.ts` - resolves authenticated `/ws/v2?token=...` URLs.
- `src/features/quotes/QuotesScreen.tsx` - resolves watchlist symbols and calls quote subscriptions.
- `src/api/ws/quotesSocket/QuotesWebSocketService.ts` - manages quote WS connection, active symbols, reconnects, and subscribe messages.
- `src/api/ws/quotesSocket/tickProcessor.ts` - normalizes incoming quote ticks and fans them out.
- `src/api/ws/quotesSocket/flushPipeline.ts` - batches quote updates into Zustand.
- `src/features/quotes/useLiveQuotes.ts` - quote-row live snapshot store.
- `src/domain/candles/hooks/useLiveCandles.ts` - chart candle subscription hook.
- `src/domain/candles/ws/candlesSocket/CandlesWebSocketService.ts` - candle WS connection and channel routing.
- `src/domain/candles/stream/liveCandleStream/manager.ts` - canonical candle stream engine.
- `src/api/ws/BrokerRealtimeService.ts` - logged-in account/positions realtime service.
