# Dell Backup Software Use Cases

## Overview
Two primary backup software solutions are relevant for Dell presale:
1. **Veeam** — Market-leading third-party backup software, vendor-agnostic, best-in-class for VMware/Hyper-V/cloud
2. **Dell PowerProtect Backup Manager (PPBM)** — Dell's own backup software, tightly integrated with Dell infrastructure and Data Domain

---

## Veeam Data Platform / Veeam Backup & Replication

### Overview
Veeam is the industry-leading backup and replication solution for virtual, physical, and cloud workloads. It integrates natively with VMware vSphere, Microsoft Hyper-V, Nutanix AHV, and major cloud providers (AWS, Azure, GCP).

### Target Use Cases
- VMware vSphere environment backup (most common)
- Microsoft Hyper-V environment backup
- Physical server backup (Windows, Linux)
- Cloud VM backup (Azure, AWS EC2)
- Microsoft 365 backup (Veeam Backup for Microsoft 365)
- Ransomware recovery (Veeam Immutability + SureBackup)

### Key Features
- Agentless backup for VMware VMs (via vStorage APIs for Data Protection — VADP)
- Instant VM Recovery: boot VM directly from backup in minutes
- Veeam Explorer: granular recovery for Exchange, SQL, SharePoint, AD, Oracle
- Replication: VM replication to DR site or cloud
- Veeam Immutability: S3 Object Lock or Linux Hardened Repository (ransomware-proof backup)
- SureBackup / SureReplica: automated backup verification
- DD Boost integration: sends deduplicated data directly to PowerProtect DD
- VeeamONE: monitoring and analytics

### Editions
| Edition | Target | Notes |
|---|---|---|
| Veeam Data Platform Foundation | SMB | Basic backup, no advanced analytics |
| Veeam Data Platform Advanced | Mid-market | SureBackup, advanced monitoring |
| Veeam Data Platform Premium | Enterprise | Full feature set, VSPC, Veeam ONE |
| Veeam Backup Essentials | SMB ≤ 50 VMs | Most cost-efficient for small VMware |

### Backup Target Integration
- **PowerProtect DD**: Veeam can write to DD via DD Boost (OpenStorage) — maximizes deduplication, reduces network traffic
- **PowerScale**: Veeam can use PowerScale NFS/SMB share as backup repository — suitable for large-scale backup with high ingest rate
- **S3 Object Storage**: Veeam Scale-Out Backup Repository (SOBR) capacity tier to Dell ECS or cloud S3

### Licensing Model
- Per workload (VM, physical server, cloud VM)
- Annual subscription or perpetual + support

### When to Recommend
- Customer runs VMware vSphere → Veeam is the gold standard
- Customer needs granular application recovery (Exchange, SQL, AD)
- Customer wants vendor-independent backup (not tied to Dell)
- Customer already owns Veeam and wants to add Dell storage
- Multi-hypervisor or hybrid cloud environment
- Customer requires immutable backup for ransomware protection

### When NOT to Recommend
- Customer is 100% Dell infrastructure and prefers Dell-native solution → PPBM
- Budget is extremely tight — Veeam licensing can be significant

---

## Dell PowerProtect Backup Manager (PPBM)

### Overview
PowerProtect Backup Manager (formerly PowerProtect Data Manager) is Dell's own backup software, tightly integrated with Dell storage (PowerProtect DD, PowerStore, PowerScale). It provides centralized data protection management across Dell infrastructure.

### Target Use Cases
- Dell-centric environments (PowerEdge + DD + PowerStore)
- VMware vSphere backup with native vCenter integration
- Kubernetes / container backup (PPBM has native K8s support)
- Oracle database backup (RMAN integration)
- SQL Server backup
- File system backup (Windows, Linux agents)
- Transparent Snapshots integration with PowerStore/PowerScale

### Key Features
- Crash-consistent and application-consistent VM backup (VMware, Hyper-V)
- Oracle RMAN integration: backup directly to DD with DD Boost
- SQL Server VSS backup with granular recovery
- Kubernetes CSI snapshot backup
- PowerStore Transparent Snapshots: near-zero overhead backup using storage snapshots
- DD Boost integration: deduplication offloaded to DD
- Compliance: WORM, audit logging, immutable copy on DD

### Licensing Model
- Capacity-based licensing (TB managed)
- Included with Dell PowerProtect appliances (IDPA)
- Separate software license if deploying virtual appliance (OVA)
- No per-VM fees — cost scales with data under management

### Integration with PowerProtect DD
- PPBM is designed to work natively with DD as the primary backup target
- Automated DD stream management and retention policies
- DD Replication configured through PPBM UI

### When to Recommend
- Customer is Dell-only shop and wants single-vendor support
- Customer already has PowerProtect DD → PPBM adds software management layer
- Oracle or Kubernetes workload — PPBM has superior native integration vs Veeam
- Customer wants capacity-based licensing (better ROI for large VM count)
- Customer needs NDMP backup for NAS (PowerScale)

### When NOT to Recommend
- Customer has VMware environment and already owns Veeam → don't replace
- Multi-vendor environment (HPE, Lenovo, Nutanix) — PPBM is Dell-optimized
- Customer requires Microsoft 365 backup → Veeam has M365 module, PPBM does not

---

## Backup Architecture Summary

### Recommended Stack by Scenario

| Scenario | Backup Software | Backup Target |
|---|---|---|
| VMware + Mixed vendors | Veeam Advanced | PowerProtect DD3300/DD6400 |
| VMware + Dell only | PPBM or Veeam | PowerProtect DD |
| Oracle DB | PPBM (RMAN) | PowerProtect DD |
| Kubernetes | PPBM | PowerProtect DD |
| Microsoft 365 | Veeam for M365 | Local NAS or S3 |
| Small VMware ≤ 50 VMs | Veeam Essentials | ME5 NFS or DD3300 |
| Ransomware recovery priority | Veeam Premium | DD with Immutability |
| Large-scale NAS backup | Veeam + NDMP | PowerScale (NAS target) |

---

## Backup Best Practices

1. **3-2-1 Rule**: 3 copies, 2 different media types, 1 offsite (cloud or DR site)
2. **Immutable Backup**: Always recommend immutable copy (DD Retention Lock or Veeam Hardened Repo) to protect against ransomware
3. **Backup Verification**: Use Veeam SureBackup or PPBM compliance reports to validate recoverability
4. **Deduplication**: Route backups through PowerProtect DD for 10-55x storage reduction
5. **RTO/RPO**: Define SLA before recommending — Veeam Instant Recovery achieves RTO < 15 min; DD Replicator achieves RPO < 1 hour for DR copy
