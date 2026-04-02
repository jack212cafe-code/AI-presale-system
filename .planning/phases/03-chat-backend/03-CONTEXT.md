# Phase 3: Chat Backend - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a multi-turn chat HTTP API that manages conversations per project. The backend:
- Accepts user messages and routes them through the appropriate pipeline stage
- Maintains conversation history and project context across turns
- Persists conversations and messages to Supabase
- Returns AI responses as markdown text

No frontend UI in this phase. No streaming. No admin tooling. Exit criteria: curl /api/chat with multi-turn messages navigates through all pipeline stages correctly.

</domain>

<decisions>
## Implementation Decisions

### State Machine — Stage Transitions
- **D-01:** Auto-advance through stages where no user input is required:
  - First message → auto-run intake normalization + discovery agent
  - Discovery complete → auto-run solution agent
  - BOM complete → auto-run proposal agent
- **D-02:** Wait for explicit user input at exactly ONE point: after solution options are returned, the system waits for the user to pick an option before running BOM
- **D-03:** Stage is tracked in the `conversations` table (e.g., `stage` column: `greeting | discovery | solution | awaiting_selection | bom | proposal`)

### Response Format
- **D-04:** Synchronous responses — the endpoint blocks until the pipeline stage completes, then returns the full response in one JSON body. No SSE, no polling.
- **D-05:** All assistant responses are plain markdown text in a `text` field. No typed JSON envelopes for v1. BOM tables and solution options are formatted as markdown tables/lists inside the text field.
- **D-06:** Frontend is responsible for showing a loading indicator while waiting. The backend API contract is: POST /api/chat → (wait) → 200 with response.

### Conversation Initiation
- **D-07:** Sending the first message implicitly creates both a project record and a conversation record. The client does NOT need to pre-create a project.
- **D-08:** Response to the first message includes the `project_id` and `conversation_id` so the client can reference them in subsequent messages.
- **D-09:** Subsequent messages include `conversation_id` to maintain context. No `project_id` required after initiation (looked up from conversation).

### Database Schema
- **D-10:** New tables: `conversations` (id, project_id, user_id, stage, created_at, updated_at) and `messages` (id, conversation_id, role enum('user','assistant'), content text, created_at)
- **D-11:** `conversations.stage` tracks current pipeline state to route the next user message correctly
- **D-12:** Existing `projects` table is reused as-is — conversation holds a FK to project

### Pipeline Integration
- **D-13:** The chat endpoint reuses existing agent functions directly (`runDiscoveryAgent`, `runSolutionAgent`, `runBomAgent`, `runProposalAgent`) — no new agent logic
- **D-14:** When user selects a solution option, the selection index/id is stored on the conversation (or project), and `runBomAgent` is called with that selected option
- **D-15:** Thai and English input both accepted (agents already support this via OpenAI)

### Authentication
- **D-16:** POST /api/chat is protected by `requireUserAuth` middleware (from Phase 2). All conversations are scoped to the authenticated user.

### Claude's Discretion
- Exact `conversations` and `messages` table column types and indexes
- Error message wording in AI responses when a stage fails
- Whether to store raw agent JSON outputs on the conversation record or only in the projects table
- Conversation lookup: whether to expose GET /api/conversations/:id for history retrieval (can be minimal or deferred)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Pipeline
- `scripts/complete-proposal-flow.js` — Reference chain of all 4 agents in order
- `agents/discovery.js` — `runDiscoveryAgent(intake, { projectId })`
- `agents/solution.js` — `runSolutionAgent(requirements, { projectId })`
- `agents/bom.js` — `runBomAgent(solution, { projectId, requirements })`
- `agents/proposal.js` — `runProposalAgent(project, requirements, solution, bom, { projectId })`

### Auth Middleware
- `lib/admin-auth.js` — Session cookie pattern; `requireUserAuth` in Phase 2 mirrors this
- `lib/projects.js` — `createProjectRecord`, `getProjectById`, persist functions

### Server Patterns
- `server.js` — Route pattern: `parseBody` → auth middleware → handler → `json()` response

### Requirements
- `.planning/REQUIREMENTS.md` §M2 — Chat UI acceptance criteria (multi-turn, Thai/English, inline BOM/solution)
- `.planning/STATE.md` — Decisions: raw Node.js HTTP, chat persists across sessions, Supabase conversations table

### Prior Phase Context
- `.planning/phases/01-1/01-CONTEXT.md` — Pipeline orchestration decisions (D-01 to D-07)
- `.planning/phases/02-user-authentication/02-CONTEXT.md` — Session cookie, requireUserAuth pattern

### Architecture
- `.planning/codebase/ARCHITECTURE.md` — Agent pipeline data flow, withAgentLogging pattern, dual-mode execution

</canonical_refs>

<specifics>
## Specific Ideas

- First message auto-creates project: the chat endpoint calls `createProjectRecord` internally on the first turn
- Solution selection: user message like "เลือกตัวเลือกที่ 1" or "option 1" should be detected by the stage state machine (conversation.stage = 'awaiting_selection') — simple keyword or index match is sufficient for v1
- Mock mode: all agents already fall back to mock when `OPENAI_API_KEY` is absent — chat endpoint inherits this for free
- Exit criteria fixture: use `test/fixtures/*.json` HCI scenario as the test brief for curl-based verification

</specifics>

<deferred>
## Deferred Ideas

- SSE token-by-token streaming — user confirmed "later" for v2
- Typed JSON envelope (type: 'solution_options' | 'bom_table') — noted as v2 enhancement
- GET /api/conversations/:id for history retrieval — can be added in Phase 4 (Cross-session History)
- Admin endpoint to view all conversations — defer to admin tooling phase

</deferred>

---

*Phase: 03-chat-backend*
*Context gathered: 2026-03-30*
