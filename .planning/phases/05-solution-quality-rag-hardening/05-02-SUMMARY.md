---
phase: 05-solution-quality-rag-hardening
plan: 02
subsystem: prompts
tags: [solution-prompt, proposal-prompt, thai-enterprise, rag, presale]
dependency_graph:
  requires: []
  provides: [solution-prompt-v2, proposal-prompt-v2]
  affects: [agents/solution.js, agents/proposal.js]
tech_stack:
  added: []
  patterns: [loadPrompt runtime injection, schema-strict prompting]
key_files:
  created:
    - agents/_prompts/solution.md
    - agents/_prompts/proposal.md
  modified: []
decisions:
  - "Solution prompt: Thai enterprise framing replaces SaaS framing (D-04)"
  - "Vendor catalog: all 6 families named explicitly to prevent hallucination (D-05)"
  - "Architecture rule: component-level + rationale required, vague descriptions forbidden (D-06)"
  - "Proposal prompt: CRITICAL Thai language instruction placed at top of file (D-07)"
  - "Proposal prompt: action owner prefixes (ฝ่ายขาย/วิศวกร/ลูกค้า) in next_steps (D-09)"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-02"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase 05 Plan 02: Prompt Rewrite for Thai Enterprise Presale Quality Summary

**One-liner:** Rewrote solution and proposal prompts from SaaS-generic stubs to Thai enterprise IT presale quality with 5-domain/6-vendor coverage and field-level Thai output guidance.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Rewrite solution prompt for Thai enterprise IT presale | bb01653 | agents/_prompts/solution.md |
| 2 | Expand proposal prompt for Thai enterprise with field-level guidance | 2ac8fcd | agents/_prompts/proposal.md |

## What Was Built

### Task 1: Solution Prompt Rewrite

Replaced the SaaS-framed solution prompt with a Thai enterprise IT presale prompt containing:
- Role: Solution Design Agent for Thai enterprise customers
- 5 domains: HCI, 3-Tier, Backup & Recovery, DR, Cybersecurity
- 6 vendor families: Nutanix, Veeam, Dell, Cisco, Fortinet, HPE with product-family details
- Thai enterprise buying context: THB budgets, local support preference, cost sensitivity
- Architecture description rule: component-level with rationale, example provided, vague forbidden
- Schema compliance warning: "Do NOT add fields beyond this schema"
- Knowledge base grounding instruction

### Task 2: Proposal Prompt Expansion

Replaced the 7-line proposal stub with a 35-line full guidance prompt:
- CRITICAL Thai language instruction at top: "MUST be written in Thai (ภาษาไทย)"
- Formal register: ภาษาทางการ
- Field-level guidance for all 4 fields
- executive_summary: 2-3 paragraph structure for executive decision-makers
- solution_overview: component-by-component Thai technical description
- assumptions: infra + commercial bullet points
- next_steps: action owner prefixes ฝ่ายขาย/วิศวกร/ลูกค้า with timeline guidance

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- agents/_prompts/solution.md: FOUND
- agents/_prompts/proposal.md: FOUND
- 05-02-SUMMARY.md: FOUND
- commit bb01653: FOUND
- commit 2ac8fcd: FOUND
