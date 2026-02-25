# AI Chat Feature Design

## Overview

Add AI-powered diagram assistance to MermaidDash. Users provide their own OpenAI API key and get a chat panel in the editor that can generate new diagrams from natural language and improve/fix existing ones.

## Architecture: Frontend-only AI calls

OpenAI API key stored encrypted in database (per user). Frontend fetches the key and makes direct streaming calls to OpenAI. No backend proxy.

**Rationale:** Self-hosted app, user's own key — no security concern exposing to their own browser. Simplest implementation, best UX with direct streaming, no new backend dependencies.

## Data Model

New Prisma model:

```prisma
model UserAiSettings {
  id        String   @id @default(uuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider  String   @default("openai")
  apiKey    String   // encrypted at rest
  model     String   @default("gpt-4o")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## Backend Endpoints

Under `/api/dashboard/ai-settings` (authenticated):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/ai-settings` | Get settings (provider, model, hasKey — never the raw key) |
| PUT | `/ai-settings` | Create/update settings |
| GET | `/ai-settings/key` | Get decrypted API key (for frontend AI calls) |
| DELETE | `/ai-settings` | Remove AI configuration |

API key encrypted with server-side secret from `AI_ENCRYPTION_KEY` env var.

## Frontend AI Service

Provider abstraction in `frontend/src/services/ai/`:

```
ai/
  types.ts      — AiProvider interface, AiMessage, AiResponse
  openai.ts     — OpenAI implementation (streaming via fetch SSE)
  provider.ts   — Factory returning provider based on settings
```

```typescript
interface AiProvider {
  chat(messages: AiMessage[], diagramContent: string): AsyncGenerator<string>
}
```

Direct `fetch` to OpenAI API with `stream: true`, parsed as SSE. No SDK dependency. Designed so adding new providers (Anthropic, Ollama) means creating a new file implementing the interface.

## Editor Chat Panel

New component `AiChatPanel.tsx` — right-side panel in editor, toggled via toolbar button.

### UX Flow

1. User clicks "Use AI" in toolbar → panel opens
2. If no API key configured → message with link to Profile page
3. User types message → sent to OpenAI with current diagram as context
4. AI streams response → displayed in chat
5. If response contains Mermaid code (in fenced code block) → editor content replaced automatically
6. Undo/redo works as normal

### System Prompt

Instructs the AI that it is a Mermaid diagram expert, should always return valid Mermaid syntax in fenced code blocks when making changes, and has access to the user's current diagram.

### Chat History

In-memory per session. Not persisted across reloads.

## Profile Page: AI Configuration

New section "AI Configuration" on Profile page:

- Provider dropdown (only "OpenAI" for now)
- API key input (password field with show/hide)
- Model dropdown (gpt-4o, gpt-4o-mini, gpt-3.5-turbo)
- Save / Delete buttons
- Status indicator (configured / not configured)

## Toolbar Integration

"Use AI" button in TopToolbar — only visible when user has AI configured. Shows sparkle/wand icon. Toggles the chat panel.

## Decisions

- **No backend proxy** — direct frontend-to-OpenAI for simplicity
- **No chat persistence** — keeps scope small, can add later
- **Auto-apply diagram changes** — with undo/redo as safety net
- **No SDK dependency** — raw fetch + SSE parsing
- **Provider abstraction** — ready for future providers without over-engineering now
