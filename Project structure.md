# RTX-5 Mobile Application - System File Architecture

This document provides a holistic, 100% comprehensive view of the RTX-5 frontend repository. Every tracked file across the application ecosystem, documentation, and agent orchestration layers is structurally mapped and explicitly defined.


c:\Users\ADMIN\RTX-5Mobile-App\
│
├── docs/                                          # Core Architectural Truth & Guidelines
│   └── guide/
│       ├── API_CONTRACTS.md                       # Defines strict data schemas for all REST and WebSocket backend integrations
│       ├── ARCHITECTURE.md                        # Explains foundational system design and non-negotiable tech stack constraints
│       ├── MASTER_GUIDE.md                        # Contains the master roadmap, milestone timelines, and project risk register
│       ├── OTA_RELEASE.md                         # Outlines the protocol for staging Over-The-Air Expo updates
│       ├── PHASE_00_FOUNDATION.md                 # Defines acceptance criteria for baseline tooling setup and CI checks
│       ├── PHASE_01_DESIGN_SYSTEM.md              # Defines acceptance criteria for global layout tokens and base navigation
│       ├── PHASE_02_QUOTES.md                     # Defines acceptance criteria for real-time market data watchlists
│       ├── PHASE_03_CHART_ENGINE.md               # Defines acceptance criteria for the Skia charting engine and UI
│       ├── PHASE_04_TRADE_TICKET.md               # Defines acceptance criteria for order execution and position handling
│       ├── PHASE_05_HISTORY.md                    # Defines acceptance criteria for historical trade reporting UI
│       ├── PHASE_06_SETTINGS_NEWS.md              # Defines acceptance criteria for user configurations and broker listings
│       ├── PHASE_07_HARDENING.md                  # Defines acceptance criteria for security controls, logging, and profiling
│       ├── PHASE_08_BETA_RELEASE.md               # Defines acceptance criteria for app store submission readiness
│       ├── README.md                              # Serves as the primary developer onboarding guide and document index
│       ├── SECURITY.md                            # Mandates implementation rules for cert pinning, biometrics, and root checks
│       ├── TEST_STRATEGY.md                       # Governs automated testing expectations across unit, integration, and E2E layers
│       └── UI_PARITY_SCREEN_MAP.md                # Maps each implemented feature back to original target design screenshots
│
├── _agents/                                       # Autonomous CI/CD and AI Agent Definitions
│   ├── AGENT_PROTOCOL.md                          # Standardizes messaging formats between different sub-agents
│   ├── AUTO_PILOT.md                              # Establishes absolute security boundaries and level of automation
│   ├── MISSION_CONTROL.md                         # Aggregates workflows and manages multi-agent handoffs
│   ├── ORCHESTRATOR.md                            # Acts as the primary brain dispatching tasks to specialized sub-agents
│   ├── agents/
│   │   ├── backend_agent.md                       # Outlines rules for creating REST/WS data layer hooks
│   │   ├── db_agent.md                            # Outlines rules for constructing client-side state models
│   │   ├── devops_agent.md                        # Outlines rules for deploying Expo builds to the cloud
│   │   ├── qa_agent.md                            # Outlines rules for writing extensive test coverage
│   │   └── ui_agent.md                            # Outlines rules for rendering React Native components exactly to spec
│   └── workflows/
│       ├── bugfix.md                              # Pipeline steps invoked during automated anomaly resolution
│       ├── deploy.md                              # Pipeline steps invoked when staging an OTA update release
│       ├── feature.md                             # Pipeline steps invoked when bootstrapping a new UI screen
│       ├── review.md                              # Pipeline steps invoked for generating automated code reviews
│       └── turbo_build.md                         # Pipeline steps invoked for aggressive parallelized deployments
│
└── rtx5-app/                                      # The React Native Mobile Application Client
    │
    ├── Configuration & Build Files
    │   ├── .env                                   # Injects local environment variables (API Endpoints, Secure Keys)
    │   ├── .gitignore                             # Specifies untracked Node/Expo artifacts preventing repository bloat
    │   ├── app.json                               # Configures global Expo deployment properties (App Name, Bundle ID, OS Permissions)
    │   ├── App.tsx                                # Mounts the absolute root tree required by cross-platform Expo routing
    │   ├── babel.config.js                        # Configures Metro compiler hooks (e.g., Reanimated syntax parsers)
    │   ├── eas.json                               # Configures EAS Build profiles and mapping to release distribution channels
    │   ├── index.ts                               # Acts as the Metro bundler bootstrap entry path
    │   ├── package-lock.json                      # Freezes dependency sub-tree versions guaranteeing deterministic installations
    │   ├── package.json                           # Declares root project dependencies (React Native, Zustand, TanStack, Skia)
    │   └── tsconfig.json                          # Enforces strict TypeScript compiler rules requiring strict null checks
    │
    ├── assets/                                    # Static Application Resources
    │   ├── adaptive-icon.png                      # Standard Android multi-layer application icon
    │   ├── favicon.png                            # Fallback web icon resource
    │   ├── icon.png                               # Standard iOS application springboard icon
    │   └── splash-icon.png                        # Rendered graphic shown exclusively during initial application boot
    │
    ├── scripts/                                   # Automation Utilities
    │   └── auto-document.mjs                      # A NodeJS script utilized for batch-injecting JSDoc scaffolding
    │
    ├── app/                                       # Expo Router Definitions (File-System Based Navigation)
    │   ├── _layout.tsx                            # Root-level layout that injects global Query/Theme and Auth/State providers
    │   ├── index.tsx                              # Gatekeeper screen handling automatic redirection logic upon boot
    │   ├── login.tsx                              # Navigational endpoint rendering the primary authentication gateway
    │   ├── register.tsx                           # Navigational endpoint rendering the new-user onboarding flow
    │   ├── (tabs)/                                # Tabbed Application Shell Navigation
    │   │   ├── _layout.tsx                        # Renders the global bottom navigation bar across core features
    │   │   ├── chart.tsx                          # Primary entry to the Skia charting screen
    │   │   ├── history.tsx                        # Primary entry to the finalized trades and account ledger
    │   │   ├── quotes.tsx                         # Primary entry to the live streaming watchlist dashboard
    │   │   ├── settings.tsx                       # Primary entry to the configuration and broker hubs
    │   │   └── trade.tsx                          # Primary entry to the active positions and margin view
    │   ├── chart/                                 # Modal navigation branches invoked from the Chart Tab
    │   │   ├── analytics.tsx                      # Navigational endpoint for charting depth analytics
    │   │   ├── calculator.tsx                     # Navigational endpoint for risk/margin pipeline estimators
    │   │   ├── colors.tsx                         # Navigational endpoint for customizing candle/background aesthetics
    │   │   ├── menu-order.tsx                     # Navigational endpoint for rearranging active indicators
    │   │   ├── objects.tsx                        # Navigational endpoint to manage saved technical drawing layers
    │   │   ├── open-order-mode.tsx                # Context-menu routing triggered when aiming a trade directly on canvas
    │   │   ├── price-source.tsx                   # Extracted UI allowing toggling between bid/ask/mid data streams
    │   │   ├── settings.tsx                       # Core chart toggle panel (volume lines, period separators)
    │   │   └── specification.tsx                  # Navigational callback traversing to SymbolDetails from the chart
    │   ├── history/                               # Modal navigation branches invoked from the History Tab
    │   │   └── filter.tsx                         # Navigational overlay containing an interactive date range selector
    │   ├── quotes/                                # Modal navigation branches invoked from the Quotes Tab
    │   │   └── details.tsx                        # Full-screen endpoint parsing trading sessions and spread metadata
    │   ├── settings/                              # Modal navigation branches invoked from the Settings Tab
    │   │   ├── accounts.tsx                       # Active Settings route managing connected/saved trading accounts
    │   │   ├── broker-detail.tsx                  # Active Settings route showing selected broker/server details
    │   │   ├── brokers.tsx                        # Active Settings route rendering the broker directory search
    │   │   ├── economic-calendar.tsx              # Active Settings route showing the current app-side economic calendar surface
    │   │   ├── help.tsx                           # Active Settings/sidebar route showing the FAQ help surface
    │   │   ├── interface.tsx                      # Active Settings route for theme/language/interface preferences
    │   │   ├── journal.tsx                        # Active Settings/sidebar route showing the trade journal surface
    │   │   ├── user-guide.tsx                     # Active Sidebar/About route showing the in-app user guide
    │   │   ├── legal.tsx                          # Active About route showing Terms or Privacy Policy content
    │   │   ├── about.tsx                          # Active Sidebar route showing app version, legal, rating, and contact actions
    │   │   ├── contact-developer.tsx              # Active About action route opening the support/contact request form
    │   │   └── account-deletion.tsx               # Active About action route opening the account deletion request form
    │   └── trade/                                 # Modal navigation branches invoked from the Trade Tab
    │       ├── bulk.tsx                           # Overlay initiating mass-closure of running asset positions
    │       ├── close-by.tsx                       # Overlay utilized for hedged position merging logic
    │       ├── close-position.tsx                 # Full-screen endpoint orchestrating single asset closure
    │       ├── modify-position.tsx                # Overlay for mutating active Take Profit or Stop Loss values
    │       ├── one-click-terms.tsx                # Legal acknowledgment gate preventing unintended execution
    │       └── order-ticket.tsx                   # Master operational modal supporting Market, Limit, and Stop Limit requests
    │
    └── src/                                       # Core Encapsulated Application Logic
        ├── api/                                   # Data Transportation and Fetch Logic
        │   ├── account.ts                         # Executes REST calls fetching core internal ledger variables
        │   ├── accounts.ts                        # Executes REST calls fetching an array containing all bound credentials
        │   ├── apiClient.ts                       # Singleton Axios instance appending authorization headers globally
        │   ├── auth.ts                            # Executes identity token exchanges and validations
        │   ├── broker.ts                          # Executes REST calls validating specific broker configuration parameters
        │   ├── candles.ts                         # Executes REST calls fetching paginated chunks of OHLCV history
        │   ├── deals.ts                           # Executes REST calls requesting historical trades bounded by timestamp
        │   ├── email.ts                           # Executes REST calls retrieving localized platform notification messages
        │   ├── equityHistory.ts                   # Executes REST calls retrieving net portfolio valuations over time
        │   ├── exposure.ts                        # Executes REST calls retrieving net asset weightings and leveraging stats
        │   ├── health.ts                          # Executes low-latency ping/pong latency evaluations against edge servers
        │   ├── mt5.ts                             # Isolates MT5 operational APIs bridging frontend UI directly to the gateway
        │   ├── mt5Account.ts                      # Isolates specific account snapshot extractions from MT5 storage
        │   ├── orders.ts                          # Executes complex transactional executions handling placing Market/Pending requests
        │   ├── positions.ts                       # Executes GET routines pulling all active running assets into client-state
        │   ├── transactions.ts                    # Executes REST calls detailing deposits, withdrawals, and ledger modifications
        │   └── ws/                                # WebSocket Socket Management
        │       ├── accountSocket.ts               # Listener binding incoming WebSocket payloads to real-time margin adjustments
        │       ├── candlesSocket.ts               # Listener binding incoming WebSocket payloads to M1/M5 chart tick updates
        │       ├── quotesSocket.ts                # Listener binding incoming WebSocket payloads to streaming bid/ask boards
        │       └── socket.ts                      # Instantiates and orchestrates automatic reconnection algorithms for the socket
        │
        ├── components/                            # Reused Agnostic UI Primitives
        │   ├── ActionSheet.tsx                    # Renders an animated iOS-style bottom pane presenting context-aware actions
        │   ├── MetricRow.tsx                      # Renders key-value pairings consistently formatted across modals
        │   ├── Screen.tsx                         # Master higher-order layout providing standard edge paddings and background themes
        │   ├── SectionHeader.tsx                  # Standardized label block physically segmenting complex lists
        │   ├── SidebarDrawer.tsx                  # Optimized navigational drawer specifically triggered on iPad/Tablet breakpoints
        │   └── TradePositionRow.tsx               # Handles the conditional color-coded Profit/Loss rendering of a specific asset
        │
        ├── features/                              # Visual Modules Sorted by Core Domain
        │   ├── chart/                             # [Domain: Charting]
        │   │   ├── ChartAnalyticsScreen.tsx       # View detailing deep-market analytics extracted directly from chart timeframes
        │   │   ├── ChartColorsScreen.tsx          # Selection UI letting users inject visual personalization into the Skia canvas
        │   │   ├── ChartMenuOrderScreen.tsx       # Re-orderable checklist dictating indicator layer stacking
        │   │   ├── ChartOpenOrderModeScreen.tsx   # View managing targeting crosshairs prior to limit execution
        │   │   ├── ChartPriceSourceScreen.tsx     # Toggle mechanism defining the data baseline passed into the graphing hooks
        │   │   ├── ChartScreen.native.tsx         # Root component mounting the imperative React Native Skia wrapper 
        │   │   ├── ChartScreen.ts                 # Platform detection router deferring layout rendering to Web or Native components
        │   │   ├── ChartScreen.web.tsx            # Fallback wrapper mounting a generic HTML5 layout avoiding compilation errors globally
        │   │   ├── ChartSettingsScreen.tsx        # Toggle board governing display boundaries (Grid intervals, ask lines, volumes)
        │   │   ├── ChartSpecificationScreen.tsx   # Navigational bridge tunneling from the chart back to core Symbol properties
        │   │   ├── ChartTradingCalculatorScreen.tsx# Utility logic determining exact margin requirements simulating pending actions
        │   │   ├── ChartTradingHoursModal.tsx     # Overlay conveying active market trading periods (Forex vs Equities)
        │   │   ├── image.png                      # Static placeholder graphic used conditionally within native chart styling bounds
        │   │   ├── ObjectsScreen.tsx              # Overlay listing all active technical drawings enabling swift deletions
        │   │   ├── TradingSignalDetailsModal.tsx  # Presentation UI evaluating attached third-party technical recommendations
        │   │   ├── components/
        │   │   │   └── ChartToolbarIcons.tsx      # Handles interaction mappings (Play, Pause, Select) for chart headers
        │   │   └── plugins/                       # Contains all customized Skia rendering augmentations
        │   │       ├── drawing-tools-manager.ts   # Core orchestrator converting touch gestures into vector line placements
        │   │       ├── plugin-base.ts             # Defining standard interface properties required by any new charting plugin
        │   │       ├── rectangle-drawing-tool.ts  # Class painting customizable supply/demand box overlays
        │   │       ├── trend-line.ts              # Class painting flexible linear models plotting support/resistance zones
        │   │       ├── vertical-line.ts           # Class highlighting discrete timestamp events inside the candle rendering scope
        │   │       └── helpers/
        │   │           ├── assertions.ts          # Throws errors ensuring calculations don't bleed out-of-pane ranges
        │   │           ├── dimensions/common.ts   # Unified measurement variables used across the Skia render tree
        │   │           └── dimensions/positions.ts# Translator mapping domain data slices to absolute Y-Axis screen coordinates
        │   │
        │   ├── history/                           # [Domain: History]
        │   │   ├── HistoryFilterScreen.tsx        # UI constructing timestamp bounds parsing records for a specific interval
        │   │   ├── HistoryScreen.tsx              # Renders detailed aggregations compiling past trade profits and executed deals
        │   │   └── rtx-5-mobile.txt               # Local log artifact temporarily trapping unparsed data-stream events
        │   │
        │   ├── quotes/                            # [Domain: Subscriptions]
        │   │   ├── QuotesScreen.tsx               # The absolute root of all streaming views managing virtualized data grids
        │   │   └── SymbolDetailsScreen.tsx        # Generates an exhaustive list of properties (Lot steps, spread models, leverage)
        │   │
        │   ├── settings/                          # [Domain: Configuration]
        │   │   ├── AccountsScreen.tsx             # Connected/saved account manager, account switching, broker logo lookup, and session reconnect UI
        │   │   ├── AboutScreen.tsx                # App version, rating, user guide, privacy, account deletion, and contact developer surfaces
        │   │   ├── BrokerDetailScreen.tsx         # Selected broker details, server/domain data, and demo/real account entry actions
        │   │   ├── BrokersScreen/                 # Broker directory search/list implementation and broker row components
        │   │   ├── ChangePasswordSheet.tsx        # Account password-change sheet used from the active account management surface
        │   │   ├── ChartPropertiesScreen.tsx      # Local chart colors/properties editor reused by chart/settings routes
        │   │   ├── EconomicCalendarScreen/        # Current economic calendar UI using app-side calendar data and filters
        │   │   ├── HelpScreen.tsx                 # FAQ help screen exposed from Settings and the sidebar
        │   │   ├── InterfaceScreen.tsx            # Theme, language, and interface preference screen
        │   │   ├── JournalScreen/                 # Trade journal UI built from positions, deals, history, and local journal state
        │   │   ├── LegalDocumentScreen.tsx        # In-app Terms and Privacy Policy document viewer
        │   │   ├── SettingsScreen/                # Main Settings hub with account card, Economic Calendar, Theme, Language, Journal, Support, Help, Logout
        │   │   └── UserGuideScreen.tsx            # In-app RTX5 user guide exposed from the sidebar and About screen
        │   │
        │   └── trade/                             # [Domain: Modifiers]
        │       ├── BulkOperationScreen.tsx        # Submits an array of active ticket IDs commanding absolute immediate position closure
        │       ├── CloseByScreen.tsx              # Resolves colliding Buy/Sell tickets extracting maximal margin release via backend logic
        │       ├── ClosePositionScreen.tsx        # Generates a singular execution payload to flatline an active contract unconditionally
        │       ├── ModifyPositionScreen.tsx       # Restricts SL/TP mutations by validating parameters against absolute market proximity
        │       ├── OneClickTermsScreen.tsx        # Manages the UI gate flipping 'one-click execution enabled' in global settings
        │       ├── OrderTicketScreen.tsx          # Exposes full variable inputs calculating lot values before releasing limit strings to Server
        │       ├── tradeFlow.ts                   # Houses pure business logic filtering hedge candidates and bulk order array manipulations
        │       └── TradeScreen.tsx                # Generates the virtualized, color-responsive representation of the current live portfolio
        │
        ├── hooks/                                 # Shared Event Subscriptions
        │   ├── useDemoCandles.ts                  # Injects deterministic random-walk algorithms mocking real-world market movements
        │   └── useLiveCandles.ts                  # Bridges raw WebSocket byte-data into usable React arrays triggering chart updates
        │
        ├── mock/                                  # Development/Placeholder Overrides
        │   ├── candleGenerator.ts                 # Algorithmic system generating localized test intervals for component isolation
        │   └── tradingData.ts                     # Comprehensive JSON snapshot supplying immediate UI data preventing skeleton loader flicker
        │
        ├── providers/                             # Layout Level Context Wrapping
        │   └── AppProviders.tsx                   # Top-level injection hub establishing generic TanStack cache configurations and Themes
        │
        ├── query/                                 # Server State Abstraction (TanStack)
        │   ├── account.ts                         # TanStack hook binding account metadata to component lifecycles
        │   ├── accounts.ts                        # TanStack hook syncing a collection of valid remote profiles against device states
        │   ├── broker.ts                          # TanStack hook providing localized lookups for target institutional properties
        │   ├── candles.ts                         # TanStack hook preventing redundant pulls of historical chunks already loaded into RAM
        │   ├── deals.ts                           # TanStack hook maintaining sorted lists of all finalized transactions across the session
        │   ├── email.ts                           # TanStack hook listening to upstream notifications buffering read/unread thresholds
        │   ├── equityHistory.ts                   # TanStack hook generating data arrays feeding directly into portfolio-performance graphs
        │   ├── exposure.ts                        # TanStack hook wrapping mathematical conversions denoting margin usage and safety metrics
        │   ├── health.ts                          # TanStack hook repeatedly requesting server latency metrics ensuring network stability
        │   ├── market.ts                          # TanStack hook updating the UI dynamically when a market transitions to closed/holiday
        │   ├── mt5.ts                             # TanStack hook mapping raw MT5 payload data to modern REST schemas
        │   ├── mt5Account.ts                      # TanStack hook querying direct snapshot ledgers ensuring frontend UI parity
        │   ├── orders.ts                          # TanStack hook linking pending network requests to localized memory modifications
        │   ├── positions.ts                       # TanStack hook storing exactly identical replicas of remote ongoing positions
        │   ├── transactions.ts                    # TanStack hook providing historical lists explicitly isolated to user money transfers
        │   └── websocket.ts                       # TanStack hook surfacing network heartbeat statuses directly to the visual layer
        │
        ├── state/                                 # Global Memory (Zustand Stores)
        │   ├── liveAccountState.ts                # Transient memory constantly reacting to streaming WebSocket balance updates
        │   ├── positionsState.ts                  # Mutable local state manipulated during Optimistic UI updates bypassing network latency
        │   ├── tradingLogin.ts                    # Persistent memory tracking connection identity properties retaining users offline
        │   ├── tradingState.ts                    # Mutable state flagging immediate order validation flows (e.g. bypassing confirmations)
        │   ├── uiState.ts                         # Strictly ephemeral properties dictating Active Tab selection and Dropdown open/close vars
        │   └── userPreferences.ts                 # Dedicated SecureStore linkage preserving strict app-level configurations (Theme/Fonts)
        │
        ├── theme/                                 # UI Appearance Handlers
        │   ├── glass.ts                           # Encapsulates rigid HEX definitions enabling standard blur implementations uniformly
        │   ├── index.ts                           # Unifies typography rules and core spacing metrics to prevent layout variations
        │   └── useTheme.ts                        # Native hook observing operating-system level changes reflecting layout swaps instantaneously
        │
        └── utils/                                 # Application-Agnostic Helpers
            └── format.ts                          # Provides deterministic floating-point precision wrappers converting deep decimals cleanly
