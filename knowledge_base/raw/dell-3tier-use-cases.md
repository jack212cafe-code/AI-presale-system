# Dell 3-Tier Architecture Use Cases

## Overview
3-Tier architecture separates compute, networking, and storage into distinct layers connected via a SAN fabric. Dell's 3-tier solution uses Dell PowerEdge servers as compute, Dell storage (PowerVault ME5 or PowerStore) as shared storage, and Dell Networking SAN switches (or Brocade/Cisco) for FC connectivity.

---

## Architecture: Dell Server + Dell Storage (ME5 or PowerStore) + Dell SAN Switch

### Components

| Layer | Component Options |
|---|---|
| Compute | Dell PowerEdge R-series (R760, R750, R650xs, R760xs) |
| Shared Storage | Dell PowerVault ME5 (entry SAN) or Dell PowerStore (unified mid-range) |
| SAN Fabric | Dell EMC SAN Switch (Brocade OEM) 16Gb FC or 32Gb FC, or iSCSI 10/25GbE |
| Hypervisor | VMware vSphere, Microsoft Hyper-V, or bare-metal Linux |
| Management | Dell OpenManage, VMware vCenter, or Windows Admin Center |

---

## Use Case 1: VMware vSphere 3-Tier with FC SAN

### Architecture
Multiple PowerEdge servers (ESXi hosts) connected to a PowerVault ME5 or PowerStore via dual Brocade FC SAN switches (redundant fabric). Shared VMFS or vVol datastores on the storage array.

### When to Use
- Customer already has FC SAN switches or HBAs in existing servers
- Workload requires dedicated storage I/O isolation from network traffic
- Customer needs to share storage across heterogeneous servers (mixed generations)
- SLA requires zero single point of failure (dual fabric, dual controller)

### Bill of Materials (typical)
- 2–8 x PowerEdge R760 (ESXi hosts), 16Gb FC HBAs
- 1 x PowerVault ME5024 (entry) or PowerStore 500T (mid-range)
- 2 x Dell EMC SAN Switch 16Gb FC (16-port or 24-port) — redundant fabric
- VMware vSphere licenses per socket

### Recommended Scale
- 2–8 compute nodes, 20–200 VMs
- Storage: 10 TB – 500 TB usable depending on ME5 or PowerStore model

---

## Use Case 2: Microsoft Hyper-V 3-Tier with iSCSI SAN

### Architecture
PowerEdge servers (Hyper-V hosts) connected to ME5 or PowerStore via 10GbE iSCSI over dedicated storage VLAN (no FC switches required). Shared CSV (Cluster Shared Volume) on iSCSI LUNs.

### When to Use
- Customer wants to avoid FC SAN switch cost (use existing 10GbE network)
- Microsoft Hyper-V environment with MPIO iSCSI
- Smaller budget — iSCSI eliminates SAN switch and HBA cost
- Customer not ready for HCI but wants shared storage

### Bill of Materials (typical)
- 2–4 x PowerEdge R760 or R750 (Hyper-V hosts), 10/25GbE NICs
- 1 x PowerVault ME5024 (iSCSI model) or PowerStore 500T
- Dedicated 10/25GbE storage switches (can be shared with server switches if VLANed)
- Windows Server 2022 Datacenter per host

### Recommended Scale
- 2–4 compute nodes, 10–100 VMs
- Storage: 5 TB – 200 TB usable

---

## Use Case 3: Database Server 3-Tier (Oracle / SQL Server)

### Architecture
Bare-metal or virtualized database servers connected to PowerStore via FC SAN (preferred for lowest latency). PowerStore's NVMe all-flash ensures consistent sub-millisecond latency for OLTP workloads.

### When to Use
- Oracle Database (RAC or single instance) requiring FC shared storage
- SQL Server Always On with shared storage for FCIs
- SAP HANA on VMware requiring certified storage (PowerStore is VMware VVOL certified)
- Production database with strict IOPS and latency SLA

### Bill of Materials (typical)
- 1–4 x PowerEdge R760xs or R960 (database servers), 32Gb FC HBAs
- 1 x PowerStore 1200T or 3200T (NVMe all-flash)
- 2 x Dell EMC SAN Switch 32Gb FC
- Oracle DB license (customer-provided) or SQL Server Enterprise

### Key Considerations
- PowerStore supports Oracle DBFS and Direct NFS (dNFS)
- PowerStore vVols provide per-VM QoS for mixed workloads
- Replication: PowerStore MetroSync for zero RPO DR site

---

## Use Case 4: Entry 3-Tier for SMB

### Architecture
2 PowerEdge servers + 1 ME5012 or ME5024 connected via iSCSI. Simple, cost-effective shared storage without FC infrastructure. Suitable for small business needing shared storage for 10–30 VMs.

### When to Use
- SMB customer with ≤ 30 VMs
- Budget: 500,000 – 1,500,000 THB total
- Doesn't need scale-out or enterprise features
- May grow to larger cluster later

### Bill of Materials (typical)
- 2 x PowerEdge R650xs or R760 (2-node cluster)
- 1 x PowerVault ME5012 (12 x 3.5" SAS/SSD, iSCSI)
- 10GbE switches (existing or new)
- Windows Server 2022 Datacenter x2 or VMware vSphere Essentials Plus

---

## SAN Switch Options (Dell EMC / Brocade)

| Model | Ports | Speed | Use Case |
|---|---|---|---|
| Dell EMC SAN Switch 16Gb (DS-6610B) | 24 fixed | 16Gb FC | Entry 3-tier, < 8 hosts |
| Dell EMC SAN Switch 32Gb (DS-7720B) | 24–48 | 32Gb FC | Mid-range / enterprise |
| Brocade G610 | 24 fixed | 32Gb FC | Entry enterprise |
| Brocade G630 | 48–128 | 32Gb FC | Large enterprise / core |

**Note:** Always recommend dual SAN switches (Fabric A + Fabric B) for production. Single switch is single point of failure.

---

## 3-Tier vs HCI Decision Guide

| Criteria | 3-Tier (Traditional) | HCI |
|---|---|---|
| Storage flexibility | High — scale storage independently | Limited — tied to node ratio |
| Cost at small scale | Higher (SAN switches + array) | Lower |
| Cost at large scale | Potentially lower | Scales with node cost |
| Upgrade flexibility | Independent compute/storage | Must add full nodes |
| VMware vSAN-specific features | Not applicable | Required for VxRail |
| FC SAN existing infra | Good fit | Not needed |
| Simplicity | More complex | Simpler management |

**Recommendation:** Choose 3-tier when customer has existing FC SAN infrastructure or needs to scale compute and storage independently. Choose HCI for greenfield, simpler operations, or when avoiding FC switch cost.
