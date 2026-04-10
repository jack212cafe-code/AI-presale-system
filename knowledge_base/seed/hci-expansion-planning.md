# HCI Expansion Planning

- Start with node counts that preserve N+1 resiliency after a failure and a maintenance event.
- Check CPU, RAM, and usable storage independently; HCI bottlenecks often appear in only one dimension.
- When backup, archive, or DR traffic shares the same hardware budget, document the impact on cluster growth.
- Prefer modular expansion notes in the proposal so later node adds can be priced without redesigning the platform.
