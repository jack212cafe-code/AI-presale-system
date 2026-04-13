# Lenovo ThinkSystem Server Line-up 2026 (V3 & V4 Era)

## Overview
Lenovo ThinkSystem servers are built on Intel Xeon Scalable Gen 4/5 (V3) and Gen 6 (V4) processors. The V3 series uses Sapphire Rapids/Emerald Rapids; the V4 series brings DDR5-6400 and PCIe 5.0 support.

---

## Entry Tier — SR630 V3

### Specs
- Form factor: 1U rack
- CPU: Intel Xeon Scalable Gen 4/5 (1 or 2 socket)
- Memory: DDR5, up to 32 DIMMs
- Storage: Up to 8 x 2.5" drives + 2 x M.2
- Network: Integrated 1GbE; PCIe slots for 10/25/100GbE

### Target Use Cases
- General-purpose workloads (web, app servers)
- Remote/branch office (ROBO) compute
- Edge compute
- Entry virtualization (VMware, Hyper-V, Proxmox)

### When to Recommend
- Budget-conscious deployment needing 1U density
- Small VM count (< 20 VMs)
- Customer needs cost-effective compute without storage-heavy requirements
- Budget: < 150,000 THB per node

### When NOT to Recommend
- High I/O or GPU workloads → use SR650 V3 or SR675 V3
- Database with high memory requirement → use SR650 V3/V4

---

## Mainstream Tier — SR650 V3

### Specs
- Form factor: 2U rack
- CPU: Intel Xeon Scalable Gen 4/5 (dual socket)
- Memory: DDR5, up to 32 DIMMs (up to 8TB with 3DS RDIMMs)
- Storage: Up to 24 x 2.5" SFF or 12 x 3.5" LFF bays
- Network: Integrated 10GbE OCP; PCIe 4.0 expansion
- GPU: Up to 4 x double-wide GPUs

### Target Use Cases
- Enterprise virtualization (VMware vSphere, Hyper-V, Proxmox)
- SQL Server, Oracle DB (mid-tier)
- HCI (Microsoft S2D, Proxmox Ceph node)
- Backup server with Veeam or Commvault
- General enterprise workloads

### When to Recommend
- Most popular all-around enterprise server choice
- Customer needs balanced compute + storage I/O
- VMware, Hyper-V, or S2D HCI cluster (3+ nodes)
- Backup repository server paired with DE Series storage
- Budget: 200,000–500,000 THB per node

### When NOT to Recommend
- Needs latest DDR5-6400 or PCIe 5.0 → upgrade to SR650 V4
- Pure AI/GPU workload → use SR675 V3 or SR680a V4

---

## Modern Business Tier — SR630 V4 / SR650 V4

### Specs
- Form factor: 1U (SR630) or 2U (SR650)
- CPU: Intel Xeon Scalable Gen 6 (V4 platform)
- Memory: DDR5-6400 (faster bandwidth than V3)
- PCIe: 5.0 — 2x bandwidth vs PCIe 4.0
- Storage: NVMe Gen 5 support

### Key Advantages over V3
- DDR5-6400 delivers ~20% higher memory bandwidth
- PCIe 5.0 doubles NVMe storage throughput
- Better performance-per-watt efficiency
- Longer support lifecycle (current generation)

### Target Use Cases
- Modern enterprise deployments requiring future-proofed platform
- High-performance databases (SQL Server, Oracle)
- Virtualization clusters requiring maximum VM density
- NVMe-based storage-heavy workloads

### When to Recommend
- Customer is greenfield and wants current-gen platform
- Budget allows for latest generation (20–30% premium over V3)
- Workload benefits from high memory bandwidth (in-memory analytics, large DB)
- Budget: 300,000–700,000 THB per node

---

## High-End Tier — SR850 V4 / SR860 V4

### Specs
- SR850 V4: 2U, 4-socket, up to 24 TB RAM (48 DIMM slots)
- SR860 V4: 2U, 4-socket, optimized for mission-critical
- CPU: Intel Xeon Scalable Gen 6
- Memory: Massive NUMA topology for large in-memory workloads

### Target Use Cases
- Large Oracle RAC databases
- SAP HANA large installations (scale-up)
- In-memory analytics (SQL Server In-Memory OLTP)
- Mission-critical HA applications requiring 4-socket

### When to Recommend
- Oracle Database with > 2 TB RAM requirement
- SAP HANA scale-up (TDI certified)
- Customer needs single-system scale rather than scale-out
- Budget: 1,500,000–5,000,000 THB per system

### When NOT to Recommend
- Standard virtualization → SR650 V4 is sufficient and more cost-effective
- Scale-out workload → use multiple SR650 V4 nodes instead

---

## AI Workload Tier — SR675 V3 / SR680a V4

### Specs
- SR675 V3: 2U, optimized for up to 8 x NVIDIA H100 SXM5 / H200
- SR680a V4: 2U, latest AI GPU platform, supports B100/B200 NVLink
- High-bandwidth NVLink/NVSwitch fabric support
- NVMe SSD for fast AI training dataset access
- High-density power: 10–12 kW per node

### Target Use Cases
- LLM training (GPT-class models)
- AI inference at scale
- HPC compute (molecular dynamics, CFD)
- Computer vision model training

### When to Recommend
- Customer explicitly needs GPU compute (NVIDIA H100/B100/B200)
- AI/ML training or inference workload
- Research institution or AI startup
- Budget: 3,000,000–20,000,000+ THB per node (depending on GPU count)

### When NOT to Recommend
- Standard virtualization → SR650 V4 is sufficient
- Budget under 1M THB → GPU server is cost-prohibitive

---

## Server Recommendation Summary

| Segment | Model | Budget/Node (THB) | Primary Use Case |
|---|---|---|---|
| Entry | SR630 V3 | < 150,000 | Small VMs, ROBO, edge |
| Mainstream | SR650 V3 | 200,000–500,000 | Enterprise VMs, HCI, backup server |
| Current Gen | SR630 V4 / SR650 V4 | 300,000–700,000 | Modern enterprise, high-perf DB |
| High-End | SR850 V4 / SR860 V4 | 1,500,000–5,000,000 | Oracle RAC, SAP HANA, 4-socket |
| AI | SR675 V3 / SR680a V4 | 3,000,000+ | GPU AI/ML, H100/B100 workloads |
