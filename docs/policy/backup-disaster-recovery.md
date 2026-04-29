# Backup & Disaster Recovery

**Owner:** CTO
**Effective:** 2026-04-28
**Review cadence:** Annual + after any restore drill

## Backup strategy

| Data | Mechanism | Frequency | Retention |
|------|-----------|-----------|-----------|
| PostgreSQL (production) | Railway managed backups (full + WAL) | Daily full, continuous WAL | 30 days |
| Source code | GitHub | Real-time | Forever (history) |
| Audit logs | Stored in same PostgreSQL; covered by DB backup | — | 6 years (HIPAA 164.316) |
| User-uploaded documents | Application storage (TBD: S3-compatible bucket with versioning) | Real-time | 6 years |

## Recovery objectives

- **RTO** (recovery time): 4 hours for full production restore.
- **RPO** (recovery point): 5 minutes (continuous WAL).

## Restore drill

A restore drill is performed at least annually. Steps:
1. Spin up a fresh Railway PostgreSQL instance.
2. Restore the most recent backup.
3. Verify row counts and a sample of recently-modified records.
4. Verify the application boots against the restored DB.
5. Document the drill outcome (start time, finish time, issues, action items).

## Disaster scenarios

- **Database corruption** — restore from most recent backup; replay WAL up to before the corruption window.
- **Railway outage** — wait for Railway recovery (we are tied to their SLA). Status page published; customers notified.
- **Account compromise (Railway, GitHub)** — rotate credentials; verify no unauthorized changes to infrastructure config; review audit logs.
- **Region outage** — Railway has multi-region failover (verify with their docs).

## What is NOT backed up automatically

- Local `.env` files. Production secrets are stored in Railway's secret manager.
- Frontend build artifacts (re-buildable from source).
- Cache (Redis, if added).
