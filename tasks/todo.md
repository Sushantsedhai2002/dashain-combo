# Task List: Source Registry

**Spec:** [`SPEC-source-registry.md`](../SPEC-source-registry.md)  
**Plan:** [`tasks/plan.md`](./plan.md)

## Phase 1: Reproducible foundation

### Task 1: Initialize Git and the pnpm workspace

**Description:** Create a local `main` Git repository and a minimal pnpm workspace pinned to the approved Node and pnpm versions. Establish ignore rules and a reproducible lockfile before adding domain code.

**Acceptance criteria:**
- [x] Local Git repository uses `main`; no remote is configured and nothing is pushed.
- [x] Node `24.21.0` and pnpm `10.26.1` are declared, and workspace packages under `packages/*` are discoverable.
- [x] A frozen-lockfile install succeeds without untracked dependency artifacts.

**Verification:**
- [x] Run `git status --short --branch` and confirm branch `main`.
- [x] Run `pnpm install --frozen-lockfile` successfully after lockfile creation.
- [x] Run `pnpm list --depth 0` and inspect the root dependency set.

**Dependencies:** None

**Files likely touched:**
- `.gitignore`
- `.node-version`
- `package.json`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`

**Estimated scope:** Medium (5 files)

### Task 2: Add strict TypeScript and quality tooling

**Description:** Configure pinned TypeScript, ESLint, Prettier, and Vitest tooling with strict root scripts. Keep all default checks deterministic and network-free.

**Acceptance criteria:**
- [x] Root scripts expose `build`, `typecheck`, `lint`, `format:check`, `test`, `test:coverage`, and `check`.
- [x] TypeScript strict mode and the spec’s prohibition on unchecked/suppressed typing are represented in configuration.
- [x] Formatting, linting, typechecking, and an empty-workspace test command complete without configuration errors.

**Verification:**
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm lint` and `pnpm format:check`.
- [x] Run `pnpm test -- --run`.

**Dependencies:** Task 1

**Files likely touched:**
- `package.json`
- `tsconfig.base.json`
- `eslint.config.mjs`
- `.prettierrc.json`
- `vitest.workspace.ts`

**Estimated scope:** Medium (5 files)

### Task 3: Create the source-registry package shell

**Description:** Add a private workspace package with strict TypeScript build/test scripts and a deliberately empty public entry point, proving package resolution before contract implementation.

**Acceptance criteria:**
- [x] `@dashain-offer/source-registry` is recognized by pnpm with pinned runtime/dev dependencies.
- [x] The package compiles in strict mode and exposes only `src/index.ts`.
- [x] A smoke test proves the package test runner and workspace filtering work.

**Verification:**
- [x] Run `pnpm --filter @dashain-offer/source-registry typecheck`.
- [x] Run `pnpm --filter @dashain-offer/source-registry test`.
- [x] Run `pnpm build`.

**Dependencies:** Task 2

**Files likely touched:**
- `packages/source-registry/package.json`
- `packages/source-registry/tsconfig.json`
- `packages/source-registry/src/index.ts`
- `packages/source-registry/test/package-smoke.test.ts`

**Estimated scope:** Medium (4 files)

## Checkpoint: Workspace foundation

- [x] `pnpm install --frozen-lockfile` succeeds.
- [x] `pnpm check` succeeds.
- [x] `pnpm build` succeeds.
- [x] Review the first staged diff for secrets and unintended generated files.

## Phase 2: Registry contract

### Task 4: Define source and channel boundary schemas

**Description:** Test-first, define strict Zod schemas and public readonly semantic types for source status, channel kinds, verification evidence, and source definitions.

**Acceptance criteria:**
- [x] Valid source/channel records parse with the approved semantic shape.
- [x] Unknown fields, non-HTTPS URLs, malformed dates, invalid IDs, empty market segments, and unsupported enum values are rejected.
- [x] Public types are readonly and exported only through the package entry point.

**Verification:**
- [x] First run the focused schema test and observe the expected red failure.
- [x] Run `pnpm --filter @dashain-offer/source-registry test -- schema.test.ts` after implementation.
- [x] Run package typecheck and lint.

**Dependencies:** Task 3

**Files likely touched:**
- `packages/source-registry/src/schema.ts`
- `packages/source-registry/src/index.ts`
- `packages/source-registry/test/schema.test.ts`

**Estimated scope:** Medium (3 files)

### Task 5: Parse registries into deterministic structured results

**Description:** Test-first, implement `parseSourceRegistry` so invalid input returns the approved `RegistryIssue[]` contract, never partial data or raw Zod errors.

**Acceptance criteria:**
- [x] Fully valid registry arrays return `{ ok: true, sources }`.
- [x] Invalid input returns all applicable issues in deterministic path order without partial source data.
- [x] Active-source verification and enabled-channel requirements produce the approved issue codes.

**Verification:**
- [x] Observe focused parser tests fail before implementation.
- [x] Run `pnpm --filter @dashain-offer/source-registry test -- parse-source-registry.test.ts`.
- [x] Run package typecheck and lint.

**Dependencies:** Task 4

**Files likely touched:**
- `packages/source-registry/src/parse-source-registry.ts`
- `packages/source-registry/src/index.ts`
- `packages/source-registry/test/parse-source-registry.test.ts`

**Estimated scope:** Medium (3 files)

### Task 6: Detect duplicate IDs and canonical channel URLs

**Description:** Define conservative URL-equivalence behavior with table-driven tests, then use it to reject duplicate source IDs and duplicate canonical channel URLs.

**Acceptance criteria:**
- [x] Canonicalization rules are comparison-only and preserve original URLs in successful output.
- [x] Equivalent tested URL forms produce `DUPLICATE_CHANNEL_URL`; repeated IDs produce `DUPLICATE_SOURCE_ID`.
- [x] Distinct paths/accounts are not collapsed by over-aggressive normalization.

**Verification:**
- [x] Observe canonicalization and duplicate tests fail before implementation.
- [x] Run `pnpm --filter @dashain-offer/source-registry test -- canonicalize-channel-url.test.ts parse-source-registry.test.ts`.
- [x] Run package typecheck and lint.

**Dependencies:** Task 5

**Files likely touched:**
- `packages/source-registry/src/canonicalize-channel-url.ts`
- `packages/source-registry/src/parse-source-registry.ts`
- `packages/source-registry/test/canonicalize-channel-url.test.ts`
- `packages/source-registry/test/parse-source-registry.test.ts`

**Estimated scope:** Medium (4 files)

### Task 7: Expose immutable active-source selection

**Description:** Test-first, implement `getActiveSources` with stable registry ordering and readonly output, then expose only the approved package contract.

**Acceptance criteria:**
- [ ] Only `ACTIVE` records are returned and input order is preserved.
- [ ] The selector does not mutate its input.
- [ ] The public entry point exposes the documented contract and no schema-library internals.

**Verification:**
- [ ] Observe selector tests fail before implementation.
- [ ] Run `pnpm --filter @dashain-offer/source-registry test -- get-active-sources.test.ts`.
- [ ] Run package typecheck, lint, and build.

**Dependencies:** Task 5

**Files likely touched:**
- `packages/source-registry/src/get-active-sources.ts`
- `packages/source-registry/src/index.ts`
- `packages/source-registry/test/get-active-sources.test.ts`

**Estimated scope:** Medium (3 files)

## Checkpoint: Registry contract

- [ ] Run `pnpm --filter @dashain-offer/source-registry test:coverage`.
- [ ] Confirm at least 80% coverage of changed executable lines.
- [ ] Run `pnpm check` and `pnpm build`.
- [ ] Confirm no raw Zod errors or mutable configuration are publicly exposed.

## Phase 3: Operator commands

### Task 8: Add the deterministic offline validation CLI

**Description:** Implement a CLI that reads a requested registry JSON file, validates through the public parser, prints stable actionable issues, and returns meaningful process exit codes without network access.

**Acceptance criteria:**
- [ ] Valid files exit `0`; invalid files or unreadable input exit non-zero with no stack trace for expected errors.
- [ ] Output ordering is deterministic and contains no credentials or raw library details.
- [ ] Automated tests prove that validation performs no network requests.

**Verification:**
- [ ] Observe CLI tests fail before implementation.
- [ ] Run `pnpm --filter @dashain-offer/source-registry test -- validate-cli.test.ts`.
- [ ] Run the package CLI against valid and invalid fixtures.

**Dependencies:** Tasks 6 and 7

**Files likely touched:**
- `packages/source-registry/src/cli/validate.ts`
- `packages/source-registry/test/validate-cli.test.ts`
- `packages/source-registry/package.json`
- `package.json`

**Estimated scope:** Medium (4 files)

### Task 9: Add the opt-in live reachability CLI

**Description:** Implement a separately invoked live checker for enabled channels with explicit timeouts, bounded concurrency, and per-channel results. It must never mutate registry data or claim that reachability proves authenticity.

**Acceptance criteria:**
- [ ] Bounded concurrency and timeout behavior are covered with mocked HTTP tests.
- [ ] Every enabled channel receives a deterministic result category without aborting the entire run.
- [ ] The command is excluded from `pnpm check`, offline validation, and deterministic tests that access real networks.

**Verification:**
- [ ] Observe mocked live-check tests fail before implementation.
- [ ] Run `pnpm --filter @dashain-offer/source-registry test -- check-live.test.ts`.
- [ ] Run the CLI against a local fixture or mocked endpoint; do not require external availability for acceptance.

**Dependencies:** Task 8

**Files likely touched:**
- `packages/source-registry/src/cli/check-live.ts`
- `packages/source-registry/test/check-live.test.ts`
- `packages/source-registry/package.json`
- `package.json`

**Estimated scope:** Medium (4 files)

## Checkpoint: Operator commands

- [ ] `pnpm sources:validate -- --file <valid-fixture>` exits `0`.
- [ ] Invalid fixture validation exits non-zero with ordered structured issues.
- [ ] Default tests pass with external network access disabled.
- [ ] Live checker timeout and concurrency tests pass.

## Phase 4: Verified Nepal source portfolio

For Tasks 10–16, first-party evidence must be recorded for every active source. If a proposed source cannot be authenticated or has no useful accessible channel, replace it with a source from the same market segment and document the reason in the task summary.

### Task 10: Verify eight general-retail sources

**Description:** Add verified records for Daraz Nepal, Bhat-Bhateni, Big Mart Nepal, SalesBerry, SmartDoko, Gyapu, Thulo.com, and Jeevee, substituting inaccessible candidates within the same segment.

**Acceptance criteria:**
- [ ] Eight unique active general-retail sources pass offline validation.
- [ ] Each record has first-party evidence and at least one enabled HTTPS channel.
- [ ] The opt-in live report is reviewed and failures are documented without treating them as authenticity verdicts.

**Verification:**
- [ ] Run `pnpm sources:validate`.
- [ ] Run `pnpm sources:check --live` and inspect all newly added channels.
- [ ] Manually verify configured evidence URLs are first-party.

**Dependencies:** Task 9

**Files likely touched:**
- `config/sources.json`

**Estimated scope:** Small code diff, medium research (1 file)

### Task 11: Verify eight electronics-retailer sources

**Description:** Add verified records for Hukut, Mudita Store, Oliz Store, EvoStore, Big Digital, ITTI, Neo Store, and CG Digital, using same-segment replacements where necessary.

**Acceptance criteria:**
- [ ] The registry contains 16 total unique active sources after this batch.
- [ ] All eight new records include first-party evidence and enabled channels.
- [ ] No source IDs or canonical channel URLs collide with Task 10 data.

**Verification:**
- [ ] Run `pnpm sources:validate`.
- [ ] Run the live checker and review the new channels.
- [ ] Manually verify first-party evidence.

**Dependencies:** Task 10

**Files likely touched:**
- `config/sources.json`

**Estimated scope:** Small code diff, medium research (1 file)

### Task 12: Verify six consumer electronics/appliance sources, batch A

**Description:** Add verified records for Samsung Nepal, Xiaomi Nepal, vivo Nepal, OPPO Nepal, realme Nepal, and LG Nepal, replacing candidates within the same segment when required.

**Acceptance criteria:**
- [ ] The registry contains 22 total unique active sources.
- [ ] All six records include first-party evidence and enabled channels.
- [ ] Validation reports no duplicate identity or channel data.

**Verification:**
- [ ] Run offline validation and the opt-in live checker.
- [ ] Manually verify each evidence URL.
- [ ] Run package tests after the data update.

**Dependencies:** Task 11

**Files likely touched:**
- `config/sources.json`

**Estimated scope:** Small code diff, medium research (1 file)

### Task 13: Verify six consumer electronics/appliance sources, batch B

**Description:** Add verified records for Panasonic Nepal, TCL Nepal, Hisense Nepal, CG Electronics, Baltra Home Appliances, and Himstar, using same-segment replacements where necessary.

**Acceptance criteria:**
- [ ] The registry contains 28 total unique active sources.
- [ ] All six records include first-party evidence and enabled channels.
- [ ] Validation reports no duplicate identity or channel data.

**Verification:**
- [ ] Run offline validation and the opt-in live checker.
- [ ] Manually verify each evidence URL.
- [ ] Run package tests after the data update.

**Dependencies:** Task 12

**Files likely touched:**
- `config/sources.json`

**Estimated scope:** Small code diff, medium research (1 file)

## Checkpoint: First 28 sources

- [ ] Registry has 28 active records across three portfolio groups.
- [ ] Every record has verified evidence and an enabled channel.
- [ ] Offline validation, package tests, typecheck, and lint pass.
- [ ] Replacement decisions are recorded in the change summary.

### Task 14: Verify six fashion and lifestyle sources

**Description:** Add verified records for Goldstar Shoes, Caliber Shoes, KTM CTY, Sonam Gear, Dulla, and Shikhar Shoes, replacing candidates within the same segment where necessary.

**Acceptance criteria:**
- [ ] The registry contains 34 total unique active sources.
- [ ] All six new records include first-party evidence and enabled channels.
- [ ] Validation reports no duplicates or malformed records.

**Verification:**
- [ ] Run offline validation and the opt-in live checker.
- [ ] Manually verify each evidence URL.
- [ ] Run package tests after the data update.

**Dependencies:** Task 13

**Files likely touched:**
- `config/sources.json`

**Estimated scope:** Small code diff, medium research (1 file)

### Task 15: Verify eight automotive sources

**Description:** Add verified records for Hyundai Nepal, Tata Motors Nepal, Kia Nepal, Suzuki Nepal, Toyota Nepal, Honda Nepal, Yamaha Nepal, and Bajaj Nepal, using official Nepal distributors and same-segment replacements where needed.

**Acceptance criteria:**
- [ ] The registry contains 42 total unique active sources.
- [ ] Manufacturer/distributor relationships are supported by first-party evidence.
- [ ] Every source has at least one enabled channel and no canonical URL conflicts.

**Verification:**
- [ ] Run offline validation and the opt-in live checker.
- [ ] Manually verify manufacturer or authorized-distributor evidence.
- [ ] Run package tests after the data update.

**Dependencies:** Task 14

**Files likely touched:**
- `config/sources.json`

**Estimated scope:** Small code diff, medium research (1 file)

### Task 16: Verify eight travel, delivery, and payment sources

**Description:** Add verified records for Buddha Air, Yeti Airlines, Shree Airlines, Foodmandu, Pathao Nepal, eSewa, Khalti, and IME Pay, using same-segment replacements where required.

**Acceptance criteria:**
- [ ] The registry contains exactly 50 unique active sources.
- [ ] All eight new records include first-party evidence and enabled channels.
- [ ] All six approved portfolio groups remain represented.

**Verification:**
- [ ] Run offline validation and the opt-in live checker.
- [ ] Manually verify each evidence URL.
- [ ] Run package tests after the data update.

**Dependencies:** Task 15

**Files likely touched:**
- `config/sources.json`

**Estimated scope:** Small code diff, medium research (1 file)

## Checkpoint: Verified 50-source portfolio

- [ ] Exactly 50 sources are active.
- [ ] Every active source supports Nepal, has first-party evidence, and has an enabled HTTPS channel.
- [ ] All six portfolio groups are represented.
- [ ] No credentials, tokens, cookies, selectors, or personal data appear in the registry.

## Phase 5: Production contract

### Task 17: Enforce the production registry contract

**Description:** Add a contract test for the real registry and wire offline source validation into the root quality gate. This final slice makes all source-registry success criteria executable.

**Acceptance criteria:**
- [ ] Contract tests fail unless production data has exactly 50 valid active sources across all six portfolio groups.
- [ ] Root `pnpm check` runs format, lint, typecheck, deterministic tests, coverage, build, and offline registry validation without network access.
- [ ] Public exports and CLI behavior match the approved spec, with at least 80% changed-line coverage and no skipped tests or suppressions.

**Verification:**
- [ ] Run `pnpm sources:validate`.
- [ ] Run `pnpm --filter @dashain-offer/source-registry test:coverage`.
- [ ] Run `pnpm check` and `pnpm build` from a clean install.

**Dependencies:** Tasks 6, 7, 8, and 16

**Files likely touched:**
- `packages/source-registry/test/registry-contract.test.ts`
- `packages/source-registry/package.json`
- `package.json`
- `config/sources.json`

**Estimated scope:** Medium (4 files)

## Final Checkpoint

- [ ] All 10 success criteria in `SPEC-source-registry.md` are demonstrated.
- [ ] `pnpm install --frozen-lockfile`, `pnpm check`, and `pnpm build` succeed.
- [ ] Default checks perform no external network requests.
- [ ] Live checker is opt-in and does not mutate registry data.
- [ ] Git diff contains no secrets, generated build output, or out-of-scope modules.
- [ ] Human reviews the completed module before planning `offer-catalog`.
