# Pattern Multi-Agent SaaS for SI and Distributor

- Use this pattern when the goal is to sell an AI-native multi-agent platform to SI and distributor organizations as a cloud SaaS service rather than as a one-off custom deployment.
- Discovery focus: target partner segment, expected tenant count, packaging strategy, monthly versus yearly subscription preference, support model, data isolation expectation, and customer success workflow.
- Recommended architecture shape: multi-tenant cloud application with package-based entitlements, usage-aware observability, role-based access, and operational controls for onboarding, support, and renewal.
- Key design checks: tenant isolation, package differentiation, subscription billing readiness, audit visibility, knowledge update workflow, and scalable support operations.
- Common risks: treating SaaS like a single-customer project, leaving package boundaries vague, underestimating support and onboarding effort, and not separating standard package features from premium services.
- Commercial guidance: define package tiers explicitly, state included capabilities and support boundaries, and keep monthly and yearly subscription offers comparable but operationally manageable.
