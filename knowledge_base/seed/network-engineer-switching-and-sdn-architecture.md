# Network Engineer Switching and SDN Architecture

- Start with traffic intent and security boundaries. Identify server-to-server flows, north-south user access, backup paths, storage paths, management traffic, and Internet breakout before drawing the physical topology.
- Use resilient leaf-spine or equivalent modular topologies for data center growth. Keep oversubscription, failure blast radius, and operational consistency visible in the design narrative.
- VLAN sprawl should not be the default answer. For multi-tenant or multi-zone environments, evaluate EVPN-VXLAN or SDN overlays where lifecycle, segmentation, and mobility requirements justify the added complexity.
- SDN is valuable only when automation, policy consistency, and rapid change are real needs. If the customer cannot operate overlay networking safely, a simpler routed design may be the better engineering decision.
- Validate switch design around uplink redundancy, control-plane convergence, MLAG or equivalent behavior, BGP/OSPF policy, and underlay observability.
- Separate management access, workload transport, storage replication, and backup traffic according to risk and performance sensitivity. Shared fabrics without policy discipline become outage amplifiers.
- Every network proposal should include assumptions for IP address allocation, DNS/DHCP dependencies, firewall policy ownership, and monitoring visibility at the interface, path, and service levels.
