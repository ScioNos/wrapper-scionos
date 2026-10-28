# Version 8.0.0 development validation

This record separates validation of source commit `f0a4e1efbf7b761c28981410be93293a4f1f5a1f` on branch `8.0.0` on 28 October 2026 from the earlier 26 October snapshot. The [GitHub beta](https://github.com/ScioNos/wrapper-scionos/releases/tag/v8.0.0-beta.1) was published on 27 October from `a77500f`, including its package archive; it is not published on npm. Later source fixes are listed under [Unreleased](../CHANGELOG.md#unreleased). The [7.3.0 record](./release-7.3.0-validation.md) remains historical evidence for that release.

## Source validation — 28 October 2026

Environment: Windows, Node.js 24.22.1, npm 12.2.0. Runtime results below concern the source commit above. Documentation contracts, package contents and formatting were rechecked after the documentation corrections; the published beta archive was checked separately. Tests use temporary files, fake credentials and loopback providers; production RouterLab inference and personal application configuration are outside their scope.

| Check | Result |
| --- | --- |
| `npm test` | 304 tests: 303 passed, 1 skipped, no failures during the documentation correction |
| `npm run test:coverage` | 304 tests: 303 passed, 1 skipped, no failures; 93.96% lines / 86.42% branches / 92.27% functions; thresholds 85% / 80% / 85% passed |
| Runtime compatibility guard | Node.js 24.x required; the guard rejects 22.13.0. The older Node 22 results below predate this requirement |
| `npm run test:entry-modes` | Four checks passed: installed command and npx, each with RouterLab and RouterLab LLM, using an isolated local package |
| Published beta archive | SHA-256 matches the GitHub asset digest; the documented `npx --prefix .` invocation returns `8.0.0-beta.1` with `--version` |
| `npm run test:claude-real` | 13 passed with installed Claude Code 2.1.309 |
| `npm run test:codex-real` | 1 passed with installed Codex CLI 0.157.0 |
| `npm run test:opencode-real` | 1 passed with installed OpenCode 2.0.27, including the native read-tool cycle |
| `npm run test:codex-app-real` | 1 passed with App 26.1023.6123.0 and embedded engine 0.165.0-alpha.1.2, isolated CODEX_HOME, temporary DPAPI store and loopback Responses |
| `npm run test:keychain-real` | Skipped locally on Windows; the current source CI includes a successful real macOS Keychain job |
| `npm audit` | Zero vulnerabilities reported on 28 October |
| `npm pack --dry-run` | Passed; 62 files, including all eight Markdown documents; tests, caches and local audit fixtures excluded |
| Documentation contracts | CLI examples, documented LLM subagents, model mappings, catalogues, release-check lists and local links checked against the current code; corrected examples and links rechecked after editing |
| `git diff --check` | Passed after the documentation corrections |

[GitHub Actions run 40689743547](https://github.com/ScioNos/wrapper-scionos/actions/runs/40689743547) completed successfully for that exact source commit: ten successful jobs, zero failures. It includes three general jobs on Windows/macOS/Linux, six OpenCode jobs for versions 1.18.30 and 2.0.27 on those systems, and one independent macOS Keychain job. All use Node 24. This source CI result predates the documentation-only corrections and does not establish GUI application compatibility.

## Historical validation — 26 October 2026

The following original results describe the 26 October working tree. Their test counts, client versions, coverage, Node 22 boundary and manual terminal observations are historical. The manual ConPTY and WSL sessions were not repeated during the 28 October documentation audit.

### Automated checks on Windows

Environment: Windows, Node.js 24.22.1, npm 12.2.0. Tests use temporary files, fake credentials and loopback providers. They do not send inference requests to production RouterLab services.

| Check | Result |
| --- | --- |
| `npm test` | 279 tests: 278 passed, 1 skipped, no failures |
| Node.js 22.13.0 boundary | Same 279 tests: 278 passed, 1 skipped, no failures |
| `npm run test:coverage` | 93.62% lines / 85.99% branches / 92.30% functions; passed configured thresholds of 85% / 80% / 85% |
| `npm run test:entry-modes` | Four checks passed: installed command and npx, each with RouterLab and RouterLab LLM |
| `npm run test:claude-real` | 13 passed with installed Claude Code 2.1.296 |
| `npm run test:codex-real` | 1 passed with installed Codex CLI 0.157.0 |
| `npm run test:opencode-real` | 1 passed with installed OpenCode 2.0.27 |
| `npm run test:codex-app-real` | 1 passed with installed Codex App 26.1021.3705.0, embedded engine 0.164.0-alpha.11.1, isolated home and local Responses server |
| `npm run test:keychain-real` | Skipped on Windows; this test requires macOS |
| `npm audit` | Zero vulnerabilities |
| `npm pack --dry-run` | Passed; 62 files, including mouse input, all App modules and the independent credential-helper sources; no local validation fixtures |
| `git diff --check` | Passed |

The earlier console entry-mode check required leaving the sandbox after a package-install timeout. The 26 October four entry-mode checks, audit and package preview passed using the workspace npm cache.

The console tests cover English, French and German; Home, Launch, Desktop / Cowork, account and diagnostics; all keyboard shortcuts; pagination, Unicode widths and resize rendering; missing and incompatible clients; missing credentials, inaccessible storage and failed network preparation; removed saved models and families; launch cancellation, successful spawn, failure and interruption; terminal restoration and signal-listener cleanup; SIGTERM during login and native execution; proxy ownership, multi-family editing, cancelled and confirmed restoration, port conflict reporting and shutdown.

Preferences are exercised through real temporary files across independent reads and writes, including service/client isolation, malformed files and failed writes. Prepared launch capabilities are tested against the actual adapters: they create no launch resources, expose no token, and revalidate discovery before execution. The managed Desktop test starts a real HTTP server and writes only isolated temporary profiles; existing gateway tests also cover real port conflicts.

### Codex App configuration and native engine

Temporary TOML fixtures cover comments, multiline values, quoted keys, nested tables, six MCP entries, existing custom providers, UTF-8 BOM, LF/CRLF, missing and invalid files. They assert exact round trips, idempotence, one original backup across model changes, exclusive ownership, failed writes, concurrent edits, abandoned prepared journals, and recovery after a completed restoration interrupted before journal deletion. A personal change to an owned root key or provider blocks the whole restore; unrelated changes survive. Dry runs create no files. Corrupt journals and existing unowned reserved providers are refused.

App command and console checks cover six shortcuts in three languages, independent App/CLI preferences and service namespaces, preview/confirmation rules, single JSON envelopes, missing/unsupported apps, outdated embedded engines, removed models, app-already-running notices, navigation after opening, graceful-close requests, cancelled exit, leave-open restoration, SIGINT/SIGTERM and listener cleanup. Manual restoration keeps the open App in the exit-choice lifecycle; cleanup retains assets outside the owned session. A real redirected Node subprocess verifies that direct launch remains alive after the GUI detaches, then restores on interruption. Signal listeners alone do not keep Node alive; the command explicitly holds its lifecycle until shutdown.

The native test uses the installed App's own executable, a temporary CODEX_HOME and a loopback Responses provider. Its standalone copied helper successfully decrypts a fake DPAPI credential from an isolated store without RouterLab environment variables. Native app-server loads the generated catalogue, executes a real shell tool (`echo`), receives its result and completes a second user turn through Responses. TOML, journal and catalogue contain no test token. The GUI application and production config are not activated, closed or restarted by this test. The same script reports a skip on hosts without a supported installed App; a skip does not establish engine compatibility on that host.

### Interactive terminal checks

Mouse checks cover SGR and legacy packet fragmentation at every byte boundary, incomplete/malformed/oversized reports, release and modifier filtering, SSH-style environments and explicit opt-out. Hit targets are checked against rendered rows in all three languages at 206x35, 120x35, 80x24, 60x18 and 50x12, including modal isolation and disabled choices. Prompt checks exercise all six tools, navigation, language, wheel clamping, clickable pagination, long read-only journals, live resize, abort, early abort before first render, Ctrl+C, EOF, input errors and listener cleanup. A mouse-only controller journey selects a family/model, changes language, toggles remembering, cancels then confirms a launch, returns after status 130, chooses Cowork and exits.

Actual Windows ConPTY sessions at 120x35 and 80x24 verified clicks, language changes, wheel movement and paging, plus native-client handoff. A regression where paused Windows input kept an OS read pending was corrected using Node's stdin read-stop sequence. The duplicated handle now stays paused across clients and closes at final shutdown. Repeated launches, normal child exit, Ctrl+C returning Home and Q-only exit completed without EPIPE or an extra Enter. Mouse reporting is disabled during native execution and enabled again on return.

The language control was checked in a real Windows 80×24 pseudo-terminal: `L` opens English/Français/Deutsch, each selection updates the header, menus and keyboard help, and the AWS family displays `💸 Claude via AWS` in both selection and launch summary. Tests additionally verify cancellation, no network discovery during a language change, preservation of service/model selections, launch-language propagation and the linear fallback. Language changes are session-local; startup flags/environment keep their existing meaning.

Windows pseudo-terminals were exercised at **120×35** and **80×24**, with `TERM=xterm-256color`. Home, Launch and Desktop applications were inspected, including sidebar versus top navigation, confirmation, keyboard focus and return paths. Automated rendering checks additionally cover 100×24, 60×18 and a compact view after shrinking below the structured-console threshold.

A local interactive child used the actual launch adapter and process runner with a fixture catalogue, temporary proxy and in-memory preferences. Repeated normal exits, Ctrl+C returning status 130, relaunch after interruption, and clean wrapper exit were exercised. No user Desktop profile or production credential was changed by this fixture. Windows input handles are owned separately from inherited stdin, with OS reads stopped before native execution and resumed on return.

The installed native-client integration checks validate routing, temporary configuration and cleanup against loopback fixtures. They are separate from the interactive child handoff check and do not establish live-model compatibility.

The App terminal fixture uses the actual configuration/session adapter with temporary files, a fixed fixture catalogue and a simulated GUI opening. Both sizes passed activation, return Home and exact TOML restoration. The wide session also checked desktop application selection and cancellation of exit before leave-open restoration; the narrow session checked the graceful-close choice. An initial Windows EPIPE on immediate terminal handoff was reproduced and corrected: desktop activation keeps the console TTY attached, because it does not take foreground terminal input. Both terminal sizes were rerun successfully after that correction. No personal config or production credential was changed.

### Linux scope

The 26 focused console/mouse tests pass under Debian WSL with the official Node.js 22.13.0 runtime. Linux pseudo-terminal sessions at 120x35 and 80x24 verify mouse selection, launch confirmation, a real local child, interruption/normal exit and return Home, followed by Q-only shutdown. These use fixture catalogues, temporary local resources and in-memory preferences; the session D-Bus address is disabled so these checks cannot request the system keyring. They do not establish results on a remote SSH server or macOS.

An attempted full Linux suite from the Windows-mounted workspace was not a passing cross-platform result: it reported 241 passed, six failures, one cancellation and two skips before all tests could finish. Five failures concern Unix permissions reported as 0777 on the mounted Windows drive, one App subprocess exceeded its startup deadline, and the v4 diagnostic tests timed out after requesting the locked system keyring. The run ended; no password or keyring unlock is needed for the interface checks. The successful 28 October Node 24 CI run above provides subsequent automated Linux validation; it does not repeat the manual WSL terminal checks.

## Remaining application and terminal checks

- Repeat the Node 24 CI matrix when source code changes after the validated commit above.
- Inspect macOS and remote SSH/VPS terminals at 120x35 and 80x24, including interruption and return from each installed native client. Local Linux WSL child fixtures are covered above.
- Exercise the real Claude Desktop / Cowork application with the applied profile. Profile/proxy tests do not constitute an application-level Cowork test.
- Exercise explicit Codex App activation on the real user config and perform a controlled GUI restart, then check normal/leave-open exit and restoration. This was intentionally kept separate from isolated engine validation; the calling Codex App session was not closed or reconfigured.
- Validate App bundle opening, graceful closure and secure-store authentication on a real macOS host. macOS unit fixtures do not constitute an App-level result. Linux App absence is handled explicitly.
- Production RouterLab access and model inference were not exercised with user credentials.

The source commit above has passed its automated cross-platform checks. Application-level GUI, remote-terminal and production-inference acceptance remain separate steps; later source fixes require a new release archive before they are distributed.
