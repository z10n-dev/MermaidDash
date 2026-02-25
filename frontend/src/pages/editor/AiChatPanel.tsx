import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Loader2, Sparkles, AlertCircle, Undo2, ChevronDown, ChevronRight, Check } from 'lucide-react';
import { getProvider } from '../../services/ai/provider';
import type { AiMessage } from '../../services/ai/types';
import * as api from '../../api';

type AiChatPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  diagramContent: string;
  onApplyDiagram: (content: string) => void;
};

type ChatMessage = AiMessage & {
  /** Snapshot of diagram content before this AI response was applied */
  snapshotBefore?: string;
  /** The mermaid code that was applied */
  appliedCode?: string;
  /** Whether this change has been reverted */
  reverted?: boolean;
};

const extractMermaidCode = (text: string): string | null => {
  const match = text.match(/```mermaid\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
};

/** Remove mermaid code block from text, return the "explanation" part */
const getExplanation = (text: string): string => {
  return text
    .replace(/```mermaid\n[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/** Summarize what changed between old and new mermaid code */
const summarizeChanges = (oldCode: string, newCode: string): string => {
  const oldLines = new Set(oldCode.split('\n').map(l => l.trim()).filter(Boolean));
  const newLines = newCode.split('\n').map(l => l.trim()).filter(Boolean);
  const added = newLines.filter(l => !oldLines.has(l)).length;
  const removed = [...oldLines].filter(l => !newLines.includes(l)).length;

  const parts: string[] = [];
  if (added > 0) parts.push(`${added} line${added > 1 ? 's' : ''} added`);
  if (removed > 0) parts.push(`${removed} line${removed > 1 ? 's' : ''} removed`);
  if (parts.length === 0) return 'Code reformatted';
  return parts.join(', ');
};

export const AiChatPanel: React.FC<AiChatPanelProps> = ({
  isOpen,
  onClose,
  diagramContent,
  onApplyDiagram,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDiffs, setExpandedDiffs] = useState<Set<number>>(new Set());
  const [aiConfig, setAiConfig] = useState<{
    apiKey: string;
    provider: string;
    model: string;
  } | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const diagramContentRef = useRef(diagramContent);

  useEffect(() => {
    diagramContentRef.current = diagramContent;
  }, [diagramContent]);

  // Load AI config on open
  useEffect(() => {
    if (!isOpen) return;
    setConfigLoading(true);
    api.getAiSettingsKey()
      .then((config) => {
        if (config.apiKey) {
          setAiConfig({
            apiKey: config.apiKey,
            provider: config.provider || 'openai',
            model: config.model || 'gpt-5-mini',
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

  const toggleDiff = (index: number) => {
    setExpandedDiffs(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleRevert = useCallback((index: number) => {
    const msg = messages[index];
    if (!msg.snapshotBefore) return;
    onApplyDiagram(msg.snapshotBefore);
    setMessages(prev => prev.map((m, i) =>
      i === index ? { ...m, reverted: true } : m
    ));
  }, [messages, onApplyDiagram]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !aiConfig || isStreaming) return;

    const userMessage: ChatMessage = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setError(null);
    setIsStreaming(true);

    // Capture current diagram state before AI changes it
    const snapshotBefore = diagramContentRef.current;

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
        // Store snapshot info on the assistant message
        setMessages([
          ...newMessages,
          {
            role: 'assistant',
            content: assistantContent,
            snapshotBefore,
            appliedCode: mermaidCode,
          },
        ]);
      } else {
        setMessages([
          ...newMessages,
          { role: 'assistant', content: assistantContent },
        ]);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get AI response';
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

  const renderAssistantMessage = (msg: ChatMessage, index: number) => {
    const explanation = getExplanation(msg.content);
    const hasDiagramChange = !!msg.appliedCode;
    const isExpanded = expandedDiffs.has(index);

    return (
      <div className="max-w-[90%] space-y-2">
        {/* Explanation text */}
        {explanation && (
          <div className="rounded-2xl rounded-bl-md px-4 py-2.5 text-sm whitespace-pre-wrap bg-muted text-foreground">
            {explanation}
          </div>
        )}

        {/* Diagram update card */}
        {hasDiagramChange && !isStreaming && (
          <div className={`rounded-xl border text-xs ${
            msg.reverted
              ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20'
              : 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20'
          }`}>
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-1.5">
                {msg.reverted ? (
                  <Undo2 size={13} className="text-amber-600 dark:text-amber-400" />
                ) : (
                  <Check size={13} className="text-emerald-600 dark:text-emerald-400" />
                )}
                <span className={msg.reverted
                  ? 'font-medium text-amber-700 dark:text-amber-300'
                  : 'font-medium text-emerald-700 dark:text-emerald-300'
                }>
                  {msg.reverted ? 'Reverted' : 'Diagram updated'}
                </span>
                {msg.snapshotBefore && !msg.reverted && (
                  <span className="text-muted-foreground ml-1">
                    ({summarizeChanges(msg.snapshotBefore, msg.appliedCode!)})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {!msg.reverted && msg.snapshotBefore && (
                  <button
                    onClick={() => handleRevert(index)}
                    title="Revert to before this change"
                    className="px-2 py-1 rounded-lg hover:bg-white/60 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Undo2 size={13} />
                  </button>
                )}
                <button
                  onClick={() => toggleDiff(index)}
                  title="Show code"
                  className="px-2 py-1 rounded-lg hover:bg-white/60 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-inherit px-3 py-2">
                <pre className="text-[11px] leading-relaxed text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
                  {msg.appliedCode}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Loading state for streaming without content yet */}
        {!explanation && !hasDiagramChange && isStreaming && index === messages.length - 1 && (
          <div className="rounded-2xl rounded-bl-md px-4 py-2.5 bg-muted text-foreground">
            <Loader2 size={14} className="animate-spin" />
          </div>
        )}
      </div>
    );
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
                {msg.role === 'user' ? (
                  <div className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm whitespace-pre-wrap bg-accent text-white">
                    {msg.content}
                  </div>
                ) : (
                  renderAssistantMessage(msg, i)
                )}
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
