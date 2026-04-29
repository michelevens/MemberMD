# ADR-0003: EHR Adapters Built as a Framework

- **Status:** Accepted
- **Date:** 2026-04-28
- **Deciders:** Product/Engineering leadership
- **Related:** ROADMAP.md Phase 2.6 (Athena), Phase 3.3 (Elation), H2 Phase A (DoseSpot, Surescripts, lab interfaces)

## Context

H1 ships two EHR adapters: Athenahealth (Q4 2026) and Elation (Q1 2027). These are operator-positioned: "we integrate with your existing EHR."

H2 ships e-prescribing (Surescripts via DoseSpot/DrFirst) and lab integrations (Quest Quanum, LabCorp Beacon). These are solo-DPC-positioned: "everything you need in one platform."

If H1 adapters are bespoke, each subsequent integration is a new from-scratch project. If they're built as a framework with a standard interface, H2 integrations become incremental work rather than parallel rebuilds.

## Decision

EHR and external-system integrations must conform to a generic **Adapter** interface defined once, implemented per system.

Specifically:
1. A single `Adapter` PHP interface (or trait) defines: `connect()`, `disconnect()`, `pushEncounter()`, `pullEncounters()`, `pushPatient()`, `pullPatients()`, `healthCheck()`, `mapField()`. Optional methods are stubbed by default.
2. Tenant-level configuration (`tenant_integrations` table) stores adapter type + credentials + field mappings + sync schedule generically — no per-vendor tables.
3. A shared sync orchestrator (`AdapterSyncJob`) handles retries, dead-letter queueing, audit logging, and rate limiting once for all adapters.
4. Field-mapping UI in the operator console (and later, practice settings for H2 solo) is generic — works for any registered adapter.
5. Adding a new adapter (DoseSpot, Quest, Surescripts, QuickBooks, Salesforce) means: implement the interface, register the adapter, ship a config UI snippet. No changes to core sync, audit, or queue infrastructure.

## Consequences

### Positive
- Athena costs ~6 weeks; Elation costs ~3 weeks. By H2, DoseSpot costs ~2 weeks.
- One sync infrastructure to harden, monitor, and audit. SOC 2 evidence is produced once for all adapters.
- New adapters can be added without engineering bottleneck — a contractor or partner can build one against the public adapter spec.

### Negative
- Up-front cost: building Athena as a framework instead of as bespoke integration adds ~1–2 weeks. Recovered on Elation.
- Some vendor APIs don't fit the interface cleanly (e.g., FHIR vs. NCPDP). Solution: optional methods + adapter-specific extension points, not a leaky abstraction.

### Neutral
- The adapter framework needs explicit versioning. Bumping the interface is a coordinated event across all adapters.

## Enforcement

- Code review: any new vendor integration that doesn't implement the `Adapter` interface requires explicit waiver and an issue tracking the migration.
- Code review: vendor-specific tables (e.g., `athena_patients`, `quest_orders`) are rejected. Use the generic `tenant_integrations` config + adapter-internal caching.
- Architecture review: every new adapter goes through a 1-page design doc confirming it fits the interface or proposes a generic interface change.

## Alternatives Considered

**A) Bespoke integration per vendor; refactor to a framework "when we have 3."**
Rejected: by the time we have 3, we have 3 production-supported integrations and the refactor cost is high and customer-visible. Better to build the framework with the first one.

**B) Use a third-party iPaaS (Workato, Tray.io, Mirth Connect for healthcare).**
Rejected for now: cost scales with transactions, integrations stay opaque (hard to debug), and it doesn't generate SOC 2 evidence inside our perimeter. Reconsider at >5 adapters or for partner-built integrations.

## References

- ROADMAP.md § Phase 2.6, 3.3
- ROADMAP.md § H2 Phase A (e-prescribing, lab integrations)
- ROADMAP.md § "Architectural Decisions That Preserve the H2 Option" rule 3
