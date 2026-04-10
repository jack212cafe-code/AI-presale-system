# Playbook Presale Migration and Cutover

- Every migration proposal should define source platform, target platform, dependency map, data move method, fallback plan, validation checkpoints, and business blackout limits.
- Separate migration complexity into compute, storage, network, identity, security, backup, and application dependencies. The project risk usually lives between domains rather than inside a single product.
- Design the cutover plan around rollback reality. If rollback cannot be executed within the accepted outage window, the migration approach is not yet production-ready.
- Include pre-cutover health checks, backup verification, ownership matrix, bridge communication plan, and post-cutover validation criteria in the solution narrative.
- For presale, explain what requires professional services, what can be automated, and what remains customer-owned during the migration window.
