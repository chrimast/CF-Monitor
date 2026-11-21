# Upstream integration: 2.8.7 into CF-Monitor

## Provenance

- Fork starting point: `a92c09f` (local `main`).
- Explicit upstream content baseline: `79679db` (2.8.6).
- Audited upstream tip: `1be24f0eabdcc2d06c215c45258382b02e438b49`.
- The repositories have unrelated Git histories. The tree was produced with `git merge-tree --write-tree --merge-base=79679db a92c09f 68c1258` and resolved semantically on `cf-monitor-upstream-integration`. The three later auth commits were reviewed independently below. This is a local, single-parent integration on fork history, not a claim that upstream history has been merged or that all tip behavior is enabled.
- Runtime version is `2.8.7 CF-Monitor`. Fork package identity/version (`cf-monitor`, `0.1.0`), xterm dependencies, lockfile, release endpoints and deployment workflows remain fork-owned.

## Commit coverage ledger

Every commit in `79679db..1be24f0` is listed here. Merge commits represent the same reviewed code as their constituent commits.

| Upstream commit | Disposition |
|---|---|
| e5e9a02 | Already implemented in fork: credentials passed directly, Unicode usernames supported. |
| a5b6ca5 | Integrated cron/database optimizations, adapted to fork's single heartbeat and editable execution intervals. |
| 1355c85 | Integrated latest-metrics batching/fallback. |
| fa60c60 | Integrated locale registry, Spanish UI and localized notifications. |
| f09b7d4 | Integrated admin UI/help changes; fork branding retained. |
| bbfbd8b | Integrated simplified initial install arguments; dynamic agent options continue through config negotiation. |
| 42ad10a | Integrated HTTP/frame payload bounds, samples limit and removed-agent socket revalidation. |
| b5e7d83 | Integrated opt-in empty-ID auto-discovery, protected by API_SECRET. |
| 4a8d3f5 | Integrated detail timestamp correction. |
| fd345b6 | Integrated auto-discovery reuse/naming/error handling. |
| dea4840 | Integrated auto-discovery API documentation. |
| ee8ecbf | Integrated explicit admin server-cache refresh. |
| dcd37ff | Integrated auto-discovery command modal; fork agent install source and system-service model retained. |
| ad41c7d | Integrated lazy locale files and language selector; fork EN/ZH translations retained, added fork-only keys use English fallback in other locales. |
| 1c77b4d | Integrated cache TTL/capacity work. |
| 0da0709 | Integrated shared cron settings read, refresh cadence and fallback; preserves fork's configurable Cron and preferred-IP jobs. |
| ed8c869 | Integrated dashboard latency completion. |
| dd785ea | Integrated PWA favicon/manifest injection and assets; fork title/theme retained. |
| 5ddd42c | Integrated configurable Agent User-Agent and authenticated negotiation; this value is not a server authorization credential. |
| 8b7180f | Integrated save-order and latency D1 batching. Added SQLite D1 transactional `batch()` adapter. |
| e577e35 | Covered by D1 batch changes. |
| ee6020b | Integrated isolated per-server latency failures/write convergence. |
| bee3602 | Integrated atomic history partition allocation. |
| 609cc0b | Integrated site/appearance import/export; preserves protected environment-specific fields and fork cron settings. |
| 7d7dd34 | Integrated Docker probe host-metrics flags, retaining fork probe image. |
| 0b62b14 | Integrated multi-server Scriptable widget. |
| eae0daf | Integrated 90th-percentile widget chart scaling. |
| a1c5bad | Covered by multi-widget changes. |
| 4b9d4bb | Integrated widget missing/timeout/flag/layout handling. |
| 4aaca0d | Integrated widget pagination and size layouts. |
| b383b4d | Integrated ping widget and latency/medium layout. |
| b18b36f | Integrated TCP/UDP connection-count alerts, including missing-data behavior. |
| 82a697c | Integrated mobile clear-input controls and UI changes. |
| 612027c | Integrated HTTP/WSS client-IP fallback only when reported public IP absent. |
| 68c1258 | Integrated stable 2.8.7 code; package/release metadata uses fork identity. |
| 7f44660 | Excluded static `cfsm_ua` marker cookie, edge-rule allow recipes, related widgets' UA evasion configuration and UI/docs/tests. Static shared values must not become auth or challenge bypass. Existing authenticated Agent UA negotiation from 5ddd42c retained. |
| 8f86307 | Adapted only the `X-App-Password` header contract for scoped REST reads using a runtime secret. Upstream persisted password setting, hidden-node and WS grants, global Turnstile bypass, and 2.8.8 metadata remain excluded. |
| 1be24f0 | Excluded App-password login Turnstile bypass. Login continues to require its own fresh provider token. |

## Conflict decisions and preserved contracts

- README, theme authoring docs: fork deployment names, secrets workflow, Docker instructions, terminal warning and branding remain authoritative. Upstream operational docs are not copied over the fork's deployment instructions. New features and exclusions are documented here and in API.md.
- `index.html`, CSS: retain fork title, opaque card styling and existing styling; add PWA links and upstream clear-control/language UI styles. Solid card variables remain available.
- `package*.json`, `version.json`: retain fork dependencies/lockfile; extend default tests with integrated tests; runtime version identifies the fork, without claiming 2.8.8 auth parity. Upstream lockfile's extraneous miniflare root metadata is not imported; Wrangler supplies the local Worker runtime.
- `i18n.js`: use upstream lazy locale registry with all fork EN/ZH terminal, DNSHub, WAF and Cron labels ported to locale modules. Tests now read locale modules rather than the removed inline dictionaries. Non-EN/ZH fork-specific labels currently use English.
- Settings and SettingsPanel: union of upstream auto-discovery/UA/notification-language settings and fork Cron fields/imports. Protect credentials, JWT, Turnstile and UA from settings import/export as upstream specifies.
- Admin installer: keep `chrimast/cfm-agent` release URLs/images and system install behavior. Import upstream simplification and UA negotiation. Dedicated `cfsm` user wrappers/options are excluded because the fork Agent's installer uses its own system-service contract.
- SMTP notification conflict: use Node SMTP adapter when supplied, with upstream localized notification subject; Worker SMTP still uses cloudflare-smtp.
- Agent tests: combine upstream payload/history/IP bounds with fork WSS idle HTTP and terminal tests.
- `auth.js`: fork already contains Unicode credential fix; preserve JWT validation and cookie/websocket auth. No UA-cookie or App-password bypass.
- Docker remains a Node HTTP/WS host with persistent SQLite, in-memory DO adapter, terminal and scheduled jobs. Workers retains D1, both Durable Object bindings and existing CI/binding/secret configuration.
- DNSHub and WAF CRUD/forwarding and read-only WAF `logs_history`, native `/verify/turnstile`, public latency and idle `wss_idle_http` remain covered by focused regression tests.

## Validation

Execution evidence is saved under `/opt/data/cache/scratch/` for this local integration.

- `npm ci` succeeded; `npm ci --dry-run --ignore-scripts --no-audit --no-fund` confirms dependency/lock consistency. Npm 11/Node 26 reports dependency install scripts blocked; packaged esbuild/workerd executables nevertheless run and both real builds pass.
- Focused initial regressions: 56 passed. New SQLite batch test first failed with missing `db.batch`, then passed with ordered query results and rollback semantics. Additional integration/auth checks passed, including rejection of App-password/UA-marker-only Turnstile bypass.
- Final `npm run test:all`: default `npm test` 224 passed, 0 failed; standalone Agent config checks passed; history-query suite 6 passed, 0 failed. Frontend, Wrangler dry-run and Docker image were rebuilt after the last production-code edits.
- Frontend production build passed, including all lazy locales, reverse terminal and admin chunks.
- Wrangler 4.120.0 `deploy --dry-run` passed: DB, METRICS_BROADCASTER, TERMINAL_HUB and ASSETS recognized.
- Real Wrangler `dev --local` + isolated D1 passed health, config/bootstrap, login, add, HTTP update, latest metrics, history, protected admin rejection, DNSHub/WAF collection reads, settings write/read and public server list. An idle Agent WSS upgrade returned 409 `wss_idle_http`. Final successful run log: `cfm-smoke-worker-97212144/worker.log`.
- Local Docker image built with Node 22 (`node:22-bookworm-slim`), not miniflare. A baseline image from exact `a92c09f` created SQLite with server/history. Updated image opened that volume, retained historical CPU/partition, added a new distinct partition and report, then restarted and preserved both records. `PRAGMA integrity_check` returned `ok`. Final image ID: `0f1887e81f6d`. Final successful run artifacts: `cfm-smoke-docker-5af4d5b8/`. Containers use unique names/volumes, no production resources.
- Docker daemon runs outside this tool's network namespace. Host-loopback mapped-port probe could not connect, so actual container HTTP probes execute inside the container through `docker exec` with Node fetch. Volume data was copied out for SQLite integrity/partition checks.
- Latest-metrics REST cache can remain stale for 30 seconds after adding/reporting another server; live latestReportUpdates is separate. Smoke verification polls through this existing TTL rather than asserting immediate cold-cache behavior.
- D1 tables are initialized through `/api/config` (the normal client bootstrap). Direct login followed by add on an uninitialized local D1 otherwise fails with `no such table: servers`; bootstrap is included in smoke probes.
- WSS/terminal, SMTP adapter and retained modules run through repository regression tests. No real provider challenge, remote SMTP, DNS vendor writes, real host PTY or production Cloudflare deployment is exercised.

## Client impact

An optional `APP_PASSWORD` runtime secret grants `X-App-Password` access to visible server list, detail and up to 24 hours of history on private sites. See [API.md](../API.md#e-可选只读-app-口令) for setup and rotation. App-only clients can poll REST. Private monitoring WS retains JWT auth because the existing Durable Object lets clients change subscription scope after the handshake. Global and login Turnstile still validate independently. The Flutter repository is outside this server change.

## App password verification

- TDD feature suite started with 5 failures at private read authorization and 2 passing boundary regressions. Focused run passed 14 tests. `npm run test:all` passed 231 default tests, 6 history-query tests and the standalone Agent config suite.
- Frontend build, Wrangler dry run and local Docker image build passed. The same smoke probe passed on isolated Wrangler local Workers/D1 and Docker Node 22/SQLite. It checked visible list/detail/history with a real stored sample, hidden denial, wrong and absent credentials, admin/settings/backup boundaries, Agent and terminal denial, public behavior and Turnstile rejection without proof. The existing Docker HTTP host returns 400 for refused WS handshakes while Workers returns 401. Existing admin and public WS handshakes returned 101 on both.
- Positive Turnstile verification and fresh login-token behavior used a stubbed Siteverify response in focused tests. No live provider challenge or production deployment was performed. Evidence and the smoke probe are in `/opt/data/cache/scratch/cfm-app-password-7205402/`.
