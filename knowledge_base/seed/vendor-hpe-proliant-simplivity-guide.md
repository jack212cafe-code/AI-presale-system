# Vendor HPE ProLiant and SimpliVity Presale Guide

## ProLiant Servers

- HPE ProLiant DL380 Gen11 is the primary 2U 2-socket compute platform for enterprise workloads, supporting up to 2x 5th Gen Intel Xeon Scalable or AMD EPYC 9004, up to 8TB DDR5 RDIMM, and 12x NVMe SSD bays.
- HPE ProLiant DL360 Gen11 is the 1U alternative for density-constrained racks with equivalent CPU support but reduced storage bay count.
- Position ProLiant when the customer has existing HPE infrastructure, HPE support contracts, or prefers iLO-based out-of-band management with HPE OneView lifecycle automation.
- iLO Advanced license is required for full remote KVM, power capping, and automated firmware updates — include this cost explicitly in every BOM.
- Validate BIOS/firmware baseline compatibility with the target OS (VMware ESXi, Windows Server, RHEL) and note HPE SPP (Service Pack for ProLiant) as the patching vehicle.

## SimpliVity HCI

- HPE SimpliVity is an HCI platform requiring VMware vSphere — Broadcom licensing cost must be included in every SimpliVity BOM (estimate 200–300% increase vs pre-2024 perpetual pricing).
- SimpliVity OmniStack provides built-in deduplication, compression, and backup to SSD — minimum 4 SSD per node for OmniStack data store.
- Minimum viable cluster is 2 nodes for lab/dev; production requires 3+ nodes for N+1 HA tolerance.
- SimpliVity backup is VM-centric and does not replace enterprise backup for file/object/database-consistent recovery — clarify scope during discovery.
- Position SimpliVity when the customer wants integrated VM backup without separate backup infrastructure, and accepts VMware as the only hypervisor option.

## HPE MSA Storage

- HPE MSA 2060/2062 is an entry-to-midrange SAN/NAS array supporting iSCSI, FC, and SAS host interfaces.
- Use MSA when the customer needs simple block storage for 1–3 servers at low cost, without advanced data services requirements.
- MSA does not support inline deduplication or global thin provisioning — document this limitation during presale.

## BOM Guardrails

- Never quote HPE hardware without confirming part number availability through HPE Thailand distributor (Arrow or Ingram).
- Lead times in Thailand: ProLiant standard BTO 3–4 weeks, SimpliVity 6–10 weeks, MSA 2–3 weeks.
- Include HPE Foundation Care 3-year NBD or 4H on all server and storage line items unless customer explicitly declines support.
- SimpliVity requires HPE software entitlement — do not separate hardware and software pricing in quotes.

## Sources
- knowledge_base/seed (internal presale knowledge)
- HPE ProLiant Gen11 QuickSpecs (reference: proliant-dl380-gen11)
- HPE SimpliVity product overview (reference: simplivity-omnistack)
