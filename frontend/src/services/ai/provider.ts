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
