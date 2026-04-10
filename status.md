# Project Functional Status (Single Source of Truth)

This document tracks the actual implementation status of features based on a codebase scan.

## ✅ Done (Fully Functional)
Implemented, wired to server, and operational.

| Component | Details | File References |
| :--- | :--- | :--- |
| **API Server & Routing** | Full set of endpoints for intake, solution, BOM, proposal, TOR, and admin. | `server.js` |
| **Core Pipeline** | End-to-end flow (Intake $\to$ Discovery $\to$ Specialists $\to$ Solution $\to$ BOM $\to$ Proposal) | `server.js` (lines 438-506) |
| **Discovery Agent** | Requirement extraction and parsing. | `agents/discovery.js` |
| **Solution Agent** | Hybrid RAG (Vector + Local) and multi-option design. | `agents/solution.js` |
| **BOM Agent** | Vendor enforcement and grounding. | `agents/bom.js` |
| **Proposal Agent** | `.docx` generation. | `agents/proposal.js`, `lib/proposal.js` |
| **Specialist Agents** | Domain-specific analysis (Dell, HPE, Lenovo, NetEng, DevOps, AI). | `agents/specialist.js` |
| **TOR Analysis** | TOR parsing and compliance checking. | `agents/tor.js` |
| **RAG / KB System** | Ingestion and hybrid retrieval system. | `lib/supabase.js`, `knowledge_base/shared.js` |
| **Auth & Admin** | Session-based auth and KB management portal. | `lib/user-auth.js`, `admin/admin.js` |
| **Chat UI (SSE)** | Real-time streaming chat interface. | `chat/chat.js`, `lib/chat.js` |
| **Intake Form** | Project start form and submission. | `intake/submit.js` |

## 🚧 In-Progress (Partial / Refinement Needed)
Logic exists but requires further hardening or accuracy improvements.

- **Customer Memory & User Preferences**: Basic vendor preferences and history handled, but complex long-term memory is still evolving. (`lib/user-preferences.js`, `lib/conversations.js`)
- **BOM Grounding**: Validation against KB exists but accuracy depends on KB coverage. (`lib/grounding.js`)
- **Sizing Accuracy**: Heuristic-based sizing in specialists may need vendor-specific formula refinement. (`agents/specialist.js`)

## ❌ Not-Started / Placeholder
Documented in plans or uses mock/skeleton code.

- **n8n Orchestration**: Workflow is currently a skeleton; logic is in `server.js`. (`n8n/workflow.json`)
- **Advanced .docx Templates**: Basic buffer generation is functional, but highly branded templates are not yet implemented.
- **Full E2E Integration Tests**: Many tests currently use `mock` mode; full live-environment coverage is pending.

---
*Last Updated: 2026-04-09*
