# System Engineer Server Storage Foundation

- Start every server and storage design from workload behavior, not from vendor preference. Capture CPU profile, memory pressure, latency sensitivity, IOPS pattern, usable capacity, growth rate, and recovery objectives before sizing.
- Separate control-plane dependencies from data-plane dependencies. Management nodes, directory services, DNS, NTP, monitoring, backup repositories, and jump hosts must survive partial failures or maintenance windows.
- Use N+1 or better resiliency for production clusters. Validate host failure impact on compute headroom, storage rebuild time, and east-west traffic before finalizing node count.
- Keep performance, capacity, and recoverability as separate design dimensions. A platform can have enough raw capacity and still fail because of write latency, cache pressure, or backup windows.
- Document firmware, hypervisor, storage software, and driver compatibility as part of the solution. Operational stability degrades quickly when lifecycle management is treated as an afterthought.
- Design for observability from day one. Health, capacity trend, latency hotspots, replication lag, and backup success rate must be visible without manual log collection.
- For enterprise proposals, explicitly state assumptions for rack space, power, cooling, upstream bandwidth, backup retention, and recovery orchestration.
