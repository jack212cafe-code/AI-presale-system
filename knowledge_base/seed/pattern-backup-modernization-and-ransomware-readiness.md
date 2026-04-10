# Pattern Backup Modernization and Ransomware Readiness

- Use this pattern when the customer has legacy backup operations, weak recovery confidence, or explicit ransomware concerns.
- Discovery focus: protected workloads, repository growth, retention model, immutability requirement, offsite copy, restore testing maturity, and privileged access controls.
- Recommended architecture shape: modern backup platform with hardened repositories or immutable targets, offsite copy, monitored backup health, and tested restore workflow.
- Key design checks: change rate, backup window, restore concurrency, WAN limitation, repository sizing, and identity dependency during recovery.
- Common risks: treating backup success as proof of recoverability, not protecting backup credentials, and leaving restore testing out of scope.
- Commercial guidance: keep repository design, immutability, restore validation, and monitoring explicit in the BOM and proposal rather than implying they are included automatically.
