# Dell Backup & Recovery Solutions 2026

## Overview
Dell is a market leader in data protection. For 2026, the portfolio focuses on three tiers: traditional reliable backup (PowerProtect DD + PPDM), ransomware vault (Cyber Recovery with CyberSense AI), and software-defined (PowerEdge + Veeam). All solutions emphasize Cyber Resilience as a core capability.

---

## Solution A: Traditional Reliable — Dell PowerProtect DD + PPDM

### Hardware
- **PowerProtect DD3300**: Entry, up to 48 TB usable, 2U
- **PowerProtect DD6400**: Mid-range, up to 576 TB usable, 2U
- **PowerProtect DD9400**: Enterprise, up to 1.4 PB usable
- **PowerProtect DDVE**: Virtual Edition — runs on VMware, AWS, or Azure

### Software
- **PowerProtect Data Manager (PPDM)**: Dell's native backup management software (formerly Data Manager)

### Key Features
- **Inline Deduplication**: 10x–50x data reduction ratio — largest in the industry for backup data
- **DD Boost**: deduplication offloaded to source (Veeam, Commvault, Oracle RMAN) → reduces network traffic by 50–80%
- **DD Replicator**: async logical replication between two DD systems for DR copy
- **Cloud Tier**: auto-tier cold backup data to AWS S3, Azure Blob, or GCP
- **Virtual Tape Library (VTL)**: emulate tape for legacy backup software
- WORM Retention Lock: immutable backup retention for compliance

### PPDM Capabilities
- Native VMware vCenter integration (crash + app-consistent backup)
- Oracle RMAN integration: backup directly to DD via DD Boost
- Kubernetes CSI snapshot backup
- SQL Server VSS backup with granular recovery
- PowerStore Transparent Snapshots (near-zero overhead backup)

### When to Recommend
- Customer has large backup data (> 20 TB) needing deduplication
- Uses Veeam / Commvault / Oracle RMAN / PPDM as backup software
- Needs DR copy of backup to remote site (DD Replicator)
- Wants Dell-native single-vendor backup stack
- Budget: DD3300 from ~400,000 THB; DD6400 from ~1,200,000 THB

### When NOT to Recommend
- Backup data < 5 TB → standard repository is sufficient
- Customer requires Microsoft 365 backup → Veeam has M365 module, PPDM does not
- Customer wants ransomware vault → Cyber Recovery Vault is the right solution

---

## Solution B: Ransomware Vault — Dell PowerProtect Cyber Recovery

### Concept
Air-gapped "digital vault" — backup copies are physically isolated from the production network. Data is pulled into the vault on a schedule, then the network connection is severed. Even if production environment is fully compromised, vault data is safe.

### Hardware
- **PowerProtect Cyber Recovery Vault**: purpose-built vault solution based on PowerProtect DD (typically DD6400 or DD9400) in an isolated network segment

### Key Components
1. **Air-gap**: automated network isolation — vault connects to production network on a schedule (e.g., nightly), syncs data, then disconnects. An attacker who owns the production environment cannot reach the vault when disconnected.
2. **CyberSense AI**: scans backup data inside the vault for ransomware indicators (file entropy changes, encryption patterns, suspicious metadata) — detects corruption even if malware evaded production security tools
3. **Clean Room Recovery**: isolated recovery environment to validate data integrity and test restore before returning to production
4. **Immutable Copies**: DD Retention Lock prevents modification or deletion of vault data

### Target
- Financial institutions (banks, insurance)
- Government and public sector
- Healthcare organizations with critical patient data
- Any organization that has experienced or fears ransomware attacks

### When to Recommend
- Customer has experienced ransomware or has regulatory requirement for cyber vault
- Critical data that cannot be lost under any circumstance
- High compliance requirements (PCI-DSS, HIPAA, ISO 27001)
- Budget available for dedicated vault infrastructure
- Budget: 3,000,000–10,000,000+ THB (dedicated vault system)

### When NOT to Recommend
- SME with limited budget → Veeam Hardened Repository is cost-effective alternative
- Customer only needs basic immutability → DD Retention Lock without full vault is sufficient

---

## Solution C: Software-Defined — Dell PowerEdge + Veeam

### Hardware
- **PowerEdge R760xd2**: 2U, maximum disk capacity (up to 26 x 3.5" LFF bays) — optimized for backup repository
- Alternative: **PowerEdge R760** with JBOD expansion for large-scale repository
- **PowerEdge R660xs**: entry backup server for small environments

### Software
- **Veeam Data Platform** (v12.x): Backup & Replication, ONE (monitoring), Service Provider Console

### Implementation Pattern
- PowerEdge R760xd2 runs Linux OS with XFS filesystem
- Veeam Hardened Linux Repository: makes backup files immutable via `chattr +i` — backup cannot be modified or deleted for defined retention period
- Cost-effective alternative to purpose-built backup appliance for SMB/mid-market

### Key Features
- **Immutable Backup**: Linux Hardened Repository prevents ransomware deletion
- **Instant VM Recovery**: boot VM directly from backup repository in < 15 minutes
- **Veeam Explorer**: granular recovery for Exchange, SQL, AD, Oracle, SharePoint
- **DD Boost**: integrate with PowerProtect DD for deduplication
- **Veeam for M365**: backup Microsoft 365 mailboxes, SharePoint, Teams

### When to Recommend
- Customer has VMware or Hyper-V and wants industry-standard backup tool
- Cost-conscious deployment needing immutability without DD appliance cost
- Already owns Veeam licenses
- Needs Microsoft 365 backup
- Budget: 500,000–2,000,000 THB (server + Veeam licensing)

### When NOT to Recommend
- 100% Dell shop preferring single-vendor → PPDM + DD
- Large backup footprint (> 100 TB) where DD deduplication saves more cost
- Needs enterprise cyber vault → Cyber Recovery Vault solution

---

## Recommended Bundles by Budget

### SME Set (Budget < 1,000,000 THB)
- **Server**: PowerEdge R660xs
- **Storage**: PowerVault ME5 (Hybrid) or internal disks
- **Backup**: Veeam Backup Essentials on Linux Hardened Repository
- **Protection**: Veeam Immutability (Hardened Linux Repo)

### Professional Set (Budget 1,500,000–4,000,000 THB)
- **Server**: PowerEdge R760
- **Storage**: PowerStore 1200T (All-Flash primary)
- **Backup**: PowerProtect DD3300 + PPDM
- **Protection**: DD Retention Lock, DD Replicator to offsite

### Ultimate AI/Cloud Set (Budget > 5,000,000 THB)
- **Server**: PowerEdge R770 (17G)
- **Storage**: PowerStore 5200Q (QLC All-Flash)
- **Backup**: PowerProtect Cyber Recovery Vault (DD6400 or DD9400 in isolated vault)
- **Protection**: CyberSense AI scan, Air-gap, Clean Room Recovery

---

## Backup Solution Comparison

| Criteria | PowerProtect DD + PPDM | Cyber Recovery Vault | PowerEdge + Veeam |
|---|---|---|---|
| Target market | SMB to Enterprise | Enterprise / Critical | SMB to Mid-market |
| Deduplication | 10–50x (best-in-class) | Based on DD (same) | Moderate (source-side) |
| Air-gap | No (standard backup) | Yes (physical air-gap) | No (but immutable) |
| Ransomware AI scan | No | Yes (CyberSense) | No |
| VMware integration | Excellent (PPDM native) | Via DD+PPDM | Excellent (Veeam) |
| M365 backup | No | No | Yes (Veeam module) |
| Kubernetes backup | Yes (PPDM CSI) | Via PPDM | Yes (Kasten K10 add-on) |
| Immutability | DD Retention Lock | DD Retention Lock + air-gap | Linux Hardened Repo |
| Cost | Medium | High | Low-Medium |

---

## Best Practices (Universal)

1. **3-2-1 Rule**: 3 backup copies, 2 different media types, 1 offsite (cloud or DR site)
2. **Immutable Copy**: always configure at least one immutable backup copy
3. **Test Restores**: verify backup recoverability monthly (Veeam SureBackup or PPDM compliance reports)
4. **Deduplication**: route backups through DD for 10–50x storage reduction on backup data
5. **RTO/RPO**: define SLA — Veeam Instant Recovery achieves RTO < 15 min; DD Replicator achieves RPO < 1 hour for DR copy
6. **Encryption**: encrypt backup data in transit and at rest
