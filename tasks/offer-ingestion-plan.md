# Offer Ingestion Implementation Plan

1. Establish the package, contracts, and deterministic runner. Prove active-source filtering, stable keys, duplicate collapse, catalog publication, and safe failure with mocked scans.
2. Add bounded public HTTPS fetching and an EvoStore first-page adapter. Verify extraction against a recorded page fragment and live page structure. Do not request the pagination query URLs disallowed by the site's robots.txt.
3. Wire an opt-in single-run CLI and non-overlapping six-hour worker. Keep the default quality gate offline.
4. Run the live adapter in dry-run mode, assess candidate precision, then test publication against the disposable PostgreSQL database. The permitted first listing page yielded 16 discounted candidates on 2026-09-30; earlier all-page collection was removed after reading robots.txt.
5. Add source adapters one at a time after measuring real offer yield and extraction accuracy. Removal confirmation and persisted observation state are implemented for the pilot.

The first three steps produce a working website ingestion pilot. Source coverage and withdrawal depend on evidence from supported sites; a failed or incomplete scan must never hide catalog offers.
