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
