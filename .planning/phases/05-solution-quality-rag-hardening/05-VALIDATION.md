---
phase: 5
slug: solution-quality-rag-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js scripts (node scripts/*.js) |
| **Config file** | none — scripts run directly |
| **Quick run command** | `node scripts/smoke.js` |
| **Full suite command** | `node scripts/evaluate-kb.js && node scripts/complete-bom-flow.js && node scripts/complete-proposal-flow.js` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node scripts/smoke.js`
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 0 | S1 | fixture | `node -e "require('./test/fixtures/scenario_cybersecurity.json')"` | ❌ W0 | ⬜ pending |
| 5-01-02 | 01 | 0 | S1 | fixture | `node -e "require('./test/fixtures/scenario_fullstack.json')"` | ❌ W0 | ⬜ pending |
| 5-01-03 | 01 | 1 | S1 | unit | `node scripts/smoke.js` | ✅ | ⬜ pending |
| 5-02-01 | 02 | 1 | M5 | integration | `node scripts/complete-proposal-flow.js` | ✅ | ⬜ pending |
| 5-03-01 | 03 | 2 | M5 | validation | `node scripts/complete-bom-flow.js` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Note: Row 5-04-01 (proposal prompt) was removed — Plan 04 does not exist. The proposal prompt rewrite is covered by Plan 02 Task 2, verified by 5-02-01.*

---

## Wave 0 Requirements

- [ ] `test/fixtures/scenario_cybersecurity.json` — cybersecurity-only presale scenario fixture
- [ ] `test/fixtures/scenario_fullstack.json` — full-stack (HCI + Backup + DR + Cybersecurity) scenario fixture

*Existing infrastructure (smoke.js, complete-bom-flow.js, complete-proposal-flow.js) covers remaining requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Proposal tone meets Thai enterprise standard | M5 | Subjective quality judgment | Run complete-proposal-flow.js, read output, verify formal Thai business language, check structure matches enterprise proposal format |
| 3 real presale scenarios rated "usable without major edits" | M5 | Human quality gate | Run all 3 scenario fixtures end-to-end, review solution + BOM + proposal output against manual reference |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
