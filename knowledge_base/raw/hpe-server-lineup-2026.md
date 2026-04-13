# HPE ProLiant Server Line-up 2026 (Gen11 & Gen12)

## Overview
HPE ProLiant Gen11 and Gen12 are the current server platforms for 2026. Key differentiators: Silicon Root of Trust security (iLO firmware cryptographically anchored to silicon), HPE GreenLake cloud management, and HPE InfoSight predictive analytics (AI-based health monitoring that predicts failures before they occur). Gen12 is the latest generation with PCIe 6.0 and DDR5-6400+.

---

## Entry Tier — DL110 Gen11

### Specs
- Form factor: 1U rack
- CPU: Intel Xeon Scalable 5th Gen (single socket)
- Memory: DDR5, up to 8 DIMM slots
- Storage: Limited internal bays (4 x 2.5" or 2 x 3.5")
- Network: 2 x 1GbE integrated

### Target Use Cases
- Edge compute nodes
- Web and application servers
- Remote/branch office (ROBO)
- Light virtualization (< 10 VMs)

### When to Recommend
- Smallest 1U footprint needed
- Budget under 100,000 THB per node
- Edge or ROBO deployment

### When NOT to Recommend
- Need dual-socket or heavy I/O → DL360 Gen11
- HCI or cluster node → DL360/DL380

---

## Mainstream Tier — DL360 / DL380 Gen11

### Specs
- **DL360 Gen11**: 1U, dual socket, Intel Xeon 5th Gen, up to 10 x 2.5" SFF, PCIe 4.0/5.0
- **DL380 Gen11**: 2U, dual socket, Intel Xeon 5th Gen, up to 24 x 2.5" SFF or 12 x 3.5" LFF, more GPU/PCIe slots
- Memory: DDR5, up to 32 DIMM slots (up to 8TB RAM)
- iLO 6: integrated lifecycle management, remote management, Silicon Root of Trust

### Target Use Cases
- Enterprise virtualization (VMware vSphere, Hyper-V, Proxmox)
- SQL Server, Oracle Database mid-tier
- HCI cluster nodes (VMware vSAN, Proxmox Ceph)
- Backup media agent (Commvault, Veeam proxy)
- General enterprise workloads

### Key Advantage — HPE InfoSight
- AI-based predictive analytics: monitors telemetry from millions of HPE systems globally
- Predicts hardware failures (disk, DIMM, fan) before they occur
- Auto-dispatches replacement parts proactively
- Reduces unplanned downtime by up to 86% (HPE claim)

### When to Recommend
- "Workhorse" server for enterprise VMware or Hyper-V environments
- Customer values predictive support (InfoSight proactive parts dispatch)
- HCI cluster nodes (DL360 for 1U density, DL380 for more storage bays)
- Budget: 200,000–600,000 THB per node

### When NOT to Recommend
- Need latest Gen12 platform → DL360/DL380 Gen12
- AI/GPU workload → DL384 Gen11 or DL380a Gen11
- 4-socket mission-critical → DL560/DL580 Gen11

---

## Next-Gen Tier — DL360 / DL380 Gen12 (Latest)

### Specs
- CPU: Intel Xeon 6th Gen (Granite Rapids)
- Memory: DDR5-6400+ (higher bandwidth than Gen11)
- PCIe: **6.0** — 2x bandwidth vs PCIe 5.0, 4x vs PCIe 4.0
- NVMe: Gen 5 NVMe support
- Power efficiency: improved with Intel Xeon 6 architecture

### Key Advantages over Gen11
- PCIe 6.0: dramatically higher I/O bandwidth for NVMe storage and networking
- DDR5-6400+: highest memory bandwidth in ProLiant lineup
- Longest support lifecycle as current-generation platform
- Enhanced iLO 7 security features

### Target Use Cases
- Modern enterprise greenfield deployments
- High-performance databases requiring maximum bandwidth
- VDI at scale
- Future-proofed HCI clusters

### When to Recommend
- Customer wants absolute latest generation
- High-bandwidth workloads (analytics, large DB, AI inference)
- New deployment with 5+ year hardware lifecycle plan
- Budget: 400,000–900,000 THB per node

---

## Mission-Critical Tier — DL560 / DL580 Gen11

### Specs
- **DL560 Gen11**: 2U, 4-socket, Intel Xeon Scalable 5th Gen
- **DL580 Gen11**: 4U, 4-socket, maximum memory and I/O expansion
- Memory: Up to 24 TB RAM (DL580 with 3DS RDIMMs)
- Designed for mission-critical, always-on workloads

### Target Use Cases
- Large Oracle RAC databases
- SAP HANA scale-up (TDI certified)
- In-memory analytics with multi-TB RAM requirement
- Mission-critical business applications with strict SLA

### When to Recommend
- Oracle DB requiring > 2 TB RAM
- SAP HANA scale-up
- Customer requires 4-socket single-system vertical scaling
- Budget: 2,000,000–7,000,000 THB per system

---

## AI / GPU Tier — DL384 Gen11 / DL380a Gen11

### Specs
- **DL380a Gen11**: 2U, optimized for up to 4 x NVIDIA H100 PCIe or L40S
- **DL384 Gen11**: 2U, high-density GPU, supports up to 8 x GPU (SXM or PCIe)
- High-bandwidth NVLink support
- NVMe SSD for fast training data access

### Target Use Cases
- AI inference at scale (NVIDIA H100 / L40S)
- LLM fine-tuning
- Computer vision model training
- HPC workloads

### When to Recommend
- Customer explicitly needs NVIDIA GPU compute
- AI inference or training workload
- Budget: 4,000,000–25,000,000+ THB per system

---

## HPE GreenLake Integration
All ProLiant Gen11/Gen12 servers are GreenLake-ready:
- **Consumption model**: pay per actual compute/storage used (OpEx instead of CapEx)
- **Cloud console**: manage on-premises hardware from HPE GreenLake cloud portal
- **Unified management**: single pane for servers, storage, and networking
- Suitable for customers who want cloud-like experience on-premises

---

## Server Recommendation Summary

| Segment | Model | Generation | Budget/Node (THB) | Use Case |
|---|---|---|---|---|
| Entry | DL110 Gen11 | Gen11 | < 100,000 | Edge, ROBO, light VMs |
| Mainstream | DL360 / DL380 Gen11 | Gen11 | 200,000–600,000 | Enterprise VMs, HCI, backup |
| Latest Gen | DL360 / DL380 Gen12 | Gen12 | 400,000–900,000 | Modern enterprise, high-perf DB |
| Mission-Critical | DL560 / DL580 Gen11 | Gen11 | 2,000,000–7,000,000 | Oracle RAC, SAP HANA, 4-socket |
| AI/GPU | DL384 / DL380a Gen11 | Gen11 | 4,000,000+ | GPU AI/ML workloads |
