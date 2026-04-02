---
phase: 4
slug: chat-ui-frontend
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-31
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in, Node 24.14.0) |
| **Config file** | none — `node --test` scans test/*.test.js |
| **Quick run command** | `node --test --test-isolation=none test/chat.test.js` |
| **Full suite command** | `node --test --test-isolation=none` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test --test-isolation=none test/chat.test.js`
- **After every plan wave:** Run `node --test --test-isolation=none`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 0 | M2 | unit | `node --test --test-isolation=none test/chat.test.js` | ✅ | ⬜ pending |
| 4-01-02 | 01 | 0 | M2 | unit | `node --test --test-isolation=none test/chat.test.js` | ❌ W0 | ⬜ pending |
| 4-01-03 | 01 | 1 | M2 | smoke | `node scripts/smoke.js` | ✅ | ⬜ pending |
| 4-02-01 | 02 | 1 | M2 | manual | — | — | ⬜ pending |
| 4-03-01 | 03 | 1 | M2 | manual | — | — | ⬜ pending |
| 4-04-01 | 04 | 2 | M2 | unit | `node --test --test-isolation=none test/chat.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/chat.test.js` — add test for `GET /api/proposals/:projectId/download` (returns 200 + Content-Disposition header)
- [ ] `test/chat.test.js` — add test for `GET /chat` static route (returns 200 + text/html)
- [ ] `test/chat.test.js` — add test for `GET /login` static route (returns 200 + text/html)
- [ ] `test/chat.test.js` — add test for `GET /api/conversations/:id/messages` if endpoint is added

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chat message thread renders correctly | M2 | No DOM test infra (vanilla JS) | Open /chat, send message, verify reply appears |
| Solution options render as structured cards | M2 | No DOM test infra | Send HCI brief, verify card UI renders |
| BOM renders as inline table | M2 | No DOM test infra | Trigger BOM stage, verify table renders |
| Proposal download button appears + triggers download | M2 | No DOM test infra | Reach proposal stage, click download |
| Thai language input works end-to-end | M2 | No DOM test infra | Type Thai brief, verify pipeline responds |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
