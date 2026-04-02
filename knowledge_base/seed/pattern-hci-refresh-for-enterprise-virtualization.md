# Pattern HCI Refresh for Enterprise Virtualization

- Use this pattern when the customer is replacing aging virtualization infrastructure and wants simpler lifecycle management, modular scaling, and predictable resiliency for mixed enterprise workloads.
- Discovery focus: current hypervisor estate, cluster failure tolerance, VM criticality, storage growth, backup integration, DR expectations, and operational skill level.
- Recommended architecture shape: resilient HCI cluster with separate management, workload, backup, and replication considerations; backup platform with immutability; clear expansion path.
- Key design checks: N+1 headroom, patch window safety, licensing scope, backup window impact, and network segmentation for management versus workload traffic.
- Common risks: underestimating backup or DR overhead, assuming snapshot convenience replaces recoverability, and sizing only for current VM usage without growth.
- Commercial guidance: separate mandatory core platform, data protection, and optional DR or automation phases so the customer can understand tradeoffs clearly.
