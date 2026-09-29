# Spec: Source Registry

**Module ID:** `source-registry`  
**Status:** Approved on 2026-09-29  
**Capability map:** [`CAPABILITY_MAP.md`](./CAPABILITY_MAP.md)  
**Product direction:** [`docs/ideas/dashain-offer-radar.md`](./docs/ideas/dashain-offer-radar.md)

## Objective

Create the authoritative, version-controlled registry of 50 trusted promotion sources serving the Nepali market. The registry identifies official brands and retailers, records their website and social channels, and exposes only validated active sources to `offer-ingestion`.

This module configures *where* collection may happen. It does not collect, extract, rank, store, or display offers.

### Users and consumers

- **Maintainer:** edits source definitions and records verification evidence.
- **`offer-ingestion`:** consumes validated active sources and channels.
- **`offer-catalog`:** uses stable source identifiers when associating offers with sellers.

### Functional requirements

1. Represent the 50-source portfolio proposed in `docs/ideas/dashain-offer-radar.md`.
2. Permit replacement of an inaccessible candidate with a comparable source from the same market segment.
3. Give every source a stable, human-readable kebab-case identifier that is never reused.
4. Support multiple channels per source: website, Facebook, Instagram, and TikTok.
5. Track source status as `CANDIDATE`, `ACTIVE`, `PAUSED`, or `RETIRED`.
6. Require every active source to have:
   - a verified official identity;
   - at least one enabled channel;
   - a verification date and evidence URL;
   - at least one market segment;
   - Nepal as its supported market.
7. Treat all registry files as untrusted configuration and validate them before exposing data to consumers.
8. Reject duplicate source IDs and duplicate canonical channel URLs.
9. Expose immutable validated records; consumers must not mutate the shared registry.
10. Keep credentials, cookies, access tokens, and scraping selectors out of source definitions.
11. Provide a deterministic offline validation command suitable for local checks and CI.
12. Provide a separate opt-in live-check command that reports channel reachability without modifying registry data or determining whether a source is official.

### Activation and replacement policy

- A source counts toward the target of 50 only while its status is `ACTIVE`.
- Initial completion requires exactly 50 active sources.
- A paused or retired source retains its ID and history but does not count toward the target.
- Authenticity is confirmed from first-party evidence. Reachability alone is not proof that a profile is official.
- A replacement receives a new ID; retired IDs are never recycled.
- One source counts once regardless of how many channels it has.

## Module Contract

Consumers import the package API rather than reading JSON directly.

```ts
export type RegistryIssue = Readonly<{
  code:
    | "INVALID_SCHEMA"
    | "DUPLICATE_SOURCE_ID"
    | "DUPLICATE_CHANNEL_URL"
    | "ACTIVE_SOURCE_NOT_VERIFIED"
    | "ACTIVE_SOURCE_WITHOUT_CHANNEL";
  path: string;
  message: string;
  sourceId?: string;
}>;

export type RegistryResult =
  | Readonly<{ ok: true; sources: readonly SourceDefinition[] }>
  | Readonly<{ ok: false; issues: readonly RegistryIssue[] }>;

export function parseSourceRegistry(input: unknown): RegistryResult;
export function getActiveSources(
  sources: readonly SourceDefinition[],
): readonly SourceDefinition[];
```

Contract rules:

- `parseSourceRegistry` never returns partially valid data.
- Validation issues are returned together in deterministic path order.
- `getActiveSources` preserves registry order and returns readonly data.
- Raw validation-library errors are not part of the public contract.
- Changes to required fields or existing enum values require an approved spec change; additive optional fields are preferred.

## Tech Stack

Versions are the current registry releases checked on 2026-09-29 and will be pinned exactly when the workspace is initialized.

- Node.js `24.21.0`
- pnpm `10.26.1`
- TypeScript `7.0.2`, strict mode
- Zod `4.6.5` for boundary validation
- Vitest `5.0.2` for unit and contract tests
- ESLint `10.11.0`
- Prettier `3.9.9`

The source-registry module does not depend on Next.js or PostgreSQL.

## Commands

Commands are run from the repository root.

```bash
# Install exactly from the lockfile
pnpm install --frozen-lockfile

# Validate types, formatting, lint, tests, and registry data
pnpm check

# Module-specific checks
pnpm --filter @dashain-offer/source-registry typecheck
pnpm --filter @dashain-offer/source-registry lint
pnpm --filter @dashain-offer/source-registry test
pnpm --filter @dashain-offer/source-registry test:coverage

# Deterministic registry validation; performs no network requests
pnpm sources:validate

# Optional network smoke check; must not run in the default test suite
pnpm sources:check --live

# Build all workspace packages
pnpm build
```

## Project Structure

```text
CAPABILITY_MAP.md
SPEC-source-registry.md
config/
  sources.json                    # Version-controlled source definitions
packages/
  source-registry/
    package.json
    src/
      index.ts                    # Deliberate public exports only
      schema.ts                   # Boundary schemas and inferred types
      parse-source-registry.ts    # Validation and issue normalization
      get-active-sources.ts       # Readonly active-source selector
      canonicalize-channel-url.ts # URL normalization for duplicate checks
      cli/
        validate.ts               # Offline validation command
        check-live.ts             # Opt-in reachability report
    test/
      fixtures/                   # Focused valid and invalid registries
      registry-contract.test.ts   # Validates the real 50-source file
```

Future applications live under `apps/`, but this module must not import from any application.

## Source Data Shape

The exact implementation is owned by the schema, but validated output must provide this semantic shape:

```ts
type SourceStatus = "CANDIDATE" | "ACTIVE" | "PAUSED" | "RETIRED";
type ChannelKind = "WEBSITE" | "FACEBOOK" | "INSTAGRAM" | "TIKTOK";

type SourceChannel = Readonly<{
  kind: ChannelKind;
  url: string;
  isEnabled: boolean;
}>;

type SourceDefinition = Readonly<{
  id: string;
  displayName: string;
  status: SourceStatus;
  supportedMarkets: readonly ["NP"];
  marketSegments: readonly string[];
  channels: readonly SourceChannel[];
  verification: Readonly<{
    verifiedAt: string;
    evidenceUrl: string;
  }> | null;
}>;
```

A channel URL is canonicalized only for validation and duplicate detection. The original configured URL remains the observable output so consumers are not coupled to hidden rewriting behavior.

## Code Style

- Use kebab-case filenames, camelCase values/functions, and PascalCase types.
- Prefer small pure functions and discriminated unions.
- Infer internal types from boundary schemas; define public contract types deliberately.
- Do not use `any`, non-null assertions, TypeScript suppression comments, or unchecked type assertions.
- Keep mutation local while constructing results; expose readonly output.
- Return structured expected errors and reserve thrown exceptions for programmer errors.

```ts
const CHANNEL_KINDS = [
  "WEBSITE",
  "FACEBOOK",
  "INSTAGRAM",
  "TIKTOK",
] as const;

const SourceChannelSchema = z
  .object({
    kind: z.enum(CHANNEL_KINDS),
    url: z.url().startsWith("https://"),
    isEnabled: z.boolean(),
  })
  .strict();

export function getActiveSources(
  sources: readonly SourceDefinition[],
): readonly SourceDefinition[] {
  return sources.filter((source) => source.status === "ACTIVE");
}
```

## Testing Strategy

### Unit tests

Test schema boundaries, URL canonicalization, duplicate detection, issue ordering, active-source filtering, and immutability expectations using focused fixtures.

### Contract test

Validate `config/sources.json` as production-like data. It must fail when:

- the registry is malformed;
- active-source requirements are violated;
- IDs or canonical channel URLs collide;
- the number of active sources differs from 50.

### Live smoke check

`pnpm sources:check --live` checks enabled channel URLs with bounded concurrency and explicit timeouts. Network failures are reported per channel. This command is informational during initial source verification and is excluded from deterministic unit tests because external availability is not controlled by this project.

### Quality threshold

- At least 80% coverage of changed executable lines, using Vitest coverage.
- Zero TypeScript and lint errors.
- No skipped tests, suppression comments, committed secrets, or unimplemented stubs.
- The offline module test and validation suite should complete within 30 seconds on the development machine.

## Boundaries

### Always do

- Validate registry configuration at the package boundary.
- Preserve source IDs after activation, including when a source retires.
- Use first-party evidence when marking a source as verified.
- Canonicalize URLs before duplicate comparison.
- Run offline validation and tests before committing registry changes.
- Keep registry outputs immutable.

### Ask first

- Change the target away from exactly 50 active sources.
- Add a new channel kind or source status.
- Change a source ID after it has been activated.
- Add fields required by downstream consumers.
- Add dependencies or change pinned tool versions.
- Move registry editing into a database or admin interface.

### Never do

- Store credentials, session cookies, tokens, or personal data in the registry.
- Infer that a social account is official from its display name alone.
- Treat a successful HTTP response as authenticity proof.
- Read raw registry JSON from downstream modules.
- Make network access part of deterministic tests or offline validation.
- Reuse retired source IDs.
- Silence validation or test failures to activate a source.

## Success Criteria

The module is complete when all of the following are demonstrably true:

1. `config/sources.json` contains exactly 50 active, schema-valid sources serving Nepal.
2. Every active source has verified first-party evidence and at least one enabled HTTPS channel.
3. The portfolio covers all six groups in the confirmed idea: general retail, electronics retail, consumer electronics/appliances, fashion/lifestyle, automotive, and travel/delivery/payments.
4. Duplicate IDs and equivalent canonical channel URLs cause offline validation to fail with structured issues.
5. Invalid records are never returned partially to consumers.
6. The package exports only the documented contract and does not expose raw Zod errors or mutable configuration.
7. `pnpm sources:validate` is deterministic, makes no network requests, and exits non-zero for invalid production data.
8. `pnpm sources:check --live` reports per-channel reachability without editing source data.
9. Module type checking, linting, deterministic tests, and coverage gates pass.
10. No secrets or platform credentials are required to validate and load the registry.

## Open Questions

None. Channel-specific collection permissions, extraction confidence, collection frequency, and offer-expiry fallback behavior belong to later module specifications.
