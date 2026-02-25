# MermaidDash

A self-hosted mermaid diagram editor with a dashboard for organizing, searching, and collaborating on diagrams. Built with a split-view editor (Monaco + live Mermaid preview), persistent storage, and real-time collaboration.

## Features

- **Mermaid diagram editor** with Monaco code editor and live SVG preview (split-view)
- **Persistent storage** with SQLite database
- **Collections** to organize diagrams with drag-and-drop
- **Search** across all diagrams
- **Real-time collaboration** via WebSocket
- **Multi-user authentication** with local login and OIDC support
- **Export/import** backups organized by collections
- **Public REST API** for programmatic diagram management
- **MCP server** for AI-driven diagram creation and editing
- **Dark mode** support

## Quick Start (Docker)

Prerequisites: Docker + Docker Compose v2.

```bash
# Download docker-compose.prod.yml
curl -OL https://raw.githubusercontent.com/langtind/MermaidDash/main/docker-compose.prod.yml

# Pull images and start
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# Access the frontend at http://localhost:6767
```

## MCP Server

MermaidDash includes an MCP (Model Context Protocol) server that allows AI assistants to create and manage diagrams.

### Setup

Add to your MCP client configuration (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "mermaiddash": {
      "command": "npx",
      "args": ["-y", "mermaiddash-mcp"],
      "env": {
        "MERMAIDDASH_URL": "http://localhost:6767",
        "MERMAIDDASH_API_KEY": "your-api-key"
      }
    }
  }
}
```

Generate an API key from the MermaidDash settings page or via the REST API.

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `list_diagrams` | List all diagrams with optional search filter |
| `get_diagram` | Get diagram details including Mermaid source |
| `create_diagram` | Create a new diagram |
| `update_diagram` | Update an existing diagram's content or name |
| `delete_diagram` | Delete a diagram |
| `move_diagram` | Move a diagram to a collection (or remove from collection) |
| `list_collections` | List all collections |
| `create_collection` | Create a new collection |
| `delete_collection` | Delete a collection (diagrams are kept) |

## REST API

MermaidDash exposes a public REST API for diagram management. Authenticate with an API key passed via the `Authorization: Bearer <key>` header.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/diagrams` | List diagrams |
| `POST` | `/api/v1/diagrams` | Create a diagram |
| `GET` | `/api/v1/diagrams/:id` | Get a diagram |
| `PUT` | `/api/v1/diagrams/:id` | Update a diagram |
| `DELETE` | `/api/v1/diagrams/:id` | Delete a diagram |
| `GET` | `/api/v1/collections` | List collections |

## Configuration

Key backend environment variables (see `backend/.env.example` for full list):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `file:/app/prisma/dev.db` | SQLite database path |
| `FRONTEND_URL` | `http://localhost:6767` | Allowed frontend origin(s) |
| `TRUST_PROXY` | `false` | Set to hop count when behind a reverse proxy |
| `JWT_SECRET` | auto-generated | Set explicitly for production |
| `AUTH_MODE` | `local` | `local`, `hybrid`, or `oidc_enforced` |

## Development

```bash
# Clone and start frontend
cd frontend && npm install && cp .env.example .env && npm run dev

# In another terminal, start backend
cd backend && npm install && cp .env.example .env
npx prisma generate && npx prisma db push && npm run dev
```

## Upgrading

```bash
docker compose -f docker-compose.prod.yml pull && \
  docker compose -f docker-compose.prod.yml up -d
```

MermaidDash includes an in-app update notifier. To disable outbound update checks:

```bash
UPDATE_CHECK_OUTBOUND=false
```

## Credits

MermaidDash is a fork of [ExcaliDash](https://github.com/ZimengXiong/ExcaliDash) by Zimeng Xiong, adapted for Mermaid diagrams.
