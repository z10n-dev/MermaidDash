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
