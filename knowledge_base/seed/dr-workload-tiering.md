# DR Workload Tiering Checklist

- Classify workloads by business criticality before recommending pilot light, warm site, or hot site.
- Group application dependencies so the recovery plan preserves service order, not just VM power-on.
- Reserve WAN bandwidth and replication targets according to the busiest recovery windows, not average traffic.
- Escalate when the customer asks for aggressive RTO without confirming application owners and test frequency.
