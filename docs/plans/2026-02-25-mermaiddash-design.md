# MermaidDash Design

Fork of ExcaliDash where Excalidraw is replaced with a Mermaid diagram editor. Split-view (text + live preview). Open API with MCP server for AI integration.

## Architecture

```
Claude Code → MCP Server → MermaidDash API → WebSocket → Browser (live)
                           ↑
Browser (manual edit) ─────┘
```

## Reused from ExcaliDash (no changes)

- Backend framework (Express, Prisma, SQLite)
- Auth system (local/OIDC, JWT, roles)
- Collections and organization
- WebSocket infrastructure (Socket.IO)
- Sharing/permissions (link shares, passphrases)
- Dashboard layout and navigation
- User management

## Replaced

| Component | Current (ExcaliDash) | New (MermaidDash) |
|-----------|---------------------|-------------------|
| Editor | `<Excalidraw />` component | Monaco editor + mermaid.js live preview (split-view) |
| Preview/thumbnails | `exportToSvg()` from Excalidraw SDK | mermaid.js rendering to SVG |
| Import/export | `.excalidraw` archive format | `.mmd` plain text files |
| Sync logic | Element-based (Excalidraw objects) | Text-based (simpler) |
| Branding/UI | ExcaliDash name, colors, icons | MermaidDash branding |

## New features

### REST API

Public API endpoints for external access to diagrams:

- `POST /api/diagrams` — create new diagram
- `GET /api/diagrams` — list diagrams
- `GET /api/diagrams/:id` — get diagram content
- `PUT /api/diagrams/:id` — update diagram content
- `DELETE /api/diagrams/:id` — delete diagram

Auth via API key or JWT token.

### MCP Server

Thin wrapper (~100 lines) around the REST API exposing tools:

- `create_diagram(name, content)` — create new mermaid diagram
- `update_diagram(id, content)` — update existing diagram
- `list_diagrams()` — list all diagrams
- `get_diagram(id)` — get diagram content

### Live push

When a diagram is created or updated via API, the change is broadcast via the existing WebSocket infrastructure to any open editor viewing that diagram. Same mechanism as ExcaliDash collaboration.

## Data model

Minimal changes to Prisma schema. The `elements` field stores mermaid syntax as a plain string instead of a JSON array. `appState` stores editor config (theme, zoom, panel sizes). `preview` stores rendered SVG for dashboard thumbnails.

## Mermaid updates

mermaid.js is a standard npm dependency. Updating is `npm update mermaid`. The render API (`mermaid.render()`) has been stable for years.

## Editor UX

Split-view layout:
- Left panel: Monaco editor with mermaid syntax highlighting
- Right panel: Live mermaid.js preview, re-rendered on each change (debounced)
- Toolbar: diagram type selector, theme toggle, export options

## Key decisions

- **No backward compatibility with ExcaliDash** — clean fork, separate project
- **Text-based storage** — simpler than Excalidraw's element-based model
- **API-first** — external access is a first-class feature, not an afterthought
- **MCP as thin wrapper** — no business logic in MCP server, just API calls
