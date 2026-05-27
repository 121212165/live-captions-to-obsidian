# Live Captions to Obsidian — Refactoring Plan v2

> Generated: 2026-05-27
> Method: 5 parallel expert agents (Architect, TypeScript Quality, Security, DX, CI/CD)
> Status: Analysis complete, ready for execution

---

## Executive Summary

The project completed Phase 1 of a refactor (extracted `lib/ps-process.ts`, `lib/typed-event-emitter.ts`, `lib/dedup.ts`, `config-loader.ts`, `logger.ts`, split PS1 scripts) but **never wired the new code into the consuming modules**. Result: ~400 lines of dead library code alongside ~80 lines of duplicated inline logic.

**Core task:** Wire the existing refactored modules into production code, delete the dead monolith, decompose the god module, and close test/CI gaps.

---

## Diagnosis by Role

### Architect
- `index.ts` is a god module (CLI + config + orchestration + state + events + cleanup)
- `monitor.ts` and `capture.ts` duplicate ~40 lines of spawn/parse/kill each
- Double-"gone" event: `capture.ts` emits from both PS1 message and process close
- `config-loader.ts` has a complete 4-layer cascade that `index.ts` ignores

### TypeScript Quality
- 4 HIGH dead-code findings: `lib/ps-process.ts`, `lib/typed-event-emitter.ts`, `lib/dedup.ts`, `logger.ts` never imported
- `capture.ts` dedup private method diverged from `lib/dedup.ts` (extra overlap branch)
- Sync I/O in `writer.ts` blocks event loop during caption writes
- 6 of 9 source modules have zero test coverage

### Security
- No CRITICAL or HIGH findings
- One MEDIUM: `uia-capture.ps1` uses deprecated `LoadWithPartialName` (new `.psm1` already fixed this)
- All other risks LOW and acceptable for a local desktop tool

### Developer Experience
- `--verbose`, `--log-file`, `--no-color` CLI flags parsed but never reach Logger
- Env var name mismatch: `OBSIDIAN_VAULT_PATH` (config.ts) vs `LIVE_CAPTIONS_VAULT` (config-loader.ts)
- 4 overlapping launcher scripts with no documented entry point
- README is stale: missing `cli.ts`, `config-loader.ts`, `logger.ts`; wrong sample output language

### CI/CD
- `tsc --noEmit` passes, ESLint passes (41 warnings), vitest passes (24/24)
- CI powershell-check only covers 2 of 5 PS1/PSM1 files
- Build artifact (`dist/`) is useless: no `bin` field, no asset copy, app only runs via `tsx`
- `@vitest/coverage-v8` missing from devDeps, `test:coverage` script would fail
- `lint-staged` config exists but no pre-commit hook to trigger it

---

## Phase 1: Wire Refactored Modules (P0)

> Goal: Eliminate all dead code by connecting it to production paths.

### 1.1 `monitor.ts` — Use PsProcess + TypedEventEmitter + split script

**Before:** 95 lines, manual spawn, raw EventEmitter, spawns `uia-capture.ps1` with `cmd: "watch"`.

**After:**
```
- Extend TypedEventEmitter<MonitorEvents> instead of EventEmitter
- Replace inline spawn/stdout/stderr/kill with PsProcess
- Spawn watch-window.ps1 instead of uia-capture.ps1 (no cmd JSON needed)
- Remove ~40 lines of duplicated process management
```

### 1.2 `capture.ts` — Use PsProcess + TypedEventEmitter + dedup.ts + split script

**Before:** 124 lines, manual spawn, raw EventEmitter, inline `extractNewLines`, spawns `uia-capture.ps1`.

**After:**
```
- Extend TypedEventEmitter<CaptureEvents> instead of EventEmitter
- Replace inline spawn/stdout/stderr/kill with PsProcess
- Import extractNewLines from lib/dedup.ts (delete private method)
- Merge the extra overlap-dedup branch from the private method into lib/dedup.ts
- Spawn read-captions.ps1 instead of uia-capture.ps1
- Add goneEmitted flag to prevent double-gone (see 1.4)
- Remove ~50 lines of duplicated code
```

### 1.3 Delete `src/scripts/uia-capture.ps1`

The monolith is fully superseded by `watch-window.ps1` + `read-captions.ps1` + `uia-common.psm1`:
- Shared UIA logic via `.psm1` module (no duplication)
- `trap` error handling (monolith lacks this)
- Heartbeat messages for health monitoring
- `ConvertTo-Json` instead of manual string formatting

### 1.4 Fix double-"gone" event

**Root cause:** `capture.ts` emits `"gone"` when PS1 sends `{"type":"gone"}` AND again on process close (PS1 exits after returning from `Invoke-Capture`).

**Fix:** Add `goneEmitted` boolean to `CaptureService`. Set `true` on PS1 "gone" message. In close handler, only emit if `!goneEmitted`.

### 1.5 Sync up `lib/dedup.ts` with `capture.ts` private method

The private method in `capture.ts:46-49` has an extra overlap-dedup branch not in `lib/dedup.ts`. Merge it:

```typescript
// Add to lib/dedup.ts after finding the LCP split point:
const prevTail = prevText.substring(i);
if (prevTail && newContent.startsWith(prevTail)) {
  newContent = newContent.substring(prevTail.length);
}
```

---

## Phase 2: Decompose `index.ts` (P0)

> Goal: Break the god module into single-responsibility units.

### 2.1 Create `src/app.ts` — Application orchestrator

```
class Application {
  constructor(config: Config, logger: Logger)

  start(): void
    - Create WindowMonitor, CaptureService, ObsidianWriter
    - Wire events: monitor.appear → startCapture, monitor.gone → cleanupCapture
    - Wire events: capture.text → writer.writeLines, capture.gone → cleanupCapture

  stop(): void
    - cleanupCapture(), monitor.stop(), logger.destroy()

  Private: isCapturing, lineCount, capture, writer
}
```

### 2.2 Create `src/lifecycle.ts` — Signal handlers

```
export function registerLifecycle(app: Application): void
  - SIGINT → app.stop() → process.exit(0)
  - SIGTERM → app.stop() → process.exit(0)
  - uncaughtException → log, app.stop() → process.exit(1)
  - unhandledRejection → log
```

### 2.3 Slim `src/index.ts` to ~20 lines

```typescript
import { parseArgs, printHelp, printVersion, validateConfig } from "./cli.js";
import { resolveConfig } from "./config-loader.js";
import { Logger } from "./logger.js";
import { Application } from "./app.js";
import { registerLifecycle } from "./lifecycle.js";

const { config: cliOverrides, options: cliOptions } = parseArgs(process.argv.slice(2));
if (cliOptions.help) { printHelp(); process.exit(0); }
if (cliOptions.version) { printVersion(); process.exit(0); }

const { config, sources } = resolveConfig(cliOverrides, cliOptions.configPath);
const errors = validateConfig(config);
if (errors.length > 0) { /* print errors */ process.exit(1); }

const logger = new Logger({
  level: cliOptions.verbose ? "debug" : "info",
  verbose: cliOptions.verbose ?? false,
  logFile: cliOptions.logFile,
  noColor: cliOptions.noColor ?? false,
});

const app = new Application(config, logger);
registerLifecycle(app);
app.start();
```

---

## Phase 3: Unify Config + Logger (P0)

### 3.1 Activate `resolveConfig()`

Replace `index.ts:25` (`{ ...defaultConfig, ...cliOverrides }`) with `resolveConfig(cliOverrides, cliOptions.configPath)`. This activates:
- `.live-captions.json` auto-discovery
- `LIVE_CAPTIONS_*` environment variables
- `--config <path>` CLI flag

### 3.2 Unify env var names

**Decision:** Use `LIVE_CAPTIONS_VAULT` (the `config-loader.ts` convention). Remove `OBSIDIAN_VAULT_PATH` from `config.ts:13`.

### 3.3 Wire Logger into all modules

- `Application` receives `Logger` via constructor, passes to `WindowMonitor` and `CaptureService`
- Replace all `console.log/error/debug` with `logger.info/error/debug`
- Remove hardcoded ANSI color codes from `index.ts:7-12`
- Add `src/index.ts`, `src/cli.ts`, `src/logger.ts` to ESLint `no-console` override (they legitimately use console for CLI output)

---

## Phase 4: Writer Async I/O (P1)

### 4.1 Convert `writer.ts` to async

```typescript
// Before
fs.writeFileSync(this.filePath, header, "utf-8");
fs.appendFileSync(this.filePath, content, "utf-8");

// After
await fs.promises.writeFile(this.filePath, header, "utf-8");
await fs.promises.appendFile(this.filePath, content, "utf-8");
```

- `beginSession()` → `async beginSession()`
- `writeLines()` → `async writeLines()`
- `Application.startCapture()` calls `writer.beginSession()` with `await`
- `capture.on("text")` handler becomes async or queues writes

### 4.2 File existence check at startup

Add to `validateConfig()` or `Application.start()`:
```typescript
if (!fs.existsSync(config.vaultPath)) {
  fs.mkdirSync(config.vaultPath, { recursive: true });
}
```

---

## Phase 5: Test Coverage (P1)

### 5.1 New test files

| Module | Test Strategy |
|--------|--------------|
| `cli.ts` | Unit: parseArgs with various argv combinations, validateConfig edge cases |
| `config-loader.ts` | Unit: resolveConfig with mocked fs, test 4-layer precedence |
| `logger.ts` | Unit: level filtering, file output, noColor mode |
| `typed-event-emitter.ts` | Unit: on/off/emit/removeAllListeners, error in handler |
| `app.ts` | Integration: mock PsProcess + mock Writer, verify event wiring |
| `ps-process.ts` | Unit: mock child_process.spawn, test sendCommand/stop/kill |

### 5.2 Fix `lib/dedup.ts` divergence

The test file `dedup.test.ts` tests `lib/dedup.ts` but `capture.ts` uses a different inline version. After Phase 1.5 merges them, all existing tests continue to pass.

### 5.3 Install coverage tooling

```bash
npm install -D @vitest/coverage-v8
```

Add coverage threshold to `vitest.config.ts`:
```typescript
coverage: {
  provider: 'v8',
  thresholds: { lines: 80, branches: 70 }
}
```

---

## Phase 6: CI/CD Fixes (P1)

### 6.1 Fix powershell-check

```yaml
# Before: hardcoded 2 scripts
$scripts = @('src/scripts/uia-capture.ps1', 'launcher.ps1')

# After: glob all project PS1/PSM1 files
$scripts = Get-ChildItem -Recurse -Include *.ps1,*.psm1 -Path src/scripts,*.ps1
```

### 6.2 Fix lint no-console

Add to `eslint.config.js`:
```javascript
{
  files: ["src/index.ts", "src/cli.ts", "src/logger.ts"],
  rules: { "no-console": "off" }
}
```

### 6.3 Add `engines` field to package.json

```json
{ "engines": { "node": ">=18" } }
```

### 6.4 Re-evaluate build job

Option A: Drop the `build` job (app only runs via `tsx`, `dist/` is never consumed).
Option B: Add `bin`, `files`, and a copy-assets step to make `dist/` actually runnable.

**Recommendation:** Option A for now. Add build back when publishing to npm.

---

## Phase 7: Cleanup (P2)

### 7.1 Launcher scripts

| File | Action |
|------|--------|
| `launcher.ps1` | **Keep** — primary entry point, checked in CI |
| `start-hidden.vbs` | **Keep** — internal helper used by launcher.ps1 |
| `launcher.bat` | **Delete** — duplicate of launcher.ps1 functionality |
| `start.bat` | **Delete** — 3-line wrapper, redundant with `npm start` |

### 7.2 Update README

- Add `cli.ts`, `config-loader.ts`, `logger.ts` to Project Structure
- Document `.live-captions.json` config file support
- Document `LIVE_CAPTIONS_*` environment variables
- Document all CLI flags (`--verbose`, `--log-file`, `--no-color`, `--config`, `--watch`, `--capture`)
- Fix sample output to match actual Chinese log messages
- Document `launcher.ps1` as the one-click entry point

### 7.3 Update package.json

```json
{
  "scripts": {
    "launcher": "powershell -ExecutionPolicy Bypass -File launcher.ps1"
  }
}
```

Remove dead `lint-staged` config (no pre-commit hook configured).

---

## Execution Order

```
Phase 1 (wire modules) ──→ Phase 2 (decompose index.ts) ──→ Phase 3 (config + logger)
         │                                                          │
         ▼                                                          ▼
Phase 5 (tests) ←────────────────────────────────────── Phase 4 (async writer)
         │
         ▼
Phase 6 (CI fixes) ──→ Phase 7 (cleanup + README)
```

Phases 1-3 are tightly coupled and should be done as one PR.
Phases 4-5 can be a second PR.
Phases 6-7 can be a third PR.

---

## Target Architecture

```
src/
├── index.ts                    # ~20 lines: CLI → config → logger → app.start()
├── app.ts                      # [NEW] Application class: orchestration, event wiring
├── lifecycle.ts                # [NEW] SIGINT/SIGTERM/uncaughtException handlers
├── cli.ts                      # CLI arg parsing, help, version (unchanged)
├── config.ts                   # Config interface + sub-interfaces
├── config-loader.ts            # 4-layer config resolution (ACTIVATED)
├── logger.ts                   # Structured logger (ACTIVATED)
├── monitor.ts                  # WindowMonitor: PsProcess + TypedEventEmitter
├── capture.ts                  # CaptureService: PsProcess + TypedEventEmitter + dedup.ts
├── writer.ts                   # ObsidianWriter: async I/O
├── lib/
│   ├── ps-process.ts           # PowerShell process lifecycle (USED)
│   ├── typed-event-emitter.ts  # Type-safe events (USED)
│   └── dedup.ts                # extractNewLines pure function (USED)
├── __tests__/
│   ├── config.test.ts          # existing
│   ├── dedup.test.ts           # existing
│   ├── writer.test.ts          # existing
│   ├── cli.test.ts             # [NEW]
│   ├── config-loader.test.ts   # [NEW]
│   ├── logger.test.ts          # [NEW]
│   ├── typed-event-emitter.test.ts  # [NEW]
│   ├── app.test.ts             # [NEW]
│   └── ps-process.test.ts      # [NEW]
└── scripts/
    ├── uia-common.psm1         # Shared UIA module (USED)
    ├── watch-window.ps1        # Window detection only (USED)
    └── read-captions.ps1       # Caption extraction only (USED)
    # uia-capture.ps1           # DELETED — superseded by split scripts
```

---

## Summary of All File Changes

| File | Action | Phase |
|------|--------|-------|
| `src/index.ts` | Rewrite: slim to ~20 lines | 2 |
| `src/app.ts` | **Create**: Application orchestrator | 2 |
| `src/lifecycle.ts` | **Create**: Signal handlers | 2 |
| `src/monitor.ts` | Refactor: use PsProcess + TypedEventEmitter + watch-window.ps1 | 1 |
| `src/capture.ts` | Refactor: use PsProcess + TypedEventEmitter + dedup.ts + read-captions.ps1 | 1 |
| `src/writer.ts` | Refactor: async I/O | 4 |
| `src/config.ts` | Update: remove OBSIDIAN_VAULT_PATH | 3 |
| `src/config-loader.ts` | No changes (already correct) | — |
| `src/logger.ts` | No changes (already correct) | — |
| `src/cli.ts` | No changes | — |
| `src/lib/ps-process.ts` | Minor: add goneEmitted support if needed | 1 |
| `src/lib/typed-event-emitter.ts` | No changes | — |
| `src/lib/dedup.ts` | Update: merge overlap-dedup branch from capture.ts | 1 |
| `src/scripts/uia-capture.ps1` | **Delete** | 1 |
| `launcher.bat` | **Delete** | 7 |
| `start.bat` | **Delete** | 7 |
| `.github/workflows/ci.yml` | Update: glob PS1 files, fix lint | 6 |
| `eslint.config.js` | Update: no-console override for CLI files | 6 |
| `package.json` | Update: engines, remove lint-staged, add coverage dep | 6 |
| `vitest.config.ts` | Update: add coverage thresholds | 5 |
| `README.md` | Rewrite: accurate project structure, config docs, launcher docs | 7 |
| `src/__tests__/cli.test.ts` | **Create** | 5 |
| `src/__tests__/config-loader.test.ts` | **Create** | 5 |
| `src/__tests__/logger.test.ts` | **Create** | 5 |
| `src/__tests__/typed-event-emitter.test.ts` | **Create** | 5 |
| `src/__tests__/app.test.ts` | **Create** | 5 |
| `src/__tests__/ps-process.test.ts` | **Create** | 5 |
