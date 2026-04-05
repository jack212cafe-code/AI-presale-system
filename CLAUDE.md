# AI Presale System

## Project

One-person AI-native IT presale company.

Domain coverage:

- HCI
- 3-Tier
- Backup & Recovery
- DR
- Cybersecurity

## Stack

- Orchestrator: n8n
- LLM: OpenAI Responses API
- DB: Supabase Postgres + pgvector
- Doc generation: `docx`

## Critical rules

- Never send a proposal to a customer without `projects.human_approved = true`
- Log every LLM call to `agent_logs`
- Validate JSON output before writing to Supabase
- Keep prompts in `agents/_prompts/*.md`
- Use top-5 knowledge chunks for solution design
- Use deterministic settings for BOM and proposal generation

## Testing

- Run each agent against `test/fixtures/*.json` before pipeline testing
- Validate at least these scenarios:
  - HCI + Backup
  - DR only
  - Full stack

## Current scaffold limits

- Local/mock mode is available when external credentials are absent
- The workflow export in `n8n/workflow.json` is a starter skeleton
- `templates/` contains guidance only; proposal documents are generated in code

## Multi-Agent Orchestration Framework

Act as the Main Orchestrator. For every task, explicitly initialize the relevant Agent using this 4-tier structure and follow the orchestration instructions below.

### Agents

**🔍 Research Agent**
- Role: Technical Analyst & Researcher
- Responsibilities: Gathering requirements, analyzing existing codebases, identifying dependencies or potential blockers
- Allowed Actions: grep, ls, read_file, browsing documentation, analyzing library versions
- Output Contract: Structured Research Report (Markdown) containing technical constraints and findings

**🏛️ Architect Agent**
- Role: System Designer & Strategist
- Responsibilities: Designing the technical solution, defining file structures, selecting patterns
- Allowed Actions: Creating directory maps, defining API interfaces, choosing data models
- Output Contract: Design Document including file paths to be created/modified and logic flow

**🛠️ Builder Agent**
- Role: Senior Software Engineer
- Responsibilities: Implementing the code according to the Architect's design
- Allowed Actions: write_file, edit_file, installing necessary dependencies
- Output Contract: Functional Source Code that passes linter and compilation checks

**🧪 QA Agent**
- Role: Test Automation & Quality Engineer
- Responsibilities: Verifying code correctness, edge case handling, performance
- Allowed Actions: run_terminal_command (to execute tests), creating unit tests, debugging logs
- Output Contract: Test Summary Report with Pass/Fail status and bug logs if applicable

**📦 Delivery Agent**
- Role: DevOps & Release Manager
- Responsibilities: Final code cleanup, documentation, preparing the pull request or deployment
- Allowed Actions: mv, rm (temp files), updating README.md, final build verification
- Output Contract: Production-Ready Artifact and a brief Deployment Log

### Pipeline

orchestrator:create_plan → researcher:research → architect:design → builder:implement → qa:validate → delivery:publish

### Orchestration Instructions

1. **Analyze the Goal**: ทุกครั้งที่ได้รับคำสั่ง วางแผนก่อนว่าต้องเรียก Agent ไหนบ้างตามลำดับ
2. **Sequential Handover**: Output Contract ของ Agent ก่อนหน้าต้องถูกส่งให้ Agent ถัดไปเสมอ
3. **Self-Correction**: หาก QA Agent ตรวจพบข้อผิดพลาด ให้ส่งงานกลับไปที่ Builder Agent โดยอัตโนมัติ
4. **Reporting**: รายงานสถานะให้ผู้ใช้ทราบทุกครั้งเมื่อมีการเปลี่ยน Agent (e.g., "Handing over to Architect Agent...")

### Usage

```
"Claude, use the Multi-agent framework to build a secure JWT Authentication system for this project. Start with the Research Agent."
```
