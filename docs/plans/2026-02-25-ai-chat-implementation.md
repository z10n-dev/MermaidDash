# AI Chat Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add AI-powered Mermaid diagram assistance via a chat panel in the editor, with per-user OpenAI API key storage.

**Architecture:** Frontend-only AI calls. Backend stores encrypted API keys per user (new Prisma model + CRUD endpoints). Frontend fetches the key and streams directly to OpenAI. Chat panel in editor with auto-apply of generated Mermaid code.

**Tech Stack:** Prisma (SQLite), Express, React, TypeScript, OpenAI Chat Completions API (raw fetch, no SDK)

---

### Task 1: Add UserAiSettings Prisma model

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Step 1: Add the model to schema.prisma**

Add after the `ApiKey` model (line 164):

```prisma
model UserAiSettings {
  id        String   @id @default(uuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider  String   @default("openai")
  apiKey    String
  model     String   @default("gpt-4o")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Add to the `User` model (after `apiKeys` field, line 28):

```prisma
aiSettings      UserAiSettings?
```

**Step 2: Run Prisma migration**

```bash
cd backend && npx prisma migrate dev --name add-user-ai-settings
```

Expected: Migration created and applied successfully.

**Step 3: Commit**

```bash
git add backend/prisma/
git commit -m "Add UserAiSettings Prisma model for per-user AI config"
```

---

### Task 2: Add encryption utilities

**Files:**
- Create: `backend/src/utils/encryption.ts`

**Step 1: Create the encryption module**

```typescript
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

const getEncryptionKey = (): Buffer => {
  const key = process.env.AI_ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error(
      "AI_ENCRYPTION_KEY must be set and at least 32 characters"
    );
  }
  return crypto.createHash("sha256").update(key).digest();
};

export const encrypt = (plaintext: string): string => {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // Format: base64(iv + tag + ciphertext)
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
};

export const decrypt = (encoded: string): string => {
  const key = getEncryptionKey();
  const data = Buffer.from(encoded, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final("utf8");
};
```

**Step 2: Commit**

```bash
git add backend/src/utils/encryption.ts
git commit -m "Add AES-256-GCM encryption utilities for AI API keys"
```

---

### Task 3: Add AI settings backend routes

**Files:**
- Create: `backend/src/routes/dashboard/aiSettings.ts`
- Modify: `backend/src/routes/dashboard/index.ts`
- Modify: `backend/src/routes/dashboard/types.ts`

**Step 1: Create the AI settings route file**

```typescript
import express from "express";
import { z } from "zod";
import { encrypt, decrypt } from "../../utils/encryption";
import type { DashboardRouteDeps } from "./types";

const aiSettingsUpdateSchema = z.object({
  provider: z.enum(["openai"]).default("openai"),
  apiKey: z.string().min(1).max(500),
  model: z.string().min(1).max(100).default("gpt-4o"),
});

export const registerAiSettingsRoutes = (
  app: express.Router,
  deps: DashboardRouteDeps
) => {
  const { prisma, requireAuth, asyncHandler } = deps;

  // GET /ai-settings — return settings without raw key
  app.get(
    "/ai-settings",
    requireAuth,
    asyncHandler(async (req: express.Request, res: express.Response) => {
      const userId = req.user!.id;
      const settings = await prisma.userAiSettings.findUnique({
        where: { userId },
      });

      if (!settings) {
        res.json({ configured: false });
        return;
      }

      res.json({
        configured: true,
        provider: settings.provider,
        model: settings.model,
      });
    })
  );

  // GET /ai-settings/key — return decrypted key (for frontend AI calls)
  app.get(
    "/ai-settings/key",
    requireAuth,
    asyncHandler(async (req: express.Request, res: express.Response) => {
      const userId = req.user!.id;
      const settings = await prisma.userAiSettings.findUnique({
        where: { userId },
      });

      if (!settings) {
        res.status(404).json({ error: "AI not configured" });
        return;
      }

      const apiKey = decrypt(settings.apiKey);
      res.json({
        provider: settings.provider,
        model: settings.model,
        apiKey,
      });
    })
  );

  // PUT /ai-settings — create or update
  app.put(
    "/ai-settings",
    requireAuth,
    asyncHandler(async (req: express.Request, res: express.Response) => {
      const userId = req.user!.id;
      const parsed = aiSettingsUpdateSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid AI settings",
          details: parsed.error.issues,
        });
        return;
      }

      const { provider, apiKey, model } = parsed.data;
      const encryptedKey = encrypt(apiKey);

      await prisma.userAiSettings.upsert({
        where: { userId },
        update: {
          provider,
          apiKey: encryptedKey,
          model,
        },
        create: {
          userId,
          provider,
          apiKey: encryptedKey,
          model,
        },
      });

      res.json({ configured: true, provider, model });
    })
  );

  // DELETE /ai-settings — remove configuration
  app.delete(
    "/ai-settings",
    requireAuth,
    asyncHandler(async (req: express.Request, res: express.Response) => {
      const userId = req.user!.id;

      await prisma.userAiSettings
        .delete({ where: { userId } })
        .catch(() => {
          // Already deleted or doesn't exist
        });

      res.json({ configured: false });
    })
  );
};
```

**Step 2: Register the routes in dashboard/index.ts**

In `backend/src/routes/dashboard/index.ts`, add import and register call:

```typescript
import { registerAiSettingsRoutes } from "./aiSettings";
```

Add inside `registerDashboardRoutes` function body:

```typescript
registerAiSettingsRoutes(app, deps);
```

**Step 3: Add AI_ENCRYPTION_KEY to .env.example**

In `backend/.env.example`, add:

```
# AI feature (encryption key for storing user OpenAI API keys)
# AI_ENCRYPTION_KEY=change-this-to-a-random-32-char-string
```

**Step 4: Commit**

```bash
git add backend/src/routes/dashboard/aiSettings.ts backend/src/routes/dashboard/index.ts backend/.env.example
git commit -m "Add AI settings CRUD endpoints with encrypted API key storage"
```

---

### Task 4: Add frontend API functions for AI settings

**Files:**
- Modify: `frontend/src/api/index.ts`

**Step 1: Add AI settings API functions**

Add at the end of `frontend/src/api/index.ts`:

```typescript
// AI Settings
export interface AiSettings {
  configured: boolean;
  provider?: string;
  model?: string;
}

export interface AiSettingsWithKey extends AiSettings {
  apiKey?: string;
}

export const getAiSettings = async (): Promise<AiSettings> => {
  const response = await api.get<AiSettings>("/ai-settings");
  return response.data;
};

export const getAiSettingsKey = async (): Promise<AiSettingsWithKey> => {
  const response = await api.get<AiSettingsWithKey>("/ai-settings/key");
  return response.data;
};

export const updateAiSettings = async (data: {
  provider: string;
  apiKey: string;
  model: string;
}): Promise<AiSettings> => {
  const response = await api.put<AiSettings>("/ai-settings", data);
  return response.data;
};

export const deleteAiSettings = async (): Promise<void> => {
  await api.delete("/ai-settings");
};
```

**Step 2: Commit**

```bash
git add frontend/src/api/index.ts
git commit -m "Add frontend API functions for AI settings"
```

---

### Task 5: Add AI Configuration section to Profile page

**Files:**
- Modify: `frontend/src/pages/Profile.tsx`

**Step 1: Add AI settings state and handlers**

Add imports at the top:

```typescript
import { Sparkles } from 'lucide-react';
```

Add state variables inside the component (after the API keys state block):

```typescript
// AI Settings state
const [aiProvider, setAiProvider] = useState('openai');
const [aiApiKey, setAiApiKey] = useState('');
const [aiModel, setAiModel] = useState('gpt-4o');
const [aiConfigured, setAiConfigured] = useState(false);
const [aiLoading, setAiLoading] = useState(false);
const [showAiKey, setShowAiKey] = useState(false);
```

Add fetch in the `useEffect` that fetches data (after `api.listApiKeys` call):

```typescript
api.getAiSettings().then((settings) => {
    setAiConfigured(settings.configured);
    if (settings.provider) setAiProvider(settings.provider);
    if (settings.model) setAiModel(settings.model);
}).catch(console.error);
```

Add handlers after the `handleDeleteApiKey` function:

```typescript
const handleSaveAiSettings = async () => {
    if (!aiApiKey.trim()) return;
    setAiLoading(true);
    setError('');
    try {
        const result = await api.updateAiSettings({
            provider: aiProvider,
            apiKey: aiApiKey,
            model: aiModel,
        });
        setAiConfigured(result.configured);
        setAiApiKey('');
        setShowAiKey(false);
        setSuccess('AI settings saved successfully');
    } catch (err) {
        console.error('Failed to save AI settings:', err);
        setError('Failed to save AI settings');
    } finally {
        setAiLoading(false);
    }
};

const handleDeleteAiSettings = async () => {
    setAiLoading(true);
    try {
        await api.deleteAiSettings();
        setAiConfigured(false);
        setAiApiKey('');
        setAiModel('gpt-4o');
        setAiProvider('openai');
        setSuccess('AI settings removed');
    } catch (err) {
        console.error('Failed to delete AI settings:', err);
        setError('Failed to remove AI settings');
    } finally {
        setAiLoading(false);
    }
};
```

**Step 2: Add the AI Configuration UI section**

Add a new card section in the JSX, between the API Keys section and the MCP Server section (after the closing `</div>` of the API Keys card, before the MCP Server card):

```tsx
{/* AI Configuration */}
<div className="bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-6">
    <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-amber-50 dark:bg-neutral-800 rounded-xl flex items-center justify-center border-2 border-amber-100 dark:border-neutral-700">
            <Sparkles size={24} className="text-amber-600 dark:text-amber-400" />
        </div>
        <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">AI Configuration</h2>
            <p className="text-sm text-slate-500 dark:text-neutral-400">
                {aiConfigured ? 'AI is configured and ready to use' : 'Configure an AI provider to use AI features in the editor'}
            </p>
        </div>
    </div>

    <div className="space-y-4">
        <div>
            <label htmlFor="aiProvider" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
                Provider
            </label>
            <select
                id="aiProvider"
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value)}
                className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent font-medium"
            >
                <option value="openai">OpenAI</option>
            </select>
        </div>

        <div>
            <label htmlFor="aiApiKey" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
                API Key {aiConfigured && <span className="text-green-600 dark:text-green-400 font-normal">(saved — enter new key to update)</span>}
            </label>
            <div className="flex gap-2">
                <input
                    id="aiApiKey"
                    type={showAiKey ? 'text' : 'password'}
                    value={aiApiKey}
                    onChange={(e) => setAiApiKey(e.target.value)}
                    className="flex-1 px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-accent font-medium font-mono"
                    placeholder={aiConfigured ? '••••••••••••••••' : 'sk-...'}
                />
                <button
                    onClick={() => setShowAiKey(!showAiKey)}
                    className="p-3 rounded-xl border-2 border-black dark:border-neutral-700 hover:bg-slate-50 dark:hover:bg-neutral-800 text-slate-500 dark:text-neutral-400"
                    title={showAiKey ? 'Hide' : 'Show'}
                >
                    {showAiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            </div>
        </div>

        <div>
            <label htmlFor="aiModel" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
                Model
            </label>
            <select
                id="aiModel"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent font-medium"
            >
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4o-mini">GPT-4o Mini</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
            </select>
        </div>

        <div className="flex gap-3 pt-2">
            <button
                onClick={handleSaveAiSettings}
                disabled={aiLoading || !aiApiKey.trim()}
                className="flex-1 px-6 py-3 bg-accent text-white font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {aiLoading ? 'Saving...' : 'Save AI Settings'}
            </button>
            {aiConfigured && (
                <button
                    onClick={handleDeleteAiSettings}
                    disabled={aiLoading}
                    className="px-6 py-3 bg-white dark:bg-neutral-800 text-red-600 dark:text-red-400 font-bold rounded-xl border-2 border-red-300 dark:border-red-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    <Trash2 size={18} />
                    Remove
                </button>
            )}
        </div>
    </div>
</div>
```

**Step 3: Commit**

```bash
git add frontend/src/pages/Profile.tsx
git commit -m "Add AI Configuration section to Profile page"
```

---

### Task 6: Create frontend AI provider abstraction

**Files:**
- Create: `frontend/src/services/ai/types.ts`
- Create: `frontend/src/services/ai/openai.ts`
- Create: `frontend/src/services/ai/provider.ts`

**Step 1: Create types.ts**

```typescript
export interface AiMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AiProvider {
  chat(
    messages: AiMessage[],
    diagramContent: string,
    apiKey: string,
    model: string
  ): AsyncGenerator<string>;
}
```

**Step 2: Create openai.ts**

```typescript
import type { AiProvider, AiMessage } from "./types";

const SYSTEM_PROMPT = `You are a Mermaid diagram expert assistant. You help users create, modify, and improve Mermaid diagrams.

Rules:
- When generating or modifying a diagram, ALWAYS return the complete Mermaid code inside a single fenced code block with the \`mermaid\` language tag.
- The code must be valid Mermaid syntax.
- If the user asks a question about their diagram without requesting changes, answer conversationally without a code block.
- When modifying an existing diagram, include the FULL updated diagram, not just the changed parts.
- Be concise in your explanations.`;

export const openaiProvider: AiProvider = {
  async *chat(
    messages: AiMessage[],
    diagramContent: string,
    apiKey: string,
    model: string
  ): AsyncGenerator<string> {
    const systemMessage: AiMessage = {
      role: "system",
      content: SYSTEM_PROMPT + (diagramContent
        ? `\n\nThe user's current diagram:\n\`\`\`mermaid\n${diagramContent}\n\`\`\``
        : ""),
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [systemMessage, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // Skip malformed SSE chunks
        }
      }
    }
  },
};
```

**Step 3: Create provider.ts**

```typescript
import type { AiProvider } from "./types";
import { openaiProvider } from "./openai";

const providers: Record<string, AiProvider> = {
  openai: openaiProvider,
};

export const getProvider = (providerName: string): AiProvider => {
  const provider = providers[providerName];
  if (!provider) {
    throw new Error(`Unknown AI provider: ${providerName}`);
  }
  return provider;
};

export type { AiMessage, AiProvider } from "./types";
```

**Step 4: Commit**

```bash
git add frontend/src/services/ai/
git commit -m "Add AI provider abstraction with OpenAI streaming implementation"
```

---

### Task 7: Create the AiChatPanel component

**Files:**
- Create: `frontend/src/pages/editor/AiChatPanel.tsx`

**Step 1: Create the chat panel component**

This is a right-side panel with:
- Message list (user + assistant messages)
- Input field at the bottom
- Streaming response display
- Auto-apply of mermaid code blocks

```typescript
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { getProvider } from '../../services/ai/provider';
import type { AiMessage } from '../../services/ai/types';
import * as api from '../../api';

type AiChatPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  diagramContent: string;
  onApplyDiagram: (content: string) => void;
};

const extractMermaidCode = (text: string): string | null => {
  const match = text.match(/```mermaid\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
};

export const AiChatPanel: React.FC<AiChatPanelProps> = ({
  isOpen,
  onClose,
  diagramContent,
  onApplyDiagram,
}) => {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiConfig, setAiConfig] = useState<{
    apiKey: string;
    provider: string;
    model: string;
  } | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load AI config on mount
  useEffect(() => {
    if (!isOpen) return;
    setConfigLoading(true);
    api.getAiSettingsKey()
      .then((config) => {
        if (config.apiKey) {
          setAiConfig({
            apiKey: config.apiKey,
            provider: config.provider || 'openai',
            model: config.model || 'gpt-4o',
          });
        } else {
          setAiConfig(null);
        }
      })
      .catch(() => setAiConfig(null))
      .finally(() => setConfigLoading(false));
  }, [isOpen]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !configLoading && aiConfig) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, configLoading, aiConfig]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !aiConfig || isStreaming) return;

    const userMessage: AiMessage = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setError(null);
    setIsStreaming(true);

    try {
      const provider = getProvider(aiConfig.provider);
      let assistantContent = '';

      setMessages([...newMessages, { role: 'assistant', content: '' }]);

      for await (const chunk of provider.chat(
        newMessages,
        diagramContent,
        aiConfig.apiKey,
        aiConfig.model,
      )) {
        assistantContent += chunk;
        setMessages([
          ...newMessages,
          { role: 'assistant', content: assistantContent },
        ]);
      }

      // Auto-apply mermaid code if present
      const mermaidCode = extractMermaidCode(assistantContent);
      if (mermaidCode) {
        onApplyDiagram(mermaidCode);
      }
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to get AI response';
      setError(errorMsg);
    } finally {
      setIsStreaming(false);
    }
  }, [input, aiConfig, isStreaming, messages, diagramContent, onApplyDiagram]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute top-0 right-0 z-30 h-full w-[380px] flex flex-col bg-white dark:bg-neutral-900 border-l border-border shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-amber-500" />
          <span className="text-sm font-semibold text-foreground">AI Assistant</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      {configLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      ) : !aiConfig ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <AlertCircle size={32} className="mx-auto mb-3 text-amber-500" />
            <p className="text-sm font-medium text-foreground mb-2">AI not configured</p>
            <p className="text-xs text-muted-foreground mb-4">
              Add your OpenAI API key in your Profile to use AI features.
            </p>
            <a
              href="/profile"
              className="inline-block px-4 py-2 bg-accent text-white text-sm font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 transition-all"
            >
              Go to Profile
            </a>
          </div>
        </div>
      ) : (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground text-sm mt-8">
                <Sparkles size={24} className="mx-auto mb-2 text-amber-400" />
                <p className="font-medium">How can I help with your diagram?</p>
                <p className="text-xs mt-1">I can generate, modify, or explain Mermaid diagrams.</p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-accent text-white rounded-br-md'
                      : 'bg-muted text-foreground rounded-bl-md'
                  }`}
                >
                  {msg.content || (isStreaming && i === messages.length - 1 ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : null)}
                </div>
              </div>
            ))}

            {error && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border shrink-0">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your diagram..."
                rows={1}
                className="flex-1 px-3 py-2.5 bg-muted rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                style={{ minHeight: '40px', maxHeight: '120px' }}
              />
              <button
                onClick={handleSend}
                disabled={isStreaming || !input.trim()}
                className="p-2.5 rounded-xl bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                {isStreaming ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Send size={18} />
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
```

**Step 2: Commit**

```bash
git add frontend/src/pages/editor/AiChatPanel.tsx
git commit -m "Add AiChatPanel component with streaming chat and auto-apply"
```

---

### Task 8: Add "Use AI" button to toolbar and integrate chat panel in Editor

**Files:**
- Modify: `frontend/src/pages/editor/TopToolbar.tsx`
- Modify: `frontend/src/pages/Editor.tsx`

**Step 1: Add AI toggle button to TopToolbar**

Add `Sparkles` to the lucide import in `TopToolbar.tsx`:

```typescript
import {
  Hand, Palette,
  Shapes, Box, ImagePlus, Type, Frame,
  ChevronDown, Network, Sparkles,
} from 'lucide-react';
```

Add new props to `TopToolbarProps`:

```typescript
type TopToolbarProps = {
  // ... existing props
  onToggleAi: () => void;
  aiOpen: boolean;
};
```

Update the component destructuring to include `onToggleAi` and `aiOpen`.

Add a new tool group at the end (before the closing `</div>` of the main container), after the sidebar/hierarchy group:

```tsx
{/* AI */}
{group(<>
  <button
    title="AI Assistant"
    onClick={onToggleAi}
    className={`p-2.5 rounded-xl transition-all ${
      aiOpen
        ? 'bg-amber-500 text-white shadow-sm'
        : 'text-foreground hover:bg-muted'
    }`}
  >
    <Sparkles size={20} />
  </button>
</>)}
```

**Step 2: Integrate AiChatPanel in Editor.tsx**

Add imports:

```typescript
import { AiChatPanel } from './editor/AiChatPanel';
```

Add state:

```typescript
const [aiChatOpen, setAiChatOpen] = useState(false);
```

Pass new props to TopToolbar:

```typescript
onToggleAi={() => setAiChatOpen(prev => !prev)}
aiOpen={aiChatOpen}
```

Add the AiChatPanel in the JSX, inside the `<div className="flex-1 relative overflow-hidden">`, after the DiagramSidebar:

```tsx
{/* AI Chat Panel */}
<AiChatPanel
  isOpen={aiChatOpen}
  onClose={() => setAiChatOpen(false)}
  diagramContent={content}
  onApplyDiagram={handleContentChangeImmediate}
/>
```

**Step 3: Commit**

```bash
git add frontend/src/pages/editor/TopToolbar.tsx frontend/src/pages/Editor.tsx
git commit -m "Integrate AI chat panel in editor with toolbar toggle"
```

---

### Task 9: End-to-end verification

**Step 1: Start backend and verify AI settings endpoints**

```bash
cd backend && AI_ENCRYPTION_KEY=test-key-for-local-dev-min-32-chars npm run dev
```

Verify endpoints work:
- `GET /api/ai-settings` returns `{ configured: false }`
- `PUT /api/ai-settings` with body saves settings
- `GET /api/ai-settings/key` returns decrypted key
- `DELETE /api/ai-settings` removes settings

**Step 2: Start frontend and verify**

```bash
cd frontend && npm run dev
```

Verify:
- Profile page shows AI Configuration section
- Can save/delete AI settings
- Editor shows Sparkles button in toolbar
- Clicking opens chat panel
- Without config, shows "Go to Profile" prompt
- With config, can type messages and get streaming responses
- Mermaid code in responses auto-applies to editor
- Undo/redo works after auto-apply

**Step 3: Type check both projects**

```bash
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```

Fix any type errors.

**Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "Fix type errors and polish AI chat integration"
```
