# MermaidDash Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fork ExcaliDash and replace Excalidraw with a Mermaid diagram editor, adding a public REST API and MCP server for AI-driven diagram creation.

**Architecture:** Split-view editor (Monaco + mermaid.js preview), Express/Prisma/SQLite backend, Socket.IO for live collaboration and API-driven push updates. MCP server wraps the REST API.

**Tech Stack:** React 18, Vite, Monaco Editor, mermaid.js, Express 5, Prisma, SQLite, Socket.IO, TypeScript

---

## Task 1: Fork, Rebrand & Clean Dependencies

**Files:**
- Modify: `frontend/package.json`
- Modify: `backend/package.json`
- Modify: `frontend/index.html`
- Modify: `frontend/src/components/Logo.tsx`
- Modify: `docker-compose.yml`
- Modify: `docker-compose.prod.yml`

**Step 1: Update package names and dependencies**

In `frontend/package.json`:
- Change `name` to `mermaiddash-frontend`
- Remove `@excalidraw/excalidraw`
- Add `mermaid` (latest), `@monaco-editor/react` (latest)

In `backend/package.json`:
- Change `name` to `mermaiddash-backend`

**Step 2: Update branding**

In `frontend/index.html`:
- Change `<title>` to `MermaidDash`

In `frontend/src/components/Logo.tsx`:
- Replace ExcaliDash logo SVG with a simple mermaid-themed logo (trident or diagram icon)
- Update text references from "ExcaliDash" to "MermaidDash"

**Step 3: Update Docker**

In `docker-compose.yml` and `docker-compose.prod.yml`:
- Update container names to `mermaiddash-backend`, `mermaiddash-frontend`
- Update image names if publishing

**Step 4: Install dependencies and verify build**

```bash
cd frontend && npm install
cd ../backend && npm install
```

**Step 5: Commit**

```bash
git add -A && git commit -m "rebrand to MermaidDash, swap excalidraw deps for mermaid + monaco"
```

---

## Task 2: Update Data Model

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `frontend/src/types/index.ts`

**Step 1: Update Prisma schema**

In `backend/prisma/schema.prisma`, update the `Drawing` model:
- Rename `elements` to `content` (stores mermaid syntax as plain string)
- Keep `appState` (stores editor config as JSON string)
- Remove `files` field (mermaid diagrams don't have embedded binary files)
- Keep `preview` (SVG string for thumbnails)
- Keep all other fields unchanged

```prisma
model Drawing {
  id           String      @id @default(uuid())
  name         String
  content      String      @default("")    // Mermaid diagram syntax
  appState     String      @default("{}")  // Editor config (theme, zoom, panel sizes)
  preview      String?                     // Rendered SVG for dashboard thumbnail
  version      Int         @default(0)
  userId       String
  collectionId String?
  // ... rest unchanged
}
```

**Step 2: Generate migration**

```bash
cd backend && npx prisma migrate dev --name replace-elements-with-content
```

**Step 3: Update frontend types**

In `frontend/src/types/index.ts`:
- Update `Drawing` type: replace `elements`, `appState`, `files` with `content: string`
- Keep `preview`, `version`, etc.

**Step 4: Commit**

```bash
git add -A && git commit -m "update data model: replace excalidraw elements with mermaid content"
```

---

## Task 3: Backend Drawing Routes

**Files:**
- Modify: `backend/src/routes/dashboard/drawings.ts`
- Modify: `backend/src/server/drawingsCache.ts` (if needed)

**Step 1: Update drawing CRUD**

In `backend/src/routes/dashboard/drawings.ts`:
- Update `POST /drawings` to create with empty mermaid content (`graph TD\n    A[Start]`)
- Update `PUT /drawings/:id` to accept `content` string instead of `elements` array
- Update `GET /drawings` and `GET /drawings/:id` to return `content` instead of `elements`/`files`
- Remove any Excalidraw-specific validation (element structure, file references)
- Keep all auth, permission, and version checks unchanged

**Step 2: Search through all route files for `elements` and `files` references**

```bash
grep -rn "elements\|\.files" backend/src/routes/ --include="*.ts"
```

Update all references from `elements` to `content`, remove `files` handling.

**Step 3: Update Zod validation schemas**

Replace element array validation with string validation for `content`.

**Step 4: Verify backend starts**

```bash
cd backend && npm run dev
```

**Step 5: Commit**

```bash
git add -A && git commit -m "update backend routes for mermaid content storage"
```

---

## Task 4: Mermaid Editor Component

This is the largest task. Replace the entire Editor.tsx.

**Files:**
- Replace: `frontend/src/pages/Editor.tsx` (1716 lines → ~400 lines)
- Replace: `frontend/src/pages/editor/shared.ts`
- Replace: `frontend/src/utils/sync.ts`

**Step 1: Create the Mermaid editor component**

Replace `Editor.tsx` with a split-view layout:

```tsx
// Left: Monaco editor with mermaid syntax
// Right: Live mermaid.js preview panel
// Top: Toolbar with name, save status, share controls
```

Key features:
- Monaco editor with mermaid language support
- Debounced re-render of mermaid preview on content change (300ms)
- Auto-save via existing API (debounced 1000ms)
- Keep existing URL structure (`/editor/:id`)
- Keep existing auth/permission checks
- Keep name editing in toolbar

**Step 2: Implement mermaid rendering**

```tsx
import mermaid from 'mermaid';

// Initialize mermaid
mermaid.initialize({ startOnLoad: false, theme: 'default' });

// Render function
const renderDiagram = async (content: string) => {
  const { svg } = await mermaid.render('preview', content);
  return svg;
};
```

**Step 3: Replace sync utilities**

In `frontend/src/utils/sync.ts`:
- Replace element reconciliation with simple text comparison
- Content is just a string — last-write-wins with version check

In `frontend/src/pages/editor/shared.ts`:
- Remove all Excalidraw element utilities
- Add simple text diffing utilities if needed

**Step 4: Verify editor loads and renders**

```bash
cd frontend && npm run dev
# Open http://localhost:5173/editor/<id>
```

**Step 5: Commit**

```bash
git add -A && git commit -m "replace excalidraw editor with monaco + mermaid split-view"
```

---

## Task 5: Preview Generation & Dashboard Cards

**Files:**
- Modify: `frontend/src/components/DrawingCard.tsx`
- Replace: `frontend/src/utils/previewSvg.ts`
- Modify: `frontend/src/utils/importUtils.ts`

**Step 1: Update preview generation**

In `frontend/src/utils/previewSvg.ts`:
- Replace `exportToSvg()` (Excalidraw) with `mermaid.render()` for generating SVG previews
- Store rendered SVG in the `preview` field when saving

**Step 2: Update DrawingCard**

In `frontend/src/components/DrawingCard.tsx`:
- Remove `exportToSvg()` fallback rendering
- Use the stored `preview` SVG string directly
- If no preview, render a placeholder or generate on-the-fly
- Keep card layout, actions menu, drag-and-drop

**Step 3: Verify dashboard shows diagram previews**

```bash
cd frontend && npm run dev
# Check dashboard shows mermaid SVG thumbnails
```

**Step 4: Commit**

```bash
git add -A && git commit -m "update preview generation and dashboard cards for mermaid"
```

---

## Task 6: WebSocket Live Sync

**Files:**
- Modify: `backend/src/server/socket.ts`
- Modify: `frontend/src/pages/Editor.tsx` (socket integration part)

**Step 1: Update socket event payloads**

In `backend/src/server/socket.ts`:
- Update `element-update` event to `content-update` carrying the full mermaid string
- Keep `cursor-move`, `presence-update`, `join-room`, `disconnect` as-is
- Keep all auth/permission checks

**Step 2: Update frontend socket handlers**

In Editor.tsx socket integration:
- On `content-update` from server, update Monaco editor content
- On local content change, emit `content-update` to server
- Debounce outgoing updates to avoid flooding
- Keep cursor/presence tracking if desired

**Step 3: Test collaboration**

Open two browser tabs on the same diagram. Edit in one, verify the other updates live.

**Step 4: Commit**

```bash
git add -A && git commit -m "update websocket sync for text-based mermaid content"
```

---

## Task 7: Import/Export

**Files:**
- Modify: `backend/src/routes/importExport/excalidashImportRoutes.ts` → rename to `importRoutes.ts`
- Modify: `backend/src/routes/importExport/exportRoutes.ts`
- Modify: `backend/src/routes/importExport/shared.ts`
- Modify: `backend/src/routes/importExport/index.ts`

**Step 1: Update export**

In `exportRoutes.ts`:
- Single diagram export: download as `.mmd` file (plain text)
- Bulk export: ZIP archive containing `.mmd` files + `manifest.json` with metadata (name, collection, timestamps)

**Step 2: Update import**

Rename `excalidashImportRoutes.ts` → `importRoutes.ts`:
- Accept `.mmd` files (plain mermaid syntax)
- Accept `.md` files (extract mermaid code blocks)
- Accept ZIP archives (bulk import with manifest)
- Validate mermaid syntax on import
- Generate preview SVG on import

**Step 3: Update route registration**

In `importExport/index.ts`:
- Update import path reference

**Step 4: Test import/export round-trip**

Create a diagram → export → delete → import → verify content matches.

**Step 5: Commit**

```bash
git add -A && git commit -m "update import/export for mermaid .mmd format"
```

---

## Task 8: API Client & Dashboard Integration

**Files:**
- Modify: `frontend/src/api/index.ts`
- Modify: `frontend/src/pages/Dashboard.tsx`

**Step 1: Update API client**

In `frontend/src/api/index.ts`:
- Update request/response types: `elements` → `content`, remove `files`
- Update save function to send `content` string
- Keep all other API calls unchanged (collections, auth, sharing)

**Step 2: Update Dashboard**

In `frontend/src/pages/Dashboard.tsx`:
- Update drawing creation: new diagrams start with default mermaid template
- Update search to work with `content` field
- Keep collection management, drag-and-drop, pagination unchanged

**Step 3: Verify full flow**

Create diagram → edit → save → see on dashboard → organize in collection → share.

**Step 4: Commit**

```bash
git add -A && git commit -m "update frontend API client and dashboard for mermaid content model"
```

---

## Task 9: Public REST API

**Files:**
- Create: `backend/src/routes/api/diagrams.ts`
- Create: `backend/src/routes/api/index.ts`
- Modify: `backend/src/index.ts` (mount new routes)

**Step 1: Create API key auth middleware**

Simple API key auth — stored per user in database, passed via `Authorization: Bearer <key>` header. Add `apiKey` field to User model or create a separate `ApiKey` model.

**Step 2: Create diagram API routes**

In `backend/src/routes/api/diagrams.ts`:

```
POST   /api/v1/diagrams          - Create diagram (name, content)
GET    /api/v1/diagrams           - List diagrams (pagination, search)
GET    /api/v1/diagrams/:id       - Get diagram (returns content + metadata)
PUT    /api/v1/diagrams/:id       - Update diagram (content, name)
DELETE /api/v1/diagrams/:id       - Delete diagram
```

Response format:
```json
{
  "id": "uuid",
  "name": "My Diagram",
  "content": "graph TD\n    A --> B",
  "createdAt": "2026-02-25T...",
  "updatedAt": "2026-02-25T..."
}
```

**Step 3: Wire up WebSocket broadcast**

When a diagram is updated via API, broadcast `content-update` to any open editors viewing that diagram. This reuses the existing Socket.IO infrastructure — just emit to the drawing's room.

**Step 4: Mount routes**

In `backend/src/index.ts`:
- Mount `/api/v1` routes

**Step 5: Test with curl**

```bash
# Create
curl -X POST http://localhost:8000/api/v1/diagrams \
  -H "Authorization: Bearer <key>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test", "content": "graph TD\n    A --> B"}'

# Update (with editor open — should see live update)
curl -X PUT http://localhost:8000/api/v1/diagrams/<id> \
  -H "Authorization: Bearer <key>" \
  -H "Content-Type: application/json" \
  -d '{"content": "graph TD\n    A --> B --> C"}'
```

**Step 6: Commit**

```bash
git add -A && git commit -m "add public REST API for diagrams with live push"
```

---

## Task 10: MCP Server

**Files:**
- Create: `mcp-server/package.json`
- Create: `mcp-server/src/index.ts`
- Create: `mcp-server/tsconfig.json`

**Step 1: Scaffold MCP server package**

Separate package in monorepo root. Uses `@modelcontextprotocol/sdk`.

**Step 2: Implement MCP tools**

```typescript
// Tools:
// - create_diagram(name: string, content: string) → { id, name, url }
// - update_diagram(id: string, content: string) → { id, name, url }
// - list_diagrams(search?: string) → { diagrams: [...] }
// - get_diagram(id: string) → { id, name, content }
```

Each tool calls the REST API from Task 9. Config via env vars:
- `MERMAIDDASH_URL` — base URL (e.g. `https://mermaid.interlink.no`)
- `MERMAIDDASH_API_KEY` — API key for auth

**Step 3: Test with Claude Code**

Add MCP server to Claude Code config and test:
- "Lag et sekvensdiagram for brukerregistrering"
- Verify diagram appears in MermaidDash editor in real-time

**Step 4: Commit**

```bash
git add -A && git commit -m "add MCP server for AI-driven diagram creation"
```

---

## Task 11: Docker & Deployment

**Files:**
- Modify: `frontend/Dockerfile`
- Modify: `backend/Dockerfile`
- Modify: `docker-compose.prod.yml`

**Step 1: Update Dockerfiles**

Verify both Dockerfiles build correctly with new dependencies (mermaid, monaco).

**Step 2: Build and test locally**

```bash
docker compose build
docker compose up -d
# Verify http://localhost:6767
```

**Step 3: Deploy to Tower**

```bash
ssh tower "cd /mnt/user/appdata/mermaiddash && docker compose pull && docker compose up -d"
```

**Step 4: Commit**

```bash
git add -A && git commit -m "update Docker config for MermaidDash"
```

---

## Task 12: Cleanup

**Step 1: Remove all remaining Excalidraw references**

```bash
grep -rn "excalidraw\|ExcaliDash\|excali" frontend/src/ backend/src/ --include="*.ts" --include="*.tsx"
```

Update any remaining references.

**Step 2: Update README**

Replace ExcaliDash README with MermaidDash docs.

**Step 3: Final commit**

```bash
git add -A && git commit -m "cleanup remaining excalidraw references, update README"
```

---

## Task Order & Dependencies

```
Task 1 (rebrand/deps) → Task 2 (data model) → Task 3 (backend routes)
                                              → Task 4 (editor) ────────→ Task 6 (websocket sync)
                                              → Task 5 (previews) ──────→ Task 8 (dashboard)
                                                                        → Task 7 (import/export)
                                                                        → Task 9 (REST API) → Task 10 (MCP)
                                                                        → Task 11 (docker)
                                                                        → Task 12 (cleanup)
```

Tasks 3, 4, 5 can run in parallel after Task 2.
Tasks 6, 7, 8 can run in parallel after Tasks 3-5.
Task 9 depends on Task 3 (backend routes).
Task 10 depends on Task 9 (REST API).
Task 11 can run anytime after Task 8.
