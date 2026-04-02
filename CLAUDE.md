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
