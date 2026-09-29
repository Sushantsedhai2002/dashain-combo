# Implementation Plan: Source Registry

**Spec:** [`SPEC-source-registry.md`](../SPEC-source-registry.md)  
**Module:** `source-registry`  
**Task list:** [`tasks/todo.md`](./todo.md)

## Overview

Build the first Dashain Offer Radar module as a small TypeScript workspace package. The package will validate an authoritative JSON registry, expose immutable active-source records through a narrow API, support deterministic offline validation, and provide a separate live reachability checker. The work finishes with 50 verified active sources from the approved Nepal-market portfolio.

No offer collection, extraction, database, web UI, or watchlist behavior is included.

## Current State

- The repository contains specifications and an idea document but no application code or package manifest.
- No Git repository is initialized, so implementation begins by creating local version-control and workspace foundations.
- There are no existing conventions to preserve beyond the approved spec.
- `tasks/plan.md` and `tasks/todo.md` did not exist before this plan.

## Dependency Graph

```text
Task 1: workspace and Git foundation
  └─ Task 2: root quality/tool configuration
       └─ Task 3: source-registry package shell
            └─ Task 4: source/channel schema
                 └─ Task 5: parser and structured issues
                      ├─ Task 6: URL canonicalization and duplicates
                      │    └─ Task 8: offline validation CLI
                      └─ Task 7: active-source selector
                           └─ Task 8
                                └─ Task 9: live reachability CLI
                                     └─ Tasks 10–16: verified source batches (sequential file updates)
                                          └─ Task 17: production contract and root quality gate
```

Tasks 10–16 involve independent research but update the same JSON file. They should remain sequential unless separate worktrees and an explicit merge owner are used.

## Architecture Decisions

- **One workspace package:** `@dashain-offer/source-registry` owns schemas, validation behavior, selectors, and both CLIs. Applications consume its public exports rather than raw JSON.
- **JSON as untrusted input:** `config/sources.json` stays human-editable and version-controlled, but every load crosses the Zod validation boundary.
- **Narrow public API:** export only source types, `parseSourceRegistry`, and `getActiveSources`. CLI and canonicalization internals remain private.
- **Structured failures:** expected registry problems return deterministic `RegistryIssue[]`; raw Zod errors never escape.
- **Conservative URL canonicalization:** normalize only for comparison, never rewrite configured output. Rules are locked by tests before duplicate detection uses them.
- **Offline/live separation:** normal tests and `sources:validate` never access the network. `sources:check --live` is opt-in, bounded, timed out, and informational.
- **TDD slices:** define failing behavior tests before each schema, parser, selector, and CLI implementation.
- **Source evidence:** every active source has first-party evidence. Reachability is supporting information, not authenticity proof.
- **No secrets:** all selected channels must be public; credentials and session state are forbidden.
- **Version compatibility fails early:** workspace initialization verifies the approved pinned versions before domain implementation. Any required version change returns to the human because the spec marks dependency changes as “ask first.”

## Implementation Phases

### Phase 1: Reproducible foundation

- Task 1: Initialize Git and the pnpm workspace
- Task 2: Add strict TypeScript and quality tooling
- Task 3: Create the source-registry package shell

**Checkpoint:** clean install, typecheck, lint, test, and build commands execute successfully.

### Phase 2: Registry contract

- Task 4: Define source and channel boundary schemas
- Task 5: Parse registries into deterministic structured results
- Task 6: Detect canonical duplicate channel URLs and source IDs
- Task 7: Expose immutable active-source selection

**Checkpoint:** package contract is tested without production source data or network access.

### Phase 3: Operator commands

- Task 8: Add deterministic offline validation CLI
- Task 9: Add opt-in live reachability CLI

**Checkpoint:** fixtures prove both CLI paths, and default tests remain network-free.

### Phase 4: Verified Nepal source portfolio

- Task 10: Verify general retail sources
- Task 11: Verify electronics retailer sources
- Task 12: Verify consumer electronics/appliance sources, batch A
- Task 13: Verify consumer electronics/appliance sources, batch B
- Task 14: Verify fashion and lifestyle sources
- Task 15: Verify automotive sources
- Task 16: Verify travel, delivery, and payment sources

**Checkpoint:** `config/sources.json` contains 50 unique active sources, each with evidence and at least one enabled channel.

### Phase 5: Production contract

- Task 17: Enforce the 50-source production contract and root quality gate

**Checkpoint:** every approved success criterion passes through reproducible commands.

## Verification Strategy

Every behavior task follows red → green → refactor:

1. Add or update a focused failing test.
2. Run the package test command and confirm the expected failure.
3. Implement the smallest behavior that passes.
4. Run package typecheck, lint, and tests.
5. Run the root `pnpm check` at each checkpoint once it is available.

Network-dependent checks never determine deterministic test success. Source-data tasks use both offline validation and the opt-in live checker, but official identity is established from first-party evidence rather than HTTP status.

## Parallelization

### Safe after contracts stabilize

- Research for different source categories can happen in parallel if findings are recorded outside `config/sources.json` and one owner merges them.
- Live-checker implementation can begin after the registry data contract and URL policy are stable.

### Must remain sequential

- Workspace setup → package shell → schema → parser.
- Duplicate detection depends on canonicalization tests.
- Production contract depends on all 50 verified records.
- Direct edits to `config/sources.json` should have one owner to avoid conflicts.

## Checkpoint and Commit Strategy

Create a local Git repository on `main`. Make atomic save-point commits after each successful checkpoint; do not configure a remote or push. Suggested commit boundaries:

1. `chore: initialize source registry workspace`
2. `feat: define source registry contract`
3. `feat: add registry validation commands`
4. `data: add verified Nepal promotion sources`
5. `test: enforce source registry production contract`

Commits occur only after reviewing the staged diff, checking for secrets, and running the relevant verification commands.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Approved package versions are incompatible | High | Install and run a minimal build in Task 1–3 before domain work; ask before changing versions. |
| A candidate source is inactive or not verifiably official | High | Replace it with an active source from the same market segment while preserving the 50-source distribution. |
| Social pages block anonymous requests | Medium | Keep live checks informational; retain channels only when useful access is possible and ensure each source has at least one enabled channel. |
| URL normalization collapses distinct resources | Medium | Use conservative comparison-only rules and lock every rule with table-driven tests. |
| External outages make tests flaky | High | Prohibit network access in default tests and offline validation. |
| Fifty-source verification becomes one oversized task | High | Split portfolio work into seven bounded category batches with a checkpoint before final activation. |
| Registry errors expose third-party library details | Low | Normalize all failures to the approved issue contract and contract-test output shape. |
| Credentials accidentally enter source data | High | Registry schema contains no credential fields; inspect diffs and scan staged changes before commits. |

## Open Questions

None blocking. Expiry rules, extraction confidence, collection frequency, and platform-specific ingestion remain explicitly deferred to later module specs.
