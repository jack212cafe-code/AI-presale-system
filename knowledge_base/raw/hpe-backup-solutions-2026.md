# HPE Backup & Recovery Solutions 2026

## Overview
HPE's data protection portfolio emphasizes Business Continuity and rapid recovery. Three primary solutions: Zerto for continuous real-time data protection, StoreOnce for high-efficiency backup with deduplication, and HPE GreenLake for Backup as a Service (cloud-managed BaaS).

---

## Solution A: Continuous Data Protection — HPE Zerto

### Concept
Journal-based continuous replication — instead of point-in-time snapshots, Zerto captures every write operation in a continuous journal. This enables recovery to any point in time down to seconds, not just the last backup window.

### Key Features
- **Near-zero RPO**: recover to within seconds of a failure (journal-based, not snapshot-based)
- **Low RTO**: automated failover and failback orchestration — DR site up in minutes
- **Journal-based Recovery**: rewind workloads to any second in the journal history (typically 30 days)
- **Non-disruptive Testing**: test DR failover without impacting production
- **Ransomware Recovery**: recover to a point just before infection by selecting a clean journal checkpoint
- **Multi-cloud**: replicate to AWS, Azure, GCP, or any VMware site

### Supported Platforms
- VMware vSphere (primary platform)
- Microsoft Hyper-V
- Physical servers (Windows/Linux)
- AWS, Azure, GCP workloads

### Target Use Cases
- Core business systems that cannot tolerate data loss (financial systems, ERP, core banking)
- Tier 1 applications requiring sub-minute RPO
- DR site setup without traditional backup infrastructure
- Ransomware recovery with clean point-in-time restore

### When to Recommend
- Customer requires RPO < 5 minutes (journal replication achieves seconds)
- Replacing traditional backup for Tier 1 applications with DR requirement
- Customer has DR site and wants automated failover orchestration
- Ransomware recovery requirement — Zerto's journal allows pre-infection recovery
- Budget: Zerto licensing starts at ~300,000 THB/year for small environments

### When NOT to Recommend
- Long-term tape/archive retention → StoreOnce handles this better
- Customer doesn't have a DR site and doesn't need real-time replication
- Very tight budget → StoreOnce + Veeam is more cost-effective for standard backup

---

## Solution B: High-Efficiency Backup — HPE StoreOnce

### Hardware Models
- **StoreOnce 3600**: Mid-range, up to 432 TB usable, 2U
- **StoreOnce 5200**: Enterprise, up to 2.1 PB usable, 2U + expansion shelves

### Key Technology — StoreOnce Catalyst
- **StoreOnce Catalyst**: HPE's proprietary deduplication transport protocol — performs deduplication at the backup source (source-side dedup), reducing data transferred over network by up to 95% before sending to StoreOnce
- Works with Veeam, Commvault, and HPE's own backup tools
- Enables **WAN-efficient replication** between StoreOnce systems across branches → backup to central StoreOnce without saturating WAN links

### Key Features
- Inline deduplication: 20x–40x typical data reduction for backup data
- StoreOnce Catalyst: source-side dedup reduces network traffic
- Cloud Bank Storage: tier cold backup data to AWS, Azure, or GCP
- Replication: StoreOnce-to-StoreOnce for DR copy
- VTL emulation for legacy backup software
- HPE InfoSight integration: predictive analytics for StoreOnce health

### Supported Software
- Veeam Backup & Replication (native Catalyst plugin)
- Commvault (native Catalyst plugin)
- HPE Data Protector
- Veritas NetBackup

### Target Use Cases
- Enterprise backup target requiring high deduplication
- Multi-site organizations needing WAN-efficient branch backup (StoreOnce Catalyst)
- Long-term data retention with cloud tiering
- Replacing aging tape or VTL infrastructure

### When to Recommend
- Customer has large backup data (> 20 TB) needing deduplication
- Multi-site environment where WAN bandwidth is limited (Catalyst reduces traffic)
- Already uses Veeam or Commvault → native Catalyst integration
- Long-term retention requirement (cloud tiering to AWS/Azure)
- Budget: StoreOnce 3600 from ~600,000 THB

### When NOT to Recommend
- Customer needs near-zero RPO → Zerto is the right tool
- Very small backup dataset < 5 TB → standard NAS repository is sufficient
- Customer prefers all-in-one Dell solution → PowerProtect DD is a direct competitor

---

## Solution C: Cloud-Managed Backup — HPE GreenLake for Backup

### Concept
Backup as a Service (BaaS) — managed entirely through HPE GreenLake cloud portal. Customer consumes backup capacity and features as a service without managing backup software, hardware, or licensing separately.

### Key Features
- **Pay-per-use**: billed by actual backup data under management (OpEx model)
- **Single portal**: manage all backup policies, recovery, and reporting from HPE GreenLake console
- **No software management**: HPE manages backend infrastructure, updates, and capacity
- **Integration**: supports VMware, Hyper-V, physical servers, Microsoft 365
- **Cloud-native**: backup copies stored in HPE's cloud infrastructure with redundancy

### Target Use Cases
- Organizations wanting to eliminate backup infrastructure management overhead
- Companies shifting IT budget from CapEx to OpEx
- Hybrid environments needing unified backup across on-prem and cloud
- SME without dedicated backup administrator

### When to Recommend
- Customer wants cloud-managed simplicity
- OpEx billing model preferred over CapEx hardware purchase
- Small IT team without backup expertise
- Existing HPE GreenLake customer wanting to add backup service

### When NOT to Recommend
- Customer requires data sovereignty (backup must stay on-premises) → StoreOnce
- Very large backup dataset → on-premises StoreOnce may be more cost-effective at scale
- Customer has no internet connectivity for cloud management

---

## Recommended Bundles by Budget

### SME Set (Budget < 1,000,000 THB)
- **Server**: ProLiant DL360 Gen11
- **Storage**: HPE MSA 2062 (hybrid SSD+HDD)
- **Backup**: Veeam on internal server disks or MSA repository
- **Protection**: Veeam Hardened Repository for immutability

### Enterprise Set (Budget 1,500,000–4,000,000 THB)
- **Server**: ProLiant DL380 Gen11 / Gen12
- **Storage**: Alletra 5000 (adaptive flash) or Alletra Storage MP
- **Backup**: StoreOnce 3600 + Veeam or Commvault (StoreOnce Catalyst)
- **Protection**: StoreOnce Cloud Bank to AWS/Azure for offsite copy

### High-End / AI Set (Budget > 5,000,000 THB)
- **Server**: ProLiant DL380a Gen11 (GPU optimized)
- **Storage**: Alletra 9000 (all-NVMe mission-critical)
- **Backup**: HPE Zerto for continuous DR replication to DR site
- **Protection**: Real-time journal-based recovery, automated DR failover

---

## HPE Backup Solution Comparison

| Criteria | HPE Zerto | HPE StoreOnce | GreenLake Backup |
|---|---|---|---|
| Target market | Enterprise Tier 1 | SMB to Enterprise | SMB to Mid-market |
| RPO | Seconds (journal) | Minutes (scheduled) | Minutes (scheduled) |
| RTO | Minutes (auto failover) | Minutes to hours | Minutes to hours |
| Deduplication | N/A (replication) | 20–40x | Cloud-managed |
| Air-gap / Immutability | Via cloud vault add-on | Cloud Bank (cold tier) | Cloud-managed |
| Ransomware recovery | Excellent (journal rewind) | Good (immutable copy) | Good |
| M365 backup | Yes (Zerto for M365) | Via Veeam/Commvault | Yes (GreenLake portal) |
| Management | Veeam/VMware integration | Veeam, Commvault native | HPE GreenLake portal |
| Pricing model | Per-VM subscription | Appliance + capacity | Pay-per-use OpEx |

---

## Best Practices

1. **Tier your backup strategy**: Zerto for Tier 1 (near-zero RPO), StoreOnce for Tier 2 (standard backup), GreenLake for long-term retention
2. **Use StoreOnce Catalyst** when protecting multiple remote sites — reduces WAN traffic by 80–95%
3. **Combine Zerto + StoreOnce**: Zerto for DR failover, StoreOnce for long-term retention and compliance
4. **InfoSight monitoring**: enable InfoSight on StoreOnce to get proactive alerts before appliance failure
5. **3-2-1 Rule**: 3 copies, 2 media types, 1 offsite (StoreOnce Cloud Bank or Zerto cloud replication)
