# Dell Storage Line-up 2026

## Overview
Dell has consolidated its storage portfolio under the Power brand. Key families for 2026:
- **PowerVault ME5**: Entry SAN, most affordable
- **PowerStore T-series**: Unified All-Flash primary storage (mainstream)
- **PowerStore Prime (Q-series)**: QLC All-Flash, high capacity at lower cost (newest)
- **PowerScale**: Scale-out NAS for unstructured data

---

## PowerVault ME5 — Entry SAN (Most Affordable)

### Models
- **ME5012**: 2U, 12 x 3.5" LFF, up to 96 drives with expansion
- **ME5024**: 2U, 24 x 2.5" SFF, up to 192 drives with expansion

### Technology
- Dual controller (Active-Active)
- Protocols: 10GbE iSCSI or 16Gb FC per controller
- Drive types: SAS HDD, SAS SSD, NVMe SSD
- Cache: Up to 32 GB mirrored

### Target Use Cases
- Entry SAN for SME virtualization (VMware, Hyper-V, Proxmox)
- SQL Server small-scale shared storage
- Backup target repository (cost-effective)
- VDI boot volumes for small deployments

### When to Recommend
- Budget under 500,000 THB for storage
- Small VM count (< 30 VMs)
- Customer needs basic block storage without NAS
- Cost is the primary driver
- Replacing aging ME4 / MD series

### When NOT to Recommend
- Needs NAS + SAN unified → PowerStore
- Requires high IOPS or sub-ms latency → PowerStore or PowerStore Prime
- More than 500 TB capacity → PowerStore or PowerScale

---

## PowerStore T-Series — Unified All-Flash (Mainstream)

### Models
- **PowerStore 1200T**: Entry unified, 2U, NVMe all-flash
- **PowerStore 3200T**: Mid-range, higher IOPS and capacity
- **PowerStore 5200T**: Enterprise performance
- **PowerStore 9200T**: Highest performance in T-series

### Technology
- NVMe all-flash with Intel Optane SCM cache option
- Unified: SAN (FC/iSCSI) + NAS (NFS/SMB) from single platform
- Protocols: FC 32Gb, iSCSI 25GbE, NFS v4, SMB 3, S3 Object
- Inline deduplication + compression (always-on, ~4:1 to 5:1 data reduction)
- AppsOn: run containerized apps on storage controller
- Replication: MetroSync (zero RPO sync), async replication, CloudTier to AWS/Azure

### Target Use Cases
- Enterprise VMware environments with high IOPS
- Unified block + NAS consolidation
- Oracle, SAP HANA, SQL Server all-flash storage
- VDI at scale
- DR with native MetroSync replication

### When to Recommend
- Customer needs both SAN and NAS from single platform
- High-performance database workload
- Enterprise DR with zero RPO requirement
- Budget: 800,000 THB and above
- Replacing aging VNX, Unity, NetApp

### When NOT to Recommend
- Need maximum all-flash capacity per THB → PowerStore Prime (QLC) is cheaper per TB
- Pure massive NAS (petabyte scale) → PowerScale
- Entry SME with tight budget → PowerVault ME5

---

## PowerStore Prime (Q-Series) — QLC All-Flash (New, Best Value Flash)

### Models
- **PowerStore 3200Q**: Mid-range QLC all-flash
- **PowerStore 5200Q**: Enterprise QLC all-flash, highest capacity per U

### Technology
- QLC (Quad-Level Cell) NAND — 4x higher density than TLC → significantly lower cost per TB
- Same unified platform as T-series: SAN + NAS + S3
- NVMe TLC cache tier over QLC capacity tier (write acceleration)
- Same MetroSync replication and CloudTier as T-series
- Dell "Future-Proof" program: controller upgrade guarantee for investment protection

### Key Advantage
- All-Flash performance at cost approaching traditional hybrid storage
- Ideal for capacity-heavy workloads that previously used HDD-based systems
- Same management interface and feature set as T-series

### When to Recommend
- Customer wants all-flash but large capacity requirement makes T-series expensive
- Replacing spinning disk arrays with all-flash at near-same cost
- High-capacity VMware environment with moderate IOPS requirement
- Data warehouse, analytics, large file storage needing flash speed
- Budget: 1,000,000–3,000,000 THB

### When NOT to Recommend
- Write-intensive workloads (QLC has lower write endurance vs TLC) — T-series preferred
- Customer is price-sensitive and capacity is small → ME5 or PowerStore 1200T sufficient

---

## PowerScale — Scale-Out NAS (Unstructured Data)

### Models
- **F210**: All-flash NVMe, performance-optimized scale-out NAS
- **F710**: High-performance all-flash, enterprise NAS scale-out
- H-Series: Hybrid SSD+HDD, capacity-optimized
- A-Series: Archive, high-density HDD

### Technology
- OneFS distributed filesystem spanning all nodes
- Scale: 3 nodes minimum, up to 252 nodes per cluster
- Capacity: 20 TB to 50+ PB per cluster
- Protocols: NFS v3/v4, SMB 2/3, HDFS, S3 Object, FTP
- CloudPools: transparent tiering to cloud storage
- SmartQuotas + SmartPools: multi-tier data management

### Target Use Cases
- AI/ML training data repositories (F210/F710)
- Media & entertainment (video production, rendering)
- Life sciences genomics data lakes
- HPC scratch and home directories
- Enterprise home directories (hundreds of thousands of users)
- Log analytics and big data (HDFS compatible)

### When to Recommend
- Customer needs > 100 TB NAS capacity
- Unstructured data growing rapidly
- AI training dataset storage (large file, sequential read)
- Multi-protocol NFS + SMB + S3 from single namespace
- Budget: 1,500,000 THB minimum (3-node cluster)

### When NOT to Recommend
- NAS under 50 TB → PowerStore T handles file + block in one box
- Pure SAN/block → PowerStore or ME5
- Budget under 1M THB → PowerScale minimum cluster is expensive

---

## Storage Selection Guide 2026

| Scenario | Recommended Model | Reason |
|---|---|---|
| SME block SAN, budget limited | ME5024 | Cheapest all-in block SAN |
| Enterprise unified SAN+NAS | PowerStore 1200T–3200T | All-flash, NVMe, multi-protocol |
| High-capacity all-flash, best $/TB | PowerStore 3200Q / 5200Q | QLC all-flash, ~40% cheaper per TB vs TLC |
| Oracle/SAP HANA mission-critical | PowerStore 5200T / 9200T | Sub-ms NVMe, MetroSync zero RPO |
| AI training data, large unstructured | PowerScale F210 / F710 | Scale-out NAS, NVMe, linear scaling |
| Video, archive, large NAS | PowerScale H-Series | Capacity-optimized, petabyte scale |
| Entry backup target | ME5012 (HDD config) | Lowest $/TB for sequential write |

---

## Budget Reference (THB)

| Series | Entry Price | Notes |
|---|---|---|
| PowerVault ME5 | 200,000+ | Entry SAN, hybrid or SSD |
| PowerStore 1200T | 800,000+ | Unified all-flash, entry enterprise |
| PowerStore 3200Q / 5200Q | 1,000,000+ | QLC all-flash, best value flash |
| PowerStore 5200T+ | 1,500,000+ | High-performance NVMe unified |
| PowerScale (3-node min) | 1,500,000+ | Scale-out NAS |
