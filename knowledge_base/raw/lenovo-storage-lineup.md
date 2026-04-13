# Lenovo Storage Line-up 2026

## Overview
Lenovo ThinkSystem storage covers four product series targeting different workloads and budgets:
- **DS Series**: All-Flash SAN (block only, simple)
- **DG Series**: QLC All-Flash (high capacity, cost-efficient)
- **DM Series**: NVMe Unified (top performance, SAN+NAS+cloud)
- **DE Series**: Hybrid/HDD (maximum capacity, archive/backup)

---

## DS Series — All-Flash SAN Block Storage

### Models
- **DS3200**: Entry all-flash, 2U, 24 x 2.5" SSD
- **DS5200**: Mid-range all-flash, 2U, 24 x 2.5" NVMe/SSD

### Technology
- SSD-based all-flash (SAS SSD / SATA SSD)
- Dual controller (Active-Active)
- Protocols: iSCSI 10/25GbE, FC 16/32Gb

### Target Use Cases
- Pure block storage for virtualization (VMware, Hyper-V)
- SQL Server and Oracle mid-tier shared storage
- VDI boot volumes
- Simple SAN replacement for aging arrays

### When to Recommend
- Customer needs all-flash block storage at accessible price
- Use case is pure block (no NAS required)
- Replacing aging DS/SAN arrays
- Budget: 300,000–800,000 THB for storage

### When NOT to Recommend
- Needs NAS/file storage → DM Series
- Needs maximum capacity per TB cost → DG Series (QLC is cheaper per TB)
- Requires NVMe performance → DM5200F/DM7200F

---

## DG Series — QLC All-Flash (Best Value All-Flash)

### Models
- **DG5200**: Mid-range QLC all-flash, 2U, high-density SSD bays
- **DG7200**: Enterprise QLC all-flash, higher IOPS and capacity

### Technology
- QLC (Quad-Level Cell) NAND flash — 4x more bits per cell vs TLC → lower cost per TB
- Inline deduplication and compression for further savings
- Protocols: FC 32Gb, iSCSI 25GbE
- Cache: NVMe cache tier over QLC capacity tier

### Target Use Cases
- Cost-efficient all-flash for mixed read/write workloads
- Large VMware/Hyper-V environments needing all-flash at HDD cost
- Data warehousing with large read workloads
- Archive + analytics workloads requiring flash speed

### Key Advantage
- Lowest cost-per-TB for all-flash storage in the Lenovo lineup
- Significant savings vs TLC-only arrays for high-capacity deployments

### When to Recommend
- Customer wants all-flash but budget is limited
- High-capacity requirement where TLC is too expensive
- Mixed read/write workload (QLC handles reads well; writes via NVMe cache)
- Budget: 500,000–2,000,000 THB

### When NOT to Recommend
- Write-intensive workload (QLC has lower write endurance than TLC) → DS Series
- Needs NAS capability → DM Series

---

## DM Series — NVMe Unified Storage (Top Tier)

### Models
- **DM5200F**: Mid-range NVMe all-flash unified storage
- **DM7200F**: Enterprise NVMe all-flash unified storage, highest performance

### Technology
- NVMe all-flash (NVMe-oF ready)
- Unified: block (SAN) + file (NAS) from single platform
- Protocols: FC 32Gb, iSCSI 25GbE, NFS v3/v4, SMB 2/3, S3 Object
- Intel Optane or NVMe SCM option for sub-100µs latency
- CloudConnect: tiering to AWS, Azure, or Lenovo TruScale Cloud

### Target Use Cases
- Enterprise VMware environments needing highest IOPS
- Oracle Database, SAP HANA on shared NVMe storage
- Mixed SAN + NAS workloads from single platform
- VDI at scale (thousands of desktops)
- Multi-cloud data management

### When to Recommend
- Customer needs both SAN and NAS from single platform
- Mission-critical database with strict IOPS/latency SLA
- Replacing NetApp or EMC with unified platform
- Budget: 1,500,000 THB and above

### When NOT to Recommend
- Pure block only, budget-conscious → DS Series or DG Series
- Need petabyte-scale NAS → use scale-out NAS instead
- Very tight budget → DG5200 delivers most value per THB

---

## DE Series — Hybrid/HDD Large-Capacity Storage

### Models
- **DE4000H**: 2U, 12 x 3.5" LFF or 24 x 2.5" SFF, SAS/SATA HDD + SSD cache
- **DE6000H**: 4U, 60 x 3.5" high-density LFF drives

### Technology
- Hybrid: SSD read/write cache + HDD capacity drives
- Protocols: iSCSI 10/25GbE, FC 16Gb
- Maximum raw capacity per rack unit (lowest $/TB in the lineup)

### Target Use Cases
- Backup repository (Veeam, Commvault target storage)
- Video surveillance storage (sequential write)
- Big data and Hadoop storage
- Cold archive and compliance data retention
- Secondary/capacity tier storage

### When to Recommend
- Customer needs maximum TB at lowest cost
- Backup target storage for Veeam or Commvault
- Video storage, archive, log retention
- Budget: 200,000–600,000 THB for high-capacity repository

### When NOT to Recommend
- Primary storage for VMs or databases → performance is HDD-limited
- High IOPS requirement → use DS/DG/DM Series

---

## Storage Selection Guide

| Scenario | Recommended | Reason |
|---|---|---|
| VMware/Hyper-V primary SAN | DS3200 or DG5200 | All-flash block, right price/performance |
| Maximum all-flash capacity, budget-limited | DG5200 / DG7200 | QLC delivers all-flash at 40–60% cost of TLC |
| Enterprise unified SAN+NAS | DM5200F / DM7200F | Top performance, multi-protocol |
| Oracle/SAP HANA database | DM7200F | NVMe, sub-ms latency, certified |
| Backup target storage | DE4000H / DE6000H | Lowest $/TB, sequential write optimized |
| Video/archive | DE6000H | High-density HDD, cost-efficient |

---

## Budget Reference (THB)

| Series | Entry Price | Notes |
|---|---|---|
| DE Series | 200,000+ | HDD hybrid, cheapest $/TB |
| DS Series | 300,000+ | All-flash SAN, simple |
| DG Series | 500,000+ | QLC all-flash, best $/TB for flash |
| DM Series | 1,500,000+ | NVMe unified, enterprise-grade |
