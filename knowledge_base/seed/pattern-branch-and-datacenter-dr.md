# Pattern Branch and Datacenter DR

- Use this pattern when the customer needs continuity across main site and branch or secondary site environments and wants practical recovery alignment by workload tier.
- Discovery focus: application tiering, dependency mapping, WAN capacity, branch criticality, identity and DNS survivability, and acceptable failover procedure.
- Recommended architecture shape: service-tiered DR with pilot light, warm, or hot alignment by workload importance, plus tested recovery sequencing and ownership matrix.
- Key design checks: replication consistency, bandwidth during recovery windows, branch isolation scenarios, and operational declaration process.
- Common risks: one-size-fits-all DR for all workloads, missing dependency map, and weak ownership during actual failover.
- Commercial guidance: distinguish core DR readiness from advanced cyber recovery or automation enhancements so the customer can phase adoption safely.
