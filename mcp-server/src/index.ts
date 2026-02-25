#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const MERMAIDDASH_URL =
  process.env.MERMAIDDASH_URL || "http://localhost:6767";
const API_KEY = process.env.MERMAIDDASH_API_KEY || "";

const server = new McpServer({
  name: "mermaiddash",
  version: "0.1.0",
});

async function apiCall(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const url = `${MERMAIDDASH_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error: ${res.status} ${text}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

// ── create_diagram ──────────────────────────────────────────────────────────
server.tool(
  "create_diagram",
  "Create a new Mermaid diagram in MermaidDash",
  {
    name: z.string().describe("Name of the diagram"),
    content: z
      .string()
      .optional()
      .describe("Mermaid diagram content (defaults to a simple starter graph)"),
  },
  async ({ name, content }) => {
    const result = await apiCall("POST", "/api/v1/diagrams", {
      name,
      ...(content !== undefined ? { content } : {}),
    });
    const payload = {
      id: result.id,
      name: result.name,
      url: `${MERMAIDDASH_URL}/editor/${result.id}`,
    };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    };
  }
);

// ── update_diagram ──────────────────────────────────────────────────────────
server.tool(
  "update_diagram",
  "Update the content of an existing Mermaid diagram",
  {
    id: z.string().describe("ID of the diagram to update"),
    content: z.string().describe("New Mermaid diagram content"),
  },
  async ({ id, content }) => {
    const result = await apiCall("PUT", `/api/v1/diagrams/${id}`, { content });
    const payload = {
      id: result.id,
      name: result.name,
      url: `${MERMAIDDASH_URL}/editor/${result.id}`,
    };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    };
  }
);

// ── get_diagram ─────────────────────────────────────────────────────────────
server.tool(
  "get_diagram",
  "Retrieve a Mermaid diagram by ID, including its content",
  {
    id: z.string().describe("ID of the diagram to retrieve"),
  },
  async ({ id }) => {
    const result = await apiCall("GET", `/api/v1/diagrams/${id}`);
    const payload = {
      id: result.id,
      name: result.name,
      content: result.content,
    };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    };
  }
);

// ── list_diagrams ───────────────────────────────────────────────────────────
server.tool(
  "list_diagrams",
  "List Mermaid diagrams, optionally filtered by a search term",
  {
    search: z.string().optional().describe("Search term to filter diagrams by name"),
    limit: z
      .number()
      .int()
      .positive()
      .max(100)
      .optional()
      .default(20)
      .describe("Maximum number of diagrams to return (default 20, max 100)"),
  },
  async ({ search, limit }) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    params.set("limit", String(limit));

    const result = await apiCall("GET", `/api/v1/diagrams?${params.toString()}`);
    const diagrams = result.diagrams as Array<Record<string, unknown>>;
    const payload = {
      diagrams: diagrams.map((d) => ({
        id: d.id,
        name: d.name,
        updatedAt: d.updatedAt,
      })),
      total: result.total,
    };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    };
  }
);

// ── delete_diagram ──────────────────────────────────────────────────────────
server.tool(
  "delete_diagram",
  "Delete a Mermaid diagram by ID",
  {
    id: z.string().describe("ID of the diagram to delete"),
  },
  async ({ id }) => {
    await apiCall("DELETE", `/api/v1/diagrams/${id}`);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ deleted: true, id }, null, 2) }],
    };
  }
);

// ── list_collections ────────────────────────────────────────────────────────
server.tool(
  "list_collections",
  "List all collections (folders) for organizing diagrams",
  {},
  async () => {
    const result = await apiCall("GET", "/api/v1/collections");
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── create_collection ───────────────────────────────────────────────────────
server.tool(
  "create_collection",
  "Create a new collection to organize diagrams",
  {
    name: z.string().describe("Name of the collection"),
  },
  async ({ name }) => {
    const result = await apiCall("POST", "/api/v1/collections", { name });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── delete_collection ───────────────────────────────────────────────────────
server.tool(
  "delete_collection",
  "Delete a collection. Diagrams in it are moved to unorganized, not deleted.",
  {
    id: z.string().describe("ID of the collection to delete"),
  },
  async ({ id }) => {
    await apiCall("DELETE", `/api/v1/collections/${id}`);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ deleted: true, id }, null, 2) }],
    };
  }
);

// ── move_diagram ────────────────────────────────────────────────────────────
server.tool(
  "move_diagram",
  "Move a diagram to a collection, or set collectionId to null to make it unorganized",
  {
    id: z.string().describe("ID of the diagram to move"),
    collectionId: z
      .string()
      .nullable()
      .describe("Target collection ID, or null to remove from any collection"),
  },
  async ({ id, collectionId }) => {
    const result = await apiCall("PUT", `/api/v1/diagrams/${id}`, { collectionId });
    const payload = {
      id: result.id,
      name: result.name,
      collectionId: collectionId,
      url: `${MERMAIDDASH_URL}/editor/${result.id}`,
    };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    };
  }
);

// ── Start ───────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
