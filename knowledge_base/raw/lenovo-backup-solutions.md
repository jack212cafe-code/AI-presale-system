# Lenovo Backup & Recovery Solutions 2026

## Overview
In 2026, backup alone is insufficient — Ransomware Protection is mandatory. Lenovo supports three primary backup solution stacks, each targeting different organizational sizes and protection requirements.

---

## Solution A: Business Continuity — Lenovo + Veeam

### Software
- Veeam Availability Suite v12.x (or Veeam Data Platform)

### Target
- Organizations prioritizing fast Recovery Time Objective (RTO) and Recovery Point Objective (RPO)
- SMB to mid-market with VMware or Hyper-V environments

### Recommended Hardware
- **Backup Server**: ThinkSystem SR650 V3 (2U, adequate I/O for proxy + repository)
- **Backup Target (Repository)**: Lenovo DE Series (DE4000H / DE6000H) — lowest $/TB for backup data
- **Optional Immutable Repository**: Linux Hardened Repository on SR630 V3 with local XFS

### Best Practices
- Enable **Veeam Immutability** (Linux Hardened Repository or S3 Object Lock) — backup cannot be modified or deleted for a defined retention period → protects against ransomware wiping backup copies
- Use **3-2-1 Rule**: 3 copies, 2 different media, 1 offsite
- Enable **SureBackup** for automated backup verification
- Use **DD Boost or Veeam Scale-Out Backup Repository (SOBR)** for large environments

### Key RTO/RPO
- RTO: < 15 minutes with Veeam Instant VM Recovery
- RPO: < 1 hour with scheduled backup jobs

### When to Recommend
- Customer has VMware or Hyper-V environment
- Needs fast, granular recovery (Exchange, SQL, AD, file-level)
- Wants well-supported, industry-leading backup tool
- Budget: moderate (Veeam licensing + SR650 V3 + DE4000H)

### When NOT to Recommend
- Customer is 100% cloud-native or prefers Commvault for air-gap
- Very tight budget (Veeam per-VM/socket licensing can be significant)

---

## Solution B: Cyber Resilience — Lenovo + Commvault

### Software
- Commvault Cloud (formerly Commvault Complete Backup & Recovery)
- Commvault HyperScale X (hyperconverged backup appliance edition)

### Target
- Large enterprises with hybrid cloud (on-premises + AWS/Azure/GCP)
- Organizations with strict compliance and air-gap requirements

### Recommended Hardware
- **Media Agents**: ThinkSystem SR650 V3 or SR650 V4 (multiple nodes for parallel data streams)
- **Storage**: DE6000H high-density for on-prem repository, or cloud storage target
- **HyperScale X**: SR650-based pre-validated Commvault appliance nodes

### Best Practices
- Implement **Air-gap**: physically or logically isolate backup network from production network — prevents ransomware from reaching backup data
- Use **Commvault's Threat Scan** feature to detect ransomware indicators in backup files before restore
- Enable **Immutable Cloud Storage** (AWS S3 Object Lock or Azure Immutable Blob) for offsite copy
- Configure **Commvault Anomaly Detection** (AI-based) to alert on unusual backup job behavior

### Key Features
- Multi-cloud: unified backup management for AWS, Azure, GCP, and on-prem
- Granular recovery for VMware, Hyper-V, Kubernetes, Oracle, SAP, M365
- Compliance: WORM storage support, audit trails, role-based access

### When to Recommend
- Large enterprise with hybrid/multi-cloud strategy
- Compliance-heavy industries (finance, healthcare, government)
- Kubernetes and container workload backup
- Customer needs air-gap and cyber vault capability
- Budget: high (Commvault licensing + multiple SR650 + DE storage)

### When NOT to Recommend
- SMB with < 20 VMs → Veeam is simpler and more cost-effective
- Customer has no cloud strategy → Veeam covers on-prem well enough

---

## Solution C: Simple & Scalable — Lenovo + Cohesity

### Concept
Hyperconverged Secondary Storage — combines backup software, deduplication storage, and analytics in a single scale-out platform.

### Target
- Organizations wanting simple, appliance-like backup management
- Teams that prefer GUI-first, minimal infrastructure configuration
- Scale-out requirements: start small and add nodes as needed

### Recommended Hardware
- **Lenovo Cohesity-certified Nodes**: ThinkSystem SR650 V3-based nodes pre-validated for Cohesity DataProtect
- Cohesity clusters require minimum 3 nodes for data redundancy (similar to HCI)

### Software
- **Cohesity DataProtect**: unified backup, archival, and disaster recovery
- **Cohesity DataHawk**: AI-powered ransomware detection and threat intelligence

### Best Practices
- Use **Zero-trust Architecture** built into Cohesity — every user and service requires explicit authentication and authorization
- Enable **Cohesity FortKnox** (cyber vault): air-gapped cloud vault managed by Cohesity
- Use **SmartFiles** for NAS consolidation alongside backup

### Key Features
- Scale-out: add nodes without downtime (linear performance and capacity scaling)
- GUI-first management: designed for simplicity (minimal CLI required)
- Built-in deduplication and compression
- Native cloud tiering (AWS, Azure, GCP)
- Multi-workload: VMs, NAS, databases, cloud, M365

### When to Recommend
- Customer wants appliance-simplicity with enterprise features
- Scale-out backup is a priority (growing data estate)
- Customer frustrated with complex legacy backup tools
- Wants integrated ransomware detection in backup platform
- Budget: mid-to-high (appliance-level pricing; node-based)

### When NOT to Recommend
- Customer already has mature Veeam or Commvault deployment — replacement cost may not justify
- Very tight budget — Cohesity node pricing is higher than DIY Veeam + server + storage

---

## Recommended Bundles by Budget

### SME Set (Low Budget — < 800,000 THB)
- **Server**: SR630 V3 (Backup server)
- **Storage**: DE4000H Hybrid (local repository) or local disks
- **Software**: Veeam Backup Essentials (≤ 50 VMs)
- **Protection**: Veeam Hardened Repository (Linux) for immutability

### Enterprise Set (Mid Budget — 1,500,000–4,000,000 THB)
- **Server**: SR650 V4 (Backup proxy + media agent)
- **Storage**: DG5200 QLC All-Flash (primary) + DE4000H (backup repository)
- **Software**: Veeam Data Platform Advanced or Commvault
- **Protection**: SOBR with immutable capacity tier, offsite copy to cloud

### High-Performance / AI Set (Premium — > 5,000,000 THB)
- **Server**: SR650 V4 / SR850 V4 (Commvault Media Agents, dedicated nodes)
- **Storage**: DM7200F NVMe Unified (primary) + DE6000H (dedicated backup target)
- **Software**: Commvault HyperScale X (air-gapped nodes) or Cohesity DataProtect
- **Protection**: Air-gap vault, Commvault Threat Scan, Zero-trust, immutable cloud copy

---

## Backup Technology Comparison

| Criteria | Veeam | Commvault | Cohesity |
|---|---|---|---|
| Target market | SMB to Enterprise | Enterprise | Mid-market to Enterprise |
| Ease of setup | High | Medium | High (appliance model) |
| VMware integration | Best-in-class | Very good | Good |
| Kubernetes backup | Good (Kasten K10) | Excellent | Good |
| M365 backup | Yes (native module) | Yes | Yes |
| Air-gap / Cyber vault | Yes (Hardened Repo) | Yes (dedicated vault) | Yes (FortKnox) |
| Ransomware detection | Basic (SureBackup) | Advanced (AI-based) | Advanced (DataHawk AI) |
| Multi-cloud | Good | Excellent | Good |
| Pricing model | Per-VM / Per-socket | Per-TB / Capacity | Per-node |

---

## Backup Best Practices (Universal)

1. **3-2-1 Rule**: 3 copies, 2 different media types, 1 offsite
2. **Immutable Backup**: always configure immutable copy to prevent ransomware from deleting backups
3. **Air-gap**: physically or logically isolate backup infrastructure from production network
4. **Verified Recovery**: run automated restore tests (Veeam SureBackup / Commvault DR test)
5. **Encryption**: encrypt backup data at rest and in transit
6. **Monitoring**: alert on backup job failures within 1 hour
