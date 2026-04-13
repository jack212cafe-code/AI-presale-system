# HPE Storage Line-up 2026 (Alletra Portfolio)

## Overview
HPE has consolidated all storage brands (Nimble, 3PAR, Primera, MSA) under the Alletra family, managed through HPE GreenLake. The portfolio spans entry SAN (MSA), adaptive flash (Alletra 5000), mission-critical NVMe (Alletra 9000), and the newest modular unified platform (Alletra Storage MP).

---

## HPE MSA — Entry SAN (Most Affordable)

### Models
- **MSA 2060**: 2U, 12 x 3.5" LFF or 24 x 2.5" SFF, iSCSI/FC, hybrid
- **MSA 2062**: 2U, includes SSDs for auto-tiering (SSD cache + HDD capacity), ready-to-use

### Technology
- Dual controller (Active-Active)
- Protocols: 10GbE iSCSI or 16Gb FC
- Auto-tiering: MSA 2062 has SSD cache + HDD capacity tiers built-in
- Tight integration with HPE ProLiant servers

### Target Use Cases
- SME virtualization (VMware, Hyper-V)
- SQL Server small-scale shared storage
- Backup repository
- Entry block storage for ProLiant clusters

### When to Recommend
- Most cost-effective HPE storage option
- Budget under 400,000 THB
- Simple iSCSI or FC block SAN requirement
- Customer already has ProLiant servers

### When NOT to Recommend
- Needs NAS + SAN unified → Alletra 5000 or Alletra MP
- Needs high IOPS all-flash → Alletra 5000 or 9000
- Enterprise scale → Alletra MP

---

## Alletra 5000 Series — Adaptive Flash (Nimble Successor)

### Models
- **Alletra 5010**: Entry adaptive flash, hybrid SSD+HDD
- **Alletra 5030**: Mid-range adaptive flash, higher capacity and performance

### Technology
- Adaptive Flash: NVMe SSD cache + HDD capacity — delivers flash-like performance at near-HDD cost
- HPE InfoSight integration: predictive analytics for storage health and performance
- Dual controller, Active-Active
- Protocols: iSCSI 10/25GbE, FC 16/32Gb
- Cloud-connected: telemetry fed to InfoSight for proactive support

### Key Advantage — InfoSight for Storage
- Predicts storage hardware failures before they happen
- Global telemetry from all Alletra 5000 deployments worldwide
- Recommends configuration optimizations automatically
- Typical: 6x fewer storage incidents vs traditional support model

### Target Use Cases
- Mid-market VMware/Hyper-V environments
- SQL Server, Oracle mid-tier
- Replacing Nimble CS/AF series
- Cost-conscious all-flash-like performance

### When to Recommend
- Customer wants flash performance at hybrid price
- Nimble customer upgrading to current platform
- InfoSight predictive analytics is a priority
- Budget: 500,000–1,500,000 THB

### When NOT to Recommend
- Mission-critical Tier 0 latency requirement → Alletra 9000
- Needs NAS/file capability → Alletra MP

---

## Alletra 9000 Series — Mission-Critical All-NVMe

### Models
- **Alletra 9060**: Mid-range all-NVMe, 2U
- **Alletra 9080**: Enterprise all-NVMe, highest performance in Alletra lineup

### Technology
- All-NVMe: sub-100 microsecond latency (Tier 0 performance)
- Non-disruptive upgrades and controller refresh
- 100% availability design (no planned downtime for maintenance)
- Protocols: FC 32Gb, iSCSI 25GbE
- Cloud-managed via HPE GreenLake
- InfoSight predictive intelligence built-in

### Target Use Cases
- Mission-critical Oracle RAC databases
- SAP HANA on shared NVMe storage
- Highest-tier VMware environments with strict latency SLA
- Financial trading platforms
- Healthcare EHR systems requiring zero downtime

### When to Recommend
- Customer needs Tier 0 sub-ms latency
- Mission-critical application with zero planned downtime requirement
- Replacing 3PAR / Primera arrays
- Budget: 2,000,000 THB and above

### When NOT to Recommend
- General enterprise → Alletra 5000 or Alletra MP is sufficient and cheaper
- Needs NAS → Alletra MP
- Budget limited → Alletra 5010 delivers good flash performance at lower cost

---

## Alletra Storage MP — Modular Unified Platform (Newest)

### Overview
Alletra Storage MP is the newest HPE storage platform with a modular architecture that allows independent scaling of compute (controllers) and capacity (storage shelves). It supports both block and file workloads from a single system.

### Key Architectural Advantage
- **Modular**: scale controllers and drives independently — no need to replace entire system to upgrade performance
- **Unified**: block (SAN) + file (NAS) in single platform
- **GreenLake native**: fully cloud-managed, consumption billing available

### Protocols
- FC 32Gb, iSCSI 25GbE (block)
- NFS v4, SMB 3 (file)
- Object (S3-compatible)

### Target Use Cases
- Enterprise customers wanting modular, future-proof storage
- Mixed SAN + NAS from single platform
- Organizations standardizing on HPE GreenLake cloud management
- Replacing end-of-life 3PAR or MSA with modern platform

### When to Recommend
- Customer wants investment protection through modular upgrades
- Needs unified block+file without buying two separate systems
- GreenLake consumption model is attractive
- Budget: 1,500,000 THB and above

---

## Storage Selection Guide 2026

| Scenario | Recommended | Reason |
|---|---|---|
| SME entry SAN, budget limited | MSA 2060 / MSA 2062 | Cheapest HPE SAN, ProLiant-integrated |
| Mid-market flash performance | Alletra 5010 / 5030 | Adaptive flash, InfoSight, good $/IOPS |
| Mission-critical Oracle/SAP Tier 0 | Alletra 9060 / 9080 | Sub-100µs NVMe, 100% availability |
| Unified SAN+NAS, modular | Alletra Storage MP | Latest platform, modular, cloud-managed |
| Backup target (low cost) | MSA 2060 (HDD config) | Lowest $/TB for HPE storage |

---

## HPE InfoSight — Cross-Portfolio Intelligence

InfoSight is HPE's cloud-based AI analytics platform that monitors all ProLiant servers and Alletra storage:
- **Predictive failure detection**: identifies 86% of issues before customer notices
- **Proactive parts dispatch**: replacement parts shipped before failure occurs
- **Cross-stack correlation**: correlates server + storage telemetry to diagnose root cause across the stack
- **Global learning**: benefits from telemetry of all HPE customers worldwide (anonymized)

---

## Budget Reference (THB)

| Series | Entry Price | Notes |
|---|---|---|
| HPE MSA 2060 | 200,000+ | Entry SAN, hybrid |
| HPE MSA 2062 | 300,000+ | Entry SAN with SSD cache |
| Alletra 5010 | 500,000+ | Adaptive flash, InfoSight |
| Alletra Storage MP | 1,500,000+ | Unified modular, latest platform |
| Alletra 9060 | 2,000,000+ | All-NVMe mission-critical |
