# Network Engineer Operational Hardening

- Standardize switch configurations with templates and version control. Manual one-off changes make incident response and compliance reviews far more difficult.
- Treat Layer 2 domains with caution. Large broadcast domains, unmanaged trunking, and inconsistent spanning-tree policy create avoidable operational risk.
- Define clear routing boundaries between campus, data center, branch, and cloud-connected environments. Ambiguous redistribution rules are a common source of intermittent failures.
- Build for secure operations: AAA, TACACS or RADIUS, role separation, configuration backup, drift detection, and out-of-band management should be part of the baseline, not premium options.
- Instrument the network with telemetry that supports troubleshooting at expert level: interface errors, discard rates, path changes, BGP adjacency state, EVPN route health, overlay endpoint reachability, and configuration drift.
- For SDN environments, make rollback and failure isolation explicit. Automation without staged validation can amplify a bad policy to the full fabric very quickly.
- A good network design explains not only the steady-state topology, but also what happens during switch failure, link loss, controller outage, maintenance, and partial site isolation.
