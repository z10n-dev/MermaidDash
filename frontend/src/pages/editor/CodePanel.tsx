import React, { useState, useRef, useCallback } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { Code2, X, BookOpen } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

type CodePanelProps = {
  content: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  autoUpdate: boolean;
  onAutoUpdateChange: (enabled: boolean) => void;
};

const MIN_WIDTH = 320;
const MAX_WIDTH = 700;
const DEFAULT_WIDTH = 420;
const MIN_HEIGHT = 200;

export const CodePanel: React.FC<CodePanelProps> = ({
  content,
  onChange,
  readOnly,
  isOpen,
  onClose,
  onOpen,
  autoUpdate,
  onAutoUpdateChange,
}) => {
  const { theme } = useTheme();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [height, setHeight] = useState<number | null>(null);
  const isDraggingX = useRef(false);
  const isDraggingY = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleResizeXStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingX.current = true;
    const startX = e.clientX;
    const startWidth = width;

    const onMove = (e: MouseEvent) => {
      if (!isDraggingX.current) return;
      const delta = e.clientX - startX;
      setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta)));
    };
    const onUp = () => {
      isDraggingX.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [width]);

  const handleResizeYStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingY.current = true;
    const startY = e.clientY;
    const startHeight = height ?? panelRef.current?.offsetHeight ?? 400;

    const onMove = (e: MouseEvent) => {
      if (!isDraggingY.current) return;
      const delta = e.clientY - startY;
      const maxH = window.innerHeight - 160;
      setHeight(Math.max(MIN_HEIGHT, Math.min(maxH, startHeight + delta)));
    };
    const onUp = () => {
      isDraggingY.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [height]);

  if (!isOpen) {
    return (
      <button
        onClick={onOpen}
        className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-border shadow-lg hover:shadow-xl transition-all text-sm font-medium text-foreground"
      >
        <Code2 size={16} />
        Code
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      data-code-panel
      className="absolute top-4 left-4 z-30 flex flex-col rounded-2xl bg-white dark:bg-neutral-900 border border-border shadow-xl overflow-hidden"
      style={{
        width,
        height: height ?? 'calc(100% - 80px)',
        maxHeight: 'calc(100% - 80px)',
      }}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Code2 size={16} className="text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Code</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onAutoUpdateChange(!autoUpdate)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              autoUpdate ? 'bg-accent' : 'bg-gray-300 dark:bg-neutral-600'
            }`}
            title="Auto-Update preview"
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                autoUpdate ? 'translate-x-[18px]' : 'translate-x-[3px]'
              }`}
            />
          </button>
          <span className="text-xs text-muted-foreground mr-1">Auto-Update</span>

          <button
            className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors"
            title="Mermaid Docs"
            onClick={() => window.open('https://mermaid.js.org/syntax/flowchart.html', '_blank')}
          >
            <BookOpen size={14} />
          </button>

          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Monaco editor */}
      <div className="flex-1 overflow-hidden min-h-0">
        <MonacoEditor
          height="100%"
          language="markdown"
          theme={theme === 'dark' ? 'vs-dark' : 'light'}
          value={content}
          onChange={(value) => onChange(value ?? '')}
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            padding: { top: 8, bottom: 8 },
            lineNumbersMinChars: 3,
            folding: true,
            renderLineHighlight: 'gutter',
            scrollbar: {
              vertical: 'auto',
              horizontal: 'hidden',
              verticalScrollbarSize: 8,
            },
            overviewRulerBorder: false,
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
          }}
        />
      </div>

      {/* Right resize handle */}
      <div
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-accent/30 transition-colors"
        onMouseDown={handleResizeXStart}
      />

      {/* Bottom resize handle */}
      <div
        className="absolute bottom-0 left-0 w-full h-1.5 cursor-row-resize hover:bg-accent/30 transition-colors"
        onMouseDown={handleResizeYStart}
      />
    </div>
  );
};
