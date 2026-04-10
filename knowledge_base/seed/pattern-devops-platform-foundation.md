# Pattern DevOps Platform Foundation

- Use this pattern when the customer wants faster delivery, infrastructure automation, and better operational consistency but does not yet have a mature shared platform.
- Discovery focus: current CI/CD tooling, infrastructure provisioning method, secrets handling, observability maturity, release approval process, and team ownership model.
- Recommended architecture shape: platform foundation with source control standards, pipeline templates, infrastructure as code, secrets management, observability baseline, and release guardrails.
- Key design checks: team operating model, environment promotion, rollback capability, runner security, artifact governance, and auditability.
- Common risks: adopting tools without ownership model, automating unstable manual processes, and treating Kubernetes or GitOps as goals instead of operating capabilities.
- Commercial guidance: separate foundation work from application modernization so the customer can understand where platform enablement ends and app transformation begins.
