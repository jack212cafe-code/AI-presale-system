# Dell Storage Use Cases

## Entry SAN Storage: PowerVault ME5 Series

### Overview
PowerVault ME5 is Dell's entry-level SAN storage array targeting SMB and departmental workloads. It supports both iSCSI and FC (Fibre Channel) host connectivity.

### Target Use Cases
- Small to mid-size virtualization (VMware, Hyper-V)
- Database storage for SQL Server, Oracle (small-scale)
- File and application server block storage
- Remote/branch office storage
- VDI boot volumes

### Models
- ME5012: 2U, 12 x 3.5" LFF drives, max 96 drives with expansion
- ME5024: 2U, 24 x 2.5" SFF drives, max 192 drives with expansion
- ME5084: 4U, 84 x 3.5" LFF drives, max 336 drives with expansion

### Key Specs
- Controller: Dual controller (Active-Active)
- Host Ports: 10GbE iSCSI or 16Gb FC (per controller)
- Cache: Up to 32 GB (mirrored)
- Drive Types: SAS HDD, SAS SSD, NVMe SSD
- RAID: RAID 0, 1, 5, 6, 10, 50, 60
- Replication: Sync and async replication to another ME5

### When to Recommend
- Customer needs block storage with FC or iSCSI at entry price point
- Budget < 500,000 THB for storage
- Workload: small VMware / Hyper-V (< 20 VMs), SQL Server < 2TB
- Does not require NAS or object storage capability

### When NOT to Recommend
- Requires unified NAS + SAN → use PowerStore instead
- Requires >500 TB raw capacity → consider PowerStore or Scale-out
- Requires active-active stretched cluster across sites → use PowerStore

---

## Unified Storage: Dell PowerStore

### Overview
PowerStore is Dell's mid-range to enterprise unified storage platform combining block (SAN), file (NAS), and vVol in a single system. It uses NVMe-first architecture with Intel Optane SCM for ultra-low latency.

### Target Use Cases
- Enterprise VMware environments requiring high IOPS
- Unified block + NAS for consolidation
- Oracle, SAP HANA, SQL Server high-performance databases
- Virtual Desktop Infrastructure (VDI) at scale
- Application that requires NFS/SMB shares + iSCSI/FC block simultaneously
- Disaster Recovery with native replication

### Models
- PowerStore 500T: Entry unified, 2U, NVMe flash
- PowerStore 1200T / 3200T: Mid-range, higher IOPS and capacity
- PowerStore 5200T / 9200T: Enterprise, highest performance

### Key Specs
- Architecture: NVMe all-flash, Intel Optane SCM cache option
- Protocol: FC 32Gb, iSCSI 25GbE, NFS, SMB, S3 (object)
- Inline deduplication and compression (always-on)
- AppsOn: run containerized apps on storage node
- Replication: Sync (MetroSync), Async, CloudTier to AWS/Azure
- Data Reduction: Typical 4:1 to 5:1

### When to Recommend
- Customer needs both SAN and NAS from single platform
- High-performance database workload (Oracle, SAP, SQL)
- Customer wants enterprise-grade replication and DR
- Budget: 800,000 THB and above
- Replacing aging EMC/NetApp with unified platform

### When NOT to Recommend
- Pure file-only workload at scale → use PowerScale instead
- Customer needs petabyte-scale NAS → PowerScale better fit
- Very tight budget, basic block only → ME5 is sufficient

---

## Backup Storage: Dell PowerProtect DD (Data Domain)

### Overview
PowerProtect Data Domain (formerly EMC Data Domain) is Dell's purpose-built backup appliance. It provides inline deduplication and compression optimized for backup data, dramatically reducing backup storage footprint.

### Target Use Cases
- Centralized backup target for enterprise environments
- Disaster Recovery copy (DD Boost integration)
- Long-term retention / archive with Data Domain Cloud Tier
- Integration with Veeam, Commvault, Veritas NetBackup, Dell PPBM
- Virtual Tape Library (VTL) emulation for legacy backup software

### Models
- DD3300: Entry, up to 48 TB usable, 2U
- DD6400: Mid-range, up to 576 TB usable, 2U
- DD9400: Enterprise, up to 1.4 PB usable, 2U + expansion
- DD9900: Large enterprise, up to 4.6 PB usable
- DDVE (Virtual Edition): Software-only, runs on VMware/AWS/Azure

### Key Specs
- Inline deduplication ratio: 10-55x typical (backup data)
- DD Boost: reduces network traffic by doing dedup at source
- Protocols: NFS, CIFS, DD Boost (OpenStorage), VTL, iSCSI
- Replication: DD Replicator (async, logical replication between DD systems)
- Cloud Tier: tiering cold data to AWS, Azure, GCP

### When to Recommend
- Customer has large backup data (> 20 TB) needing deduplication
- Customer uses Veeam / Commvault / Veritas / PPBM as backup software
- Customer wants DR copy of backup data at remote site (DD Replicator)
- Customer has tape library and wants tapeless backup (VTL)
- Cloud DR requirement → DDVE on cloud

### When NOT to Recommend
- Backup data < 5 TB → standard NAS or object storage may suffice
- Customer uses Dell PPBM → can use PPBM integrated appliance or Integrated Data Protection Appliance (IDPA)
- Primary storage use case → DD is backup-only target, not primary storage

---

## Scalable NAS: Dell PowerScale (formerly Isilon)

### Overview
PowerScale is Dell's scale-out NAS platform for unstructured data at petabyte scale. It uses a distributed clustered architecture where performance and capacity scale linearly by adding nodes.

### Target Use Cases
- Large-scale file storage for media & entertainment (video production)
- Life sciences and genomics data lake
- High-performance computing (HPC) scratch and home directories
- Enterprise home directories (hundreds of thousands of users)
- AI/ML training data repositories
- Log analytics and big data (HDFS compatible)

### Node Families
- H-Series (Hybrid): SSD + HDD, capacity-optimized
- F-Series (All-Flash): NVMe-based, performance-optimized
- A-Series (Archive): High-density HDD for cold archive
- B-Series (Backup target): Deduplicated archive

### Key Specs
- Protocol: NFS v3/v4, SMB 2/3, HDFS, S3 (object), FTP
- Scale: 3 nodes minimum, up to 252 nodes per cluster
- Capacity: From 20 TB to 50+ PB per cluster
- OneFS OS: distributed filesystem spanning all nodes
- CloudPools: transparent tiering to cloud (S3-compatible)
- SmartQuotas, SmartPools for data tiering within cluster

### When to Recommend
- Customer needs > 100 TB NAS capacity
- Unstructured data growing rapidly (petabyte-scale)
- Media production, rendering farm, AI training data
- Requirement for linear scale-out (add nodes without downtime)
- Multi-protocol NFS + SMB + S3 from single namespace

### When NOT to Recommend
- Small NAS < 50 TB → PowerStore T model (file) is simpler and cheaper
- Pure SAN/block workload → PowerStore or ME5
- Budget < 1M THB → PowerScale minimum cluster is expensive (3 nodes)
