# Visual Editor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the basic split-pane editor with a full MermaidChart.com-style visual editor — floating code panel, interactive canvas, node selection, shape/color pickers, toolbar, and bottom bar.

**Architecture:** Mermaid renders SVG into a pannable/zoomable canvas. Floating React components overlay the canvas for code editing, toolbars, and pickers. Node interactions parse SVG element IDs and modify Mermaid source code. All state flows through Mermaid code as single source of truth.

**Tech Stack:** React 18, TypeScript, Mermaid 11, Monaco Editor, panzoom, Tailwind CSS, Lucide icons.

**Design:** Reference screenshots from MermaidChart.com in `docs/plans/2026-02-25-visual-editor-design.md`. The UI must look polished and professional — subtle shadows, glass-morphism on panels, refined spacing, smooth transitions. No generic/template aesthetics.

**Existing code:** The current editor is a monolithic `frontend/src/pages/Editor.tsx` (676 lines) with a 50/50 split pane (Monaco left, SVG right). It has save, socket, presence, and share logic that must be preserved.

---

## Phase 1: Foundation (Canvas + Code Panel)

### Task 1: Install panzoom dependency

**Files:**
- Modify: `frontend/package.json`

**Step 1: Install panzoom**

Run: `cd /Users/arild/temp/ExcaliDash/frontend && npm install panzoom`

**Step 2: Verify installation**

Run: `cd /Users/arild/temp/ExcaliDash/frontend && node -e "require('panzoom'); console.log('OK')"`

**Step 3: Commit**

```bash
cd /Users/arild/temp/ExcaliDash
git add frontend/package.json frontend/package-lock.json
git commit -m "Add panzoom dependency for canvas pan/zoom"
```

---

### Task 2: Create useUndoRedo hook

**Files:**
- Create: `frontend/src/pages/editor/useUndoRedo.ts`
- Create: `frontend/src/pages/editor/useUndoRedo.test.ts`

**Step 1: Write the test**

```typescript
// frontend/src/pages/editor/useUndoRedo.test.ts
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useUndoRedo } from './useUndoRedo';

describe('useUndoRedo', () => {
  it('initializes with given content', () => {
    const { result } = renderHook(() => useUndoRedo('initial'));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('tracks changes and allows undo', () => {
    const { result } = renderHook(() => useUndoRedo('v1'));
    act(() => result.current.pushState('v2'));
    act(() => result.current.pushState('v3'));
    expect(result.current.canUndo).toBe(true);

    let undone: string | undefined;
    act(() => { undone = result.current.undo(); });
    expect(undone).toBe('v2');
    act(() => { undone = result.current.undo(); });
    expect(undone).toBe('v1');
    expect(result.current.canUndo).toBe(false);
  });

  it('allows redo after undo', () => {
    const { result } = renderHook(() => useUndoRedo('v1'));
    act(() => result.current.pushState('v2'));
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);

    let redone: string | undefined;
    act(() => { redone = result.current.redo(); });
    expect(redone).toBe('v2');
  });

  it('clears redo stack on new push', () => {
    const { result } = renderHook(() => useUndoRedo('v1'));
    act(() => result.current.pushState('v2'));
    act(() => result.current.undo());
    act(() => result.current.pushState('v3'));
    expect(result.current.canRedo).toBe(false);
  });

  it('caps history at maxHistory', () => {
    const { result } = renderHook(() => useUndoRedo('v0', 3));
    act(() => result.current.pushState('v1'));
    act(() => result.current.pushState('v2'));
    act(() => result.current.pushState('v3'));
    // History: [v1, v2, v3] (v0 dropped), pointer at v3
    act(() => result.current.undo());
    act(() => result.current.undo());
    // Should be at v1, not able to go to v0
    expect(result.current.canUndo).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/arild/temp/ExcaliDash/frontend && npx vitest run src/pages/editor/useUndoRedo.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the hook**

```typescript
// frontend/src/pages/editor/useUndoRedo.ts
import { useRef, useCallback, useState } from 'react';

export function useUndoRedo(initialContent: string, maxHistory = 100) {
  const historyRef = useRef<string[]>([initialContent]);
  const pointerRef = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateFlags = useCallback(() => {
    setCanUndo(pointerRef.current > 0);
    setCanRedo(pointerRef.current < historyRef.current.length - 1);
  }, []);

  const pushState = useCallback((content: string) => {
    const history = historyRef.current;
    const pointer = pointerRef.current;

    // Discard any redo states
    historyRef.current = history.slice(0, pointer + 1);
    historyRef.current.push(content);

    // Cap history length
    if (historyRef.current.length > maxHistory) {
      historyRef.current = historyRef.current.slice(historyRef.current.length - maxHistory);
    }

    pointerRef.current = historyRef.current.length - 1;
    updateFlags();
  }, [maxHistory, updateFlags]);

  const undo = useCallback((): string | undefined => {
    if (pointerRef.current <= 0) return undefined;
    pointerRef.current--;
    updateFlags();
    return historyRef.current[pointerRef.current];
  }, [updateFlags]);

  const redo = useCallback((): string | undefined => {
    if (pointerRef.current >= historyRef.current.length - 1) return undefined;
    pointerRef.current++;
    updateFlags();
    return historyRef.current[pointerRef.current];
  }, [updateFlags]);

  return { pushState, undo, redo, canUndo, canRedo };
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/arild/temp/ExcaliDash/frontend && npx vitest run src/pages/editor/useUndoRedo.test.ts`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add frontend/src/pages/editor/useUndoRedo.ts frontend/src/pages/editor/useUndoRedo.test.ts
git commit -m "Add useUndoRedo hook with full test coverage"
```

---

### Task 3: Create useCanvasInteraction hook

**Files:**
- Create: `frontend/src/pages/editor/useCanvasInteraction.ts`

This hook manages canvas pan/zoom state and the active tool mode.

**Step 1: Create the hook**

```typescript
// frontend/src/pages/editor/useCanvasInteraction.ts
import { useState, useRef, useCallback, useEffect } from 'react';
import panzoom, { PanZoom } from 'panzoom';

export type ToolMode = 'pan' | 'select';

export function useCanvasInteraction() {
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [zoomLevel, setZoomLevel] = useState(1);
  const panzoomRef = useRef<PanZoom | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const initPanzoom = useCallback((element: HTMLDivElement | null) => {
    if (panzoomRef.current) {
      panzoomRef.current.dispose();
      panzoomRef.current = null;
    }
    if (!element) return;
    containerRef.current = element;

    const instance = panzoom(element, {
      maxZoom: 5,
      minZoom: 0.1,
      smoothScroll: false,
      zoomDoubleClickSpeed: 1, // disable double-click zoom
      beforeMouseDown: (e: MouseEvent) => {
        // Only allow pan in pan mode or with middle mouse / space+drag
        const isPanMode = toolMode === 'pan';
        const isMiddleMouse = e.button === 1;
        // Return true to prevent panning (i.e., in select mode without middle mouse)
        return !isPanMode && !isMiddleMouse;
      },
    });

    instance.on('zoom', () => {
      setZoomLevel(instance.getTransform().scale);
    });

    panzoomRef.current = instance;
    setZoomLevel(instance.getTransform().scale);
  }, [toolMode]);

  const zoomIn = useCallback(() => {
    const pz = panzoomRef.current;
    if (!pz || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    pz.smoothZoom(rect.width / 2, rect.height / 2, 1.3);
  }, []);

  const zoomOut = useCallback(() => {
    const pz = panzoomRef.current;
    if (!pz || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    pz.smoothZoom(rect.width / 2, rect.height / 2, 0.7);
  }, []);

  const fitToScreen = useCallback(() => {
    const pz = panzoomRef.current;
    if (!pz || !containerRef.current) return;
    const container = containerRef.current.parentElement;
    if (!container) return;
    const svg = containerRef.current.querySelector('svg');
    if (!svg) return;

    const containerRect = container.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const currentScale = pz.getTransform().scale;
    const naturalWidth = svgRect.width / currentScale;
    const naturalHeight = svgRect.height / currentScale;

    const scaleX = (containerRect.width * 0.9) / naturalWidth;
    const scaleY = (containerRect.height * 0.9) / naturalHeight;
    const targetScale = Math.min(scaleX, scaleY, 2);

    pz.moveTo(0, 0);
    pz.zoomAbs(0, 0, targetScale);

    // Center the content
    const newWidth = naturalWidth * targetScale;
    const newHeight = naturalHeight * targetScale;
    const offsetX = (containerRect.width - newWidth) / 2;
    const offsetY = (containerRect.height - newHeight) / 2;
    pz.moveTo(offsetX, offsetY);
    setZoomLevel(targetScale);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      panzoomRef.current?.dispose();
    };
  }, []);

  return {
    toolMode,
    setToolMode,
    zoomLevel,
    zoomIn,
    zoomOut,
    fitToScreen,
    initPanzoom,
    panzoomRef,
  };
}
```

**Step 2: Commit**

```bash
git add frontend/src/pages/editor/useCanvasInteraction.ts
git commit -m "Add useCanvasInteraction hook for pan/zoom and tool modes"
```

---

### Task 4: Create EditorCanvas component

**Files:**
- Create: `frontend/src/pages/editor/EditorCanvas.tsx`

The full-screen canvas with dotted grid background, panzoom, and Mermaid SVG rendering.

**Step 1: Create EditorCanvas**

```tsx
// frontend/src/pages/editor/EditorCanvas.tsx
import React, { useRef, useEffect, useCallback } from 'react';
import type { ToolMode } from './useCanvasInteraction';

type EditorCanvasProps = {
  previewSvg: string;
  previewError: string | null;
  toolMode: ToolMode;
  initPanzoom: (el: HTMLDivElement | null) => void;
  onNodeClick?: (nodeId: string, rect: DOMRect) => void;
  onCanvasClick?: () => void;
  selectedNodeId?: string | null;
};

export const EditorCanvas: React.FC<EditorCanvasProps> = ({
  previewSvg,
  previewError,
  toolMode,
  initPanzoom,
  onNodeClick,
  onCanvasClick,
  selectedNodeId,
}) => {
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const panzoomTargetRef = useRef<HTMLDivElement>(null);

  // Initialize panzoom on mount
  useEffect(() => {
    initPanzoom(panzoomTargetRef.current);
  }, [initPanzoom]);

  // Attach click handlers to SVG nodes after render
  useEffect(() => {
    const container = svgContainerRef.current;
    if (!container || !previewSvg) return;

    const nodes = container.querySelectorAll<SVGElement>('.node');
    const handlers: Array<[SVGElement, (e: Event) => void]> = [];

    nodes.forEach((node) => {
      // Extract node ID from Mermaid's element structure
      // Mermaid uses data-id, or the element id like "flowchart-A-0"
      const dataId = node.getAttribute('data-id')
        || node.id?.replace(/^flowchart-/, '').replace(/-\d+$/, '')
        || '';

      if (!dataId) return;

      const handler = (e: Event) => {
        e.stopPropagation();
        if (toolMode !== 'select') return;
        const rect = node.getBoundingClientRect();
        onNodeClick?.(dataId, rect);
      };

      node.addEventListener('click', handler);
      node.style.cursor = toolMode === 'select' ? 'pointer' : 'grab';
      handlers.push([node, handler]);
    });

    return () => {
      handlers.forEach(([node, handler]) => {
        node.removeEventListener('click', handler);
      });
    };
  }, [previewSvg, toolMode, onNodeClick]);

  // Highlight selected node
  useEffect(() => {
    const container = svgContainerRef.current;
    if (!container) return;

    // Remove previous highlights
    container.querySelectorAll('.node-selection-ring').forEach(el => el.remove());

    if (!selectedNodeId) return;

    const nodes = container.querySelectorAll<SVGElement>('.node');
    nodes.forEach((node) => {
      const dataId = node.getAttribute('data-id')
        || node.id?.replace(/^flowchart-/, '').replace(/-\d+$/, '')
        || '';

      if (dataId === selectedNodeId) {
        // Add selection ring
        const bbox = (node as any).getBBox?.();
        if (!bbox) return;
        const svgEl = container.querySelector('svg');
        if (!svgEl) return;

        const ring = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        ring.setAttribute('class', 'node-selection-ring');
        ring.setAttribute('x', String(bbox.x - 4));
        ring.setAttribute('y', String(bbox.y - 4));
        ring.setAttribute('width', String(bbox.width + 8));
        ring.setAttribute('height', String(bbox.height + 8));
        ring.setAttribute('rx', '6');
        ring.setAttribute('ry', '6');
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', 'hsl(340, 100%, 44%)');
        ring.setAttribute('stroke-width', '2');
        ring.setAttribute('stroke-dasharray', '6 3');
        ring.style.pointerEvents = 'none';

        // Insert ring into the node's parent group
        node.parentElement?.insertBefore(ring, node);
      }
    });
  }, [selectedNodeId, previewSvg]);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    // Only deselect if clicking the canvas itself, not a node
    if ((e.target as HTMLElement).closest('.node')) return;
    onCanvasClick?.();
  }, [onCanvasClick]);

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        cursor: toolMode === 'pan' ? 'grab' : 'default',
        // Dotted grid background
        backgroundImage: `radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)`,
        backgroundSize: '24px 24px',
      }}
      onClick={handleCanvasClick}
    >
      {previewError && !previewSvg && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center p-8 max-w-md">
          <p className="text-sm text-red-500 dark:text-red-400 font-medium mb-2">
            Diagram Error
          </p>
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
            {previewError}
          </pre>
        </div>
      )}

      {previewError && previewSvg && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400 shadow-sm backdrop-blur-sm">
          Syntax error — showing last valid diagram
        </div>
      )}

      {!previewSvg && !previewError && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center p-8">
          <p className="text-sm text-muted-foreground">Write mermaid code to see a preview</p>
        </div>
      )}

      <div ref={panzoomTargetRef}>
        <div
          ref={svgContainerRef}
          className="mermaid-preview p-12 [&>svg]:max-w-none"
          dangerouslySetInnerHTML={previewSvg ? { __html: previewSvg } : undefined}
        />
      </div>
    </div>
  );
};
```

**Step 2: Commit**

```bash
git add frontend/src/pages/editor/EditorCanvas.tsx
git commit -m "Add EditorCanvas component with panzoom and node interaction"
```

---

### Task 5: Create CodePanel component

**Files:**
- Create: `frontend/src/pages/editor/CodePanel.tsx`

Floating code panel with Monaco editor, matching MermaidChart's style: header with icon, "Code" title, auto-update toggle, docs link, close button.

**Step 1: Create CodePanel**

```tsx
// frontend/src/pages/editor/CodePanel.tsx
import React, { useState, useRef, useCallback, useEffect } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { Code2, X, BookOpen, GripVertical } from 'lucide-react';
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
  const [height, setHeight] = useState<number | null>(null); // null = auto
  const isDraggingX = useRef(false);
  const isDraggingY = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Horizontal resize
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

  // Vertical resize
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
          {/* Auto-Update toggle */}
          <button
            onClick={() => onAutoUpdateChange(!autoUpdate)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              autoUpdate
                ? 'bg-accent'
                : 'bg-gray-300 dark:bg-neutral-600'
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

          {/* Docs link */}
          <button
            className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors"
            title="Mermaid Docs"
            onClick={() => window.open('https://mermaid.js.org/syntax/flowchart.html', '_blank')}
          >
            <BookOpen size={14} />
          </button>

          {/* Close */}
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
```

**Step 2: Commit**

```bash
git add frontend/src/pages/editor/CodePanel.tsx
git commit -m "Add floating CodePanel component with resize and auto-update toggle"
```

---

### Task 6: Create TopToolbar component

**Files:**
- Create: `frontend/src/pages/editor/TopToolbar.tsx`

Centered floating toolbar matching MermaidChart screenshots: icon groups with separators, active state for selected tool.

**Step 1: Create TopToolbar**

```tsx
// frontend/src/pages/editor/TopToolbar.tsx
import React from 'react';
import {
  Hand, MousePointer2, Spline,
  Shapes, GitBranch, Type,
  PencilLine, Image, Presentation, LayoutGrid,
  Network,
} from 'lucide-react';
import type { ToolMode } from './useCanvasInteraction';

type TopToolbarProps = {
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
};

type ToolDef = {
  id: string;
  icon: React.ReactNode;
  label: string;
  mode?: ToolMode;
  disabled?: boolean;
  separator?: boolean;
};

export const TopToolbar: React.FC<TopToolbarProps> = ({
  toolMode,
  onToolModeChange,
}) => {
  const tools: ToolDef[] = [
    { id: 'pan', icon: <Hand size={18} />, label: 'Pan', mode: 'pan' },
    { id: 'select', icon: <MousePointer2 size={18} />, label: 'Select', mode: 'select' },
    { id: 'lasso', icon: <Spline size={18} />, label: 'Multi-select', disabled: true },
    { id: 'sep1', separator: true, icon: null, label: '' },
    { id: 'add-node', icon: <Shapes size={18} />, label: 'Add shape', disabled: true },
    { id: 'connector', icon: <GitBranch size={18} />, label: 'Add connection', disabled: true },
    { id: 'text', icon: <Type size={18} />, label: 'Add text', disabled: true },
    { id: 'draw', icon: <PencilLine size={18} />, label: 'Draw', disabled: true },
    { id: 'image', icon: <Image size={18} />, label: 'Insert image', disabled: true },
    { id: 'present', icon: <Presentation size={18} />, label: 'Presentation', disabled: true },
    { id: 'layout', icon: <LayoutGrid size={18} />, label: 'Layout', disabled: true },
  ];

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
      <div className="flex items-center gap-0.5 px-1.5 py-1.5 rounded-xl bg-white dark:bg-neutral-900 border border-border shadow-lg">
        {tools.map((tool) => {
          if (tool.separator) {
            return (
              <div
                key={tool.id}
                className="w-px h-6 bg-border mx-1"
              />
            );
          }

          const isActive = tool.mode && tool.mode === toolMode;

          return (
            <button
              key={tool.id}
              onClick={() => tool.mode && !tool.disabled && onToolModeChange(tool.mode)}
              disabled={tool.disabled}
              title={tool.label}
              className={`
                relative p-2 rounded-lg transition-all
                ${isActive
                  ? 'bg-accent text-white shadow-sm'
                  : tool.disabled
                    ? 'text-muted-foreground/40 cursor-not-allowed'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }
              `}
            >
              {tool.icon}
            </button>
          );
        })}

        {/* Sidebar toggle — far right with separator */}
        <div className="w-px h-6 bg-border mx-1" />
        <button
          title="Toggle sidebar"
          disabled
          className="p-2 rounded-lg text-muted-foreground/40 cursor-not-allowed"
        >
          <Network size={18} />
        </button>
      </div>
    </div>
  );
};
```

**Step 2: Commit**

```bash
git add frontend/src/pages/editor/TopToolbar.tsx
git commit -m "Add TopToolbar component with tool mode switching"
```

---

### Task 7: Create BottomBar component

**Files:**
- Create: `frontend/src/pages/editor/BottomBar.tsx`

Fixed bottom bar: snippets left, AI center, undo/redo + zoom + fullscreen right.

**Step 1: Create BottomBar**

```tsx
// frontend/src/pages/editor/BottomBar.tsx
import React, { useCallback } from 'react';
import {
  Undo2, Redo2,
  ZoomIn, ZoomOut, Scan, Maximize,
  Sparkles, Code2,
} from 'lucide-react';

type BottomBarProps = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  onSnippetsOpen?: () => void;
};

export const BottomBar: React.FC<BottomBarProps> = ({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onSnippetsOpen,
}) => {
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }, []);

  const zoomPercent = Math.round(zoomLevel * 100);

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 px-4 py-3 flex items-center justify-between pointer-events-none">
      {/* Left: Snippets */}
      <div className="pointer-events-auto">
        <button
          onClick={onSnippetsOpen}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-border shadow-lg hover:shadow-xl transition-all text-sm font-medium text-foreground"
        >
          <Code2 size={15} />
          <span>Snippets</span>
        </button>
      </div>

      {/* Center: Use AI */}
      <div className="pointer-events-auto">
        <button
          className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white dark:bg-neutral-900 border border-border shadow-lg hover:shadow-xl transition-all text-sm font-medium text-foreground"
        >
          <Sparkles size={16} className="text-accent" />
          <span>Use AI</span>
        </button>
      </div>

      {/* Right: Undo/Redo + Zoom + Fullscreen */}
      <div className="pointer-events-auto flex items-center gap-1 px-1.5 py-1.5 rounded-xl bg-white dark:bg-neutral-900 border border-border shadow-lg">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo"
          className={`p-2 rounded-lg transition-colors ${
            canUndo
              ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
              : 'text-muted-foreground/30 cursor-not-allowed'
          }`}
        >
          <Undo2 size={16} />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo"
          className={`p-2 rounded-lg transition-colors ${
            canRedo
              ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
              : 'text-muted-foreground/30 cursor-not-allowed'
          }`}
        >
          <Redo2 size={16} />
        </button>

        <div className="w-px h-5 bg-border mx-0.5" />

        <button
          onClick={onZoomOut}
          title="Zoom out"
          className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ZoomOut size={16} />
        </button>
        <span className="text-xs text-muted-foreground font-medium w-10 text-center tabular-nums">
          {zoomPercent}%
        </span>
        <button
          onClick={onZoomIn}
          title="Zoom in"
          className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={onFitToScreen}
          title="Fit to screen"
          className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Scan size={16} />
        </button>

        <div className="w-px h-5 bg-border mx-0.5" />

        <button
          onClick={toggleFullscreen}
          title="Fullscreen"
          className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Maximize size={16} />
        </button>
      </div>
    </div>
  );
};
```

**Step 2: Commit**

```bash
git add frontend/src/pages/editor/BottomBar.tsx
git commit -m "Add BottomBar component with undo/redo, zoom, and fullscreen"
```

---

## Phase 2: Pickers and Context

### Task 8: Create ColorPicker component

**Files:**
- Create: `frontend/src/pages/editor/ColorPicker.tsx`

**Step 1: Create ColorPicker**

```tsx
// frontend/src/pages/editor/ColorPicker.tsx
import React from 'react';

const PALETTE = [
  // Row 1: neutrals
  ['#FFFFFF', '#000000', '#4A4A4A', '#7A7A7A', '#A0A0A0', '#D0D0D0'],
  // Row 2: vivid
  ['#E74C3C', '#F39C12', '#F1C40F', '#2ECC71', '#3498DB', '#9B59B6'],
  // Row 3: pastels
  ['#FA93B2', '#FFBE76', '#FFF3A3', '#BEF6AC', '#A3E9CC', '#D4EFF0'],
];

type ColorPickerProps = {
  position: { x: number; y: number };
  currentColor?: string;
  onColorSelect: (color: string) => void;
  onClose: () => void;
};

export const ColorPicker: React.FC<ColorPickerProps> = ({
  position,
  currentColor,
  onColorSelect,
  onClose,
}) => {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div
        className="fixed z-50 p-3 rounded-2xl bg-white dark:bg-neutral-900 border border-border shadow-xl"
        style={{
          left: position.x,
          top: position.y,
        }}
      >
        <div className="flex flex-col gap-2">
          {PALETTE.map((row, ri) => (
            <div key={ri} className="flex gap-1.5">
              {row.map((color) => {
                const isSelected = currentColor?.toUpperCase() === color.toUpperCase();
                return (
                  <button
                    key={color}
                    onClick={() => onColorSelect(color)}
                    className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${
                      isSelected ? 'ring-2 ring-accent ring-offset-2 ring-offset-white dark:ring-offset-neutral-900' : ''
                    } ${color === '#FFFFFF' ? 'border border-gray-200 dark:border-neutral-600' : ''}`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};
```

**Step 2: Commit**

```bash
git add frontend/src/pages/editor/ColorPicker.tsx
git commit -m "Add ColorPicker component with palette grid"
```

---

### Task 9: Create ShapePicker component

**Files:**
- Create: `frontend/src/pages/editor/ShapePicker.tsx`

Tabbed popup with shape icons, matching MermaidChart screenshot.

**Step 1: Create ShapePicker**

```tsx
// frontend/src/pages/editor/ShapePicker.tsx
import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';

export type MermaidShape = {
  name: string;
  syntax: (id: string, text: string) => string;
  icon: React.ReactNode;
};

// SVG mini-icons for each shape
const ShapeIcon: React.FC<{ d: string }> = ({ d }) => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-foreground">
    <path d={d} stroke="currentColor" strokeWidth="1.5" fill="none" />
  </svg>
);

const SHAPES: Record<string, MermaidShape[]> = {
  Basic: [
    {
      name: 'Rectangle',
      syntax: (id, text) => `${id}[${text}]`,
      icon: <ShapeIcon d="M4 6h20v16H4z" />,
    },
    {
      name: 'Rounded',
      syntax: (id, text) => `${id}(${text})`,
      icon: <ShapeIcon d="M8 6h12a4 4 0 0 1 0 16H8a4 4 0 0 1 0-16z" />,
    },
    {
      name: 'Stadium',
      syntax: (id, text) => `${id}([${text}])`,
      icon: <ShapeIcon d="M10 7h8a7 7 0 0 1 0 14h-8a7 7 0 0 1 0-14z" />,
    },
    {
      name: 'Circle',
      syntax: (id, text) => `${id}((${text}))`,
      icon: <ShapeIcon d="M14 4a10 10 0 1 1 0 20 10 10 0 0 1 0-20z" />,
    },
    {
      name: 'Diamond',
      syntax: (id, text) => `${id}{${text}}`,
      icon: <ShapeIcon d="M14 3L25 14 14 25 3 14z" />,
    },
    {
      name: 'Hexagon',
      syntax: (id, text) => `${id}{{${text}}}`,
      icon: <ShapeIcon d="M8 4h12l6 10-6 10H8L2 14z" />,
    },
  ],
  Process: [
    {
      name: 'Subroutine',
      syntax: (id, text) => `${id}[[${text}]]`,
      icon: <ShapeIcon d="M4 6h20v16H4zM7 6v16M21 6v16" />,
    },
    {
      name: 'Cylindrical',
      syntax: (id, text) => `${id}[(${text})]`,
      icon: <ShapeIcon d="M6 8c0-2 3.5-4 8-4s8 2 8 4v12c0 2-3.5 4-8 4s-8-2-8-4zM6 8c0 2 3.5 4 8 4s8-2 8-4" />,
    },
    {
      name: 'Asymmetric',
      syntax: (id, text) => `${id}>${text}]`,
      icon: <ShapeIcon d="M4 6l6 8-6 8h20V6z" />,
    },
    {
      name: 'Parallelogram',
      syntax: (id, text) => `${id}[/${text}/]`,
      icon: <ShapeIcon d="M8 6h16l-4 16H4z" />,
    },
    {
      name: 'Trapezoid',
      syntax: (id, text) => `${id}[/${text}\\]`,
      icon: <ShapeIcon d="M6 22h16l-3-16H9z" />,
    },
    {
      name: 'Double circle',
      syntax: (id, text) => `${id}(((${text})))`,
      icon: <ShapeIcon d="M14 5a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM14 8a6 6 0 1 1 0 12 6 6 0 0 1 0-12z" />,
    },
  ],
  Technical: [
    {
      name: 'Database',
      syntax: (id, text) => `${id}[(${text})]`,
      icon: <ShapeIcon d="M6 8c0-2 3.5-4 8-4s8 2 8 4v12c0 2-3.5 4-8 4s-8-2-8-4zM6 8c0 2 3.5 4 8 4s8-2 8-4" />,
    },
    {
      name: 'Odd',
      syntax: (id, text) => `${id}>>${text}]`,
      icon: <ShapeIcon d="M3 6h18l4 8-4 8H3z" />,
    },
    {
      name: 'Inv trapezoid',
      syntax: (id, text) => `${id}[\\${text}/]`,
      icon: <ShapeIcon d="M9 6h10l3 16H6z" />,
    },
    {
      name: 'Lean right',
      syntax: (id, text) => `${id}[\\${text}\\]`,
      icon: <ShapeIcon d="M8 6h16l-4 16H4z" />,
    },
    {
      name: 'Lean left',
      syntax: (id, text) => `${id}[/${text}/]`,
      icon: <ShapeIcon d="M4 6h16l4 16H8z" />,
    },
    {
      name: 'No shape',
      syntax: (id, text) => `${id}:::default`,
      icon: (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowRight size={12} />
          <span>Aa</span>
        </div>
      ),
    },
  ],
};

type ShapePickerProps = {
  position: { x: number; y: number };
  onShapeSelect: (shape: MermaidShape) => void;
  onClose: () => void;
};

export const ShapePicker: React.FC<ShapePickerProps> = ({
  position,
  onShapeSelect,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<string>('Basic');
  const tabs = Object.keys(SHAPES);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div
        className="fixed z-50 w-72 rounded-2xl bg-white dark:bg-neutral-900 border border-border shadow-xl overflow-hidden"
        style={{ left: position.x, top: position.y }}
      >
        {/* Tabs */}
        <div className="flex border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                activeTab === tab
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Shape grid */}
        <div className="p-3">
          <div className="grid grid-cols-6 gap-1">
            {SHAPES[activeTab].map((shape) => (
              <button
                key={shape.name}
                onClick={() => onShapeSelect(shape)}
                title={shape.name}
                className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-muted transition-colors"
              >
                {shape.icon}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};
```

**Step 2: Commit**

```bash
git add frontend/src/pages/editor/ShapePicker.tsx
git commit -m "Add ShapePicker component with tabbed shape grid"
```

---

### Task 10: Create NodeContextToolbar component

**Files:**
- Create: `frontend/src/pages/editor/NodeContextToolbar.tsx`

Floating toolbar that appears near a selected node with shape, color, text, duplicate, delete actions.

**Step 1: Create NodeContextToolbar**

```tsx
// frontend/src/pages/editor/NodeContextToolbar.tsx
import React from 'react';
import {
  Shapes, Paintbrush, Type,
  Link, Copy, Trash2,
} from 'lucide-react';

type NodeContextToolbarProps = {
  position: { x: number; y: number };
  onShapeClick: () => void;
  onColorClick: () => void;
  onTextEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

export const NodeContextToolbar: React.FC<NodeContextToolbarProps> = ({
  position,
  onShapeClick,
  onColorClick,
  onTextEdit,
  onDuplicate,
  onDelete,
}) => {
  const actions = [
    { id: 'shape', icon: <Shapes size={15} />, label: 'Change shape', onClick: onShapeClick },
    { id: 'color', icon: <Paintbrush size={15} />, label: 'Change color', onClick: onColorClick },
    { id: 'sep1', separator: true },
    { id: 'text', icon: <Type size={15} />, label: 'Edit text', onClick: onTextEdit },
    { id: 'link', icon: <Link size={15} />, label: 'Add link', onClick: () => {}, disabled: true },
    { id: 'sep2', separator: true },
    { id: 'duplicate', icon: <Copy size={15} />, label: 'Duplicate', onClick: onDuplicate },
    { id: 'delete', icon: <Trash2 size={15} />, label: 'Delete', onClick: onDelete, destructive: true },
  ] as const;

  return (
    <div
      className="fixed z-50 flex items-center gap-0.5 px-1.5 py-1 rounded-xl bg-white dark:bg-neutral-900 border border-border shadow-xl"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translateX(-50%)',
      }}
    >
      {actions.map((action) => {
        if ('separator' in action && action.separator) {
          return <div key={action.id} className="w-px h-5 bg-border mx-0.5" />;
        }

        if (!('onClick' in action)) return null;

        return (
          <button
            key={action.id}
            onClick={action.onClick}
            disabled={'disabled' in action && action.disabled}
            title={action.label}
            className={`p-1.5 rounded-lg transition-colors ${
              'disabled' in action && action.disabled
                ? 'text-muted-foreground/30 cursor-not-allowed'
                : 'destructive' in action && action.destructive
                  ? 'text-muted-foreground hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {action.icon}
          </button>
        );
      })}
    </div>
  );
};
```

**Step 2: Commit**

```bash
git add frontend/src/pages/editor/NodeContextToolbar.tsx
git commit -m "Add NodeContextToolbar for selected node actions"
```

---

### Task 11: Create useNodeSelection hook

**Files:**
- Create: `frontend/src/pages/editor/useNodeSelection.ts`

Hook that manages which node is selected, parses Mermaid code to find node info, and provides functions to modify node shape/color/text.

**Step 1: Create useNodeSelection**

```typescript
// frontend/src/pages/editor/useNodeSelection.ts
import { useState, useCallback } from 'react';

type SelectedNode = {
  id: string;
  rect: DOMRect;
  label?: string;
  currentColor?: string;
};

// Parse a node definition from Mermaid code to extract shape brackets and text
// Matches patterns like: A[text], A(text), A{text}, A((text)), A([text]), etc.
const NODE_DEF_REGEX = /^(\s*)(\w+)([\[\(\{<>]+)(.+?)([\]\)\}>]+)/;

// Parse style line: style A fill:#BEF6AC,stroke:#000
const STYLE_REGEX = /^\s*style\s+(\w+)\s+(.*)$/;

export function useNodeSelection(
  content: string,
  onContentChange: (newContent: string) => void,
) {
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);

  const selectNode = useCallback((nodeId: string, rect: DOMRect) => {
    // Find current color from style directives
    const lines = content.split('\n');
    let currentColor: string | undefined;

    for (const line of lines) {
      const styleMatch = line.match(STYLE_REGEX);
      if (styleMatch && styleMatch[1] === nodeId) {
        const fillMatch = styleMatch[2].match(/fill:(#[0-9A-Fa-f]{6})/);
        if (fillMatch) currentColor = fillMatch[1];
      }
    }

    setSelectedNode({ id: nodeId, rect, currentColor });
  }, [content]);

  const deselectNode = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const changeNodeColor = useCallback((color: string) => {
    if (!selectedNode) return;
    const lines = content.split('\n');
    const styleDirective = `    style ${selectedNode.id} stroke:#000000,fill:${color}`;

    // Check if a style line already exists for this node
    const existingIdx = lines.findIndex((line) => {
      const m = line.match(STYLE_REGEX);
      return m && m[1] === selectedNode.id;
    });

    if (existingIdx >= 0) {
      lines[existingIdx] = styleDirective;
    } else {
      lines.push(styleDirective);
    }

    const newContent = lines.join('\n');
    onContentChange(newContent);
    setSelectedNode((prev) => prev ? { ...prev, currentColor: color } : null);
  }, [selectedNode, content, onContentChange]);

  const changeNodeShape = useCallback((
    syntaxFn: (id: string, text: string) => string,
  ) => {
    if (!selectedNode) return;
    const lines = content.split('\n');

    const newLines = lines.map((line) => {
      const match = line.match(NODE_DEF_REGEX);
      if (!match) return line;

      const [, indent, id, , text] = match;
      if (id !== selectedNode.id) return line;

      return `${indent}${syntaxFn(id, text)}`;
    });

    onContentChange(newLines.join('\n'));
  }, [selectedNode, content, onContentChange]);

  const deleteNode = useCallback(() => {
    if (!selectedNode) return;
    const lines = content.split('\n');
    const id = selectedNode.id;

    const newLines = lines.filter((line) => {
      // Remove node definitions
      const defMatch = line.match(NODE_DEF_REGEX);
      if (defMatch && defMatch[2] === id) return false;

      // Remove style directives
      const styleMatch = line.match(STYLE_REGEX);
      if (styleMatch && styleMatch[1] === id) return false;

      // Remove edges that reference this node
      // Simple heuristic: line contains the node ID as part of an arrow expression
      const trimmed = line.trim();
      const edgePattern = new RegExp(`(^|\\s)${id}(\\s|$|\\[|\\(|\\{|-->|---|-\\.-|==>|-.->|--)`);
      const arrowPattern = new RegExp(`(-->|---|-\\.-|==>|-.->|--)\\s*${id}(\\s|$|\\[|\\(|\\{)`);
      if (edgePattern.test(trimmed) || arrowPattern.test(trimmed)) return false;

      return true;
    });

    onContentChange(newLines.join('\n'));
    setSelectedNode(null);
  }, [selectedNode, content, onContentChange]);

  const duplicateNode = useCallback(() => {
    if (!selectedNode) return;
    const lines = content.split('\n');
    const id = selectedNode.id;
    const newId = `${id}_copy`;
    const newLines: string[] = [];

    for (const line of lines) {
      newLines.push(line);
      const defMatch = line.match(NODE_DEF_REGEX);
      if (defMatch && defMatch[2] === id) {
        // Insert duplicate after the original
        newLines.push(line.replace(id, newId));
      }
    }

    onContentChange(newLines.join('\n'));
  }, [selectedNode, content, onContentChange]);

  return {
    selectedNode,
    selectNode,
    deselectNode,
    changeNodeColor,
    changeNodeShape,
    deleteNode,
    duplicateNode,
  };
}
```

**Step 2: Commit**

```bash
git add frontend/src/pages/editor/useNodeSelection.ts
git commit -m "Add useNodeSelection hook for node interaction logic"
```

---

### Task 12: Create SnippetsPicker component

**Files:**
- Create: `frontend/src/pages/editor/SnippetsPicker.tsx`

**Step 1: Create SnippetsPicker**

```tsx
// frontend/src/pages/editor/SnippetsPicker.tsx
import React from 'react';

type Snippet = {
  name: string;
  description: string;
  code: string;
};

const SNIPPETS: Snippet[] = [
  {
    name: 'Flowchart',
    description: 'Basic flowchart with decision',
    code: `flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action]
    B -->|No| D[Other action]
    C --> E[End]
    D --> E`,
  },
  {
    name: 'Sequence Diagram',
    description: 'Service interaction',
    code: `sequenceDiagram
    participant U as User
    participant S as Server
    participant DB as Database
    U->>S: Request
    S->>DB: Query
    DB-->>S: Result
    S-->>U: Response`,
  },
  {
    name: 'Class Diagram',
    description: 'OOP class structure',
    code: `classDiagram
    class Animal {
        +String name
        +makeSound() void
    }
    class Dog {
        +fetch() void
    }
    Animal <|-- Dog`,
  },
  {
    name: 'State Diagram',
    description: 'State machine',
    code: `stateDiagram-v2
    [*] --> Idle
    Idle --> Processing: start
    Processing --> Done: complete
    Processing --> Error: fail
    Error --> Idle: retry
    Done --> [*]`,
  },
  {
    name: 'Entity Relationship',
    description: 'Database schema',
    code: `erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    PRODUCT ||--o{ LINE_ITEM : "is in"`,
  },
  {
    name: 'Gantt Chart',
    description: 'Project timeline',
    code: `gantt
    title Project Plan
    dateFormat YYYY-MM-DD
    section Phase 1
        Design    :a1, 2024-01-01, 14d
        Develop   :a2, after a1, 21d
    section Phase 2
        Test      :a3, after a2, 14d
        Deploy    :a4, after a3, 7d`,
  },
];

type SnippetsPickerProps = {
  position: { x: number; y: number };
  onSnippetSelect: (code: string) => void;
  onClose: () => void;
};

export const SnippetsPicker: React.FC<SnippetsPickerProps> = ({
  position,
  onSnippetSelect,
  onClose,
}) => {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div
        className="fixed z-50 w-80 max-h-96 rounded-2xl bg-white dark:bg-neutral-900 border border-border shadow-xl overflow-hidden"
        style={{
          left: position.x,
          bottom: window.innerHeight - position.y + 8,
        }}
      >
        <div className="px-3 py-2.5 border-b border-border">
          <span className="text-sm font-semibold text-foreground">Snippets</span>
        </div>
        <div className="overflow-y-auto max-h-80 p-1.5">
          {SNIPPETS.map((snippet) => (
            <button
              key={snippet.name}
              onClick={() => onSnippetSelect(snippet.code)}
              className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-muted transition-colors"
            >
              <div className="text-sm font-medium text-foreground">{snippet.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{snippet.description}</div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
};
```

**Step 2: Commit**

```bash
git add frontend/src/pages/editor/SnippetsPicker.tsx
git commit -m "Add SnippetsPicker with common diagram templates"
```

---

## Phase 3: Integration

### Task 13: Rewrite Editor.tsx to compose all new components

This is the main integration task. Rewrite `Editor.tsx` to use the new canvas-based layout with all overlay components, preserving existing save/socket/presence/share logic.

**Files:**
- Modify: `frontend/src/pages/Editor.tsx` (full rewrite of the render + some state additions)

**Step 1: Rewrite Editor.tsx**

The key changes:
1. Replace the split-pane layout with `EditorCanvas` as the full-screen background
2. Overlay `CodePanel`, `TopToolbar`, `BottomBar` on top
3. Wire `useUndoRedo`, `useCanvasInteraction`, `useNodeSelection`
4. Add state for `codePanelOpen`, `showShapePicker`, `showColorPicker`, `showSnippets`
5. Wire `NodeContextToolbar` to appear when a node is selected
6. Preserve ALL existing logic: save, socket, presence, share, rename, keyboard shortcuts

The following changes are to be applied to `Editor.tsx`:

**New imports to add at top:**
```tsx
import { EditorCanvas } from './editor/EditorCanvas';
import { CodePanel } from './editor/CodePanel';
import { TopToolbar } from './editor/TopToolbar';
import { BottomBar } from './editor/BottomBar';
import { NodeContextToolbar } from './editor/NodeContextToolbar';
import { ShapePicker } from './editor/ShapePicker';
import { ColorPicker } from './editor/ColorPicker';
import { SnippetsPicker } from './editor/SnippetsPicker';
import { useCanvasInteraction } from './editor/useCanvasInteraction';
import { useUndoRedo } from './editor/useUndoRedo';
import { useNodeSelection } from './editor/useNodeSelection';
```

**New state to add inside the component (after existing state):**
```tsx
const [codePanelOpen, setCodePanelOpen] = useState(true);
const [autoUpdate, setAutoUpdate] = useState(true);
const [showShapePicker, setShowShapePicker] = useState(false);
const [showColorPicker, setShowColorPicker] = useState(false);
const [showSnippets, setShowSnippets] = useState(false);
const [pickerPosition, setPickerPosition] = useState({ x: 0, y: 0 });
const snippetsButtonRef = useRef<HTMLDivElement>(null);
```

**Hook wiring (after existing hooks):**
```tsx
const { pushState, undo, redo, canUndo, canRedo } = useUndoRedo(content);

const {
  toolMode, setToolMode, zoomLevel,
  zoomIn, zoomOut, fitToScreen, initPanzoom,
} = useCanvasInteraction();

const {
  selectedNode, selectNode, deselectNode,
  changeNodeColor, changeNodeShape, deleteNode, duplicateNode,
} = useNodeSelection(content, (newContent) => {
  handleContentChange(newContent);
});
```

**Modify handleContentChange to push undo state:**
```tsx
const handleContentChange = useCallback((value: string | undefined) => {
  const newContent = value ?? '';
  setContent(newContent);
  pushState(newContent);
  if (autoUpdate) {
    debouncedRender(newContent);
  }
  if (canEdit) {
    debouncedSave(newContent);
  }
  if (!isRemoteUpdateRef.current && socketRef.current && id) {
    socketRef.current.emit('content-update', { drawingId: id, content: newContent });
  }
}, [debouncedRender, debouncedSave, canEdit, id, pushState, autoUpdate]);
```

**Add undo/redo handlers:**
```tsx
const handleUndo = useCallback(() => {
  const prev = undo();
  if (prev !== undefined) {
    isRemoteUpdateRef.current = true;
    setContent(prev);
    debouncedRender(prev);
    if (canEdit) debouncedSave(prev);
    isRemoteUpdateRef.current = false;
  }
}, [undo, debouncedRender, debouncedSave, canEdit]);

const handleRedo = useCallback(() => {
  const next = redo();
  if (next !== undefined) {
    isRemoteUpdateRef.current = true;
    setContent(next);
    debouncedRender(next);
    if (canEdit) debouncedSave(next);
    isRemoteUpdateRef.current = false;
  }
}, [redo, debouncedRender, debouncedSave, canEdit]);
```

**Add Ctrl+Z / Ctrl+Shift+Z to keyboard handler:**
```tsx
// Inside the handleKeyDown function, add before the Ctrl+S handler:
if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
  e.preventDefault();
  handleUndo();
  return;
}
if ((e.metaKey || e.ctrlKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
  e.preventDefault();
  handleRedo();
  return;
}
```

**Replace the entire render (from `return (` to the end):**

Remove the split-pane layout. The new layout structure:

```tsx
return (
  <div className="h-screen flex flex-col bg-background overflow-hidden">
    {/* Top bar — preserved from existing code, identical markup */}
    <header className={`h-14 bg-white dark:bg-neutral-900 border-b border-border flex items-center px-4 justify-between z-30 shrink-0 transition-transform duration-300 ${isHeaderVisible ? 'translate-y-0' : '-translate-y-full'}`}>
      {/* ... existing header content unchanged ... */}
    </header>

    {/* Main canvas area */}
    <div className="flex-1 relative overflow-hidden">
      {/* Canvas background */}
      <EditorCanvas
        previewSvg={previewSvg}
        previewError={previewError}
        toolMode={toolMode}
        initPanzoom={initPanzoom}
        onNodeClick={(nodeId, rect) => {
          selectNode(nodeId, rect);
        }}
        onCanvasClick={deselectNode}
        selectedNodeId={selectedNode?.id}
      />

      {/* Top toolbar */}
      <TopToolbar toolMode={toolMode} onToolModeChange={setToolMode} />

      {/* Floating code panel */}
      <CodePanel
        content={content}
        onChange={handleContentChange}
        readOnly={!canEdit}
        isOpen={codePanelOpen}
        onClose={() => setCodePanelOpen(false)}
        onOpen={() => setCodePanelOpen(true)}
        autoUpdate={autoUpdate}
        onAutoUpdateChange={setAutoUpdate}
      />

      {/* Bottom bar */}
      <BottomBar
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        zoomLevel={zoomLevel}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFitToScreen={fitToScreen}
        onSnippetsOpen={() => setShowSnippets(!showSnippets)}
      />

      {/* Node context toolbar */}
      {selectedNode && (
        <NodeContextToolbar
          position={{
            x: selectedNode.rect.left + selectedNode.rect.width / 2,
            y: selectedNode.rect.top - 12,
          }}
          onShapeClick={() => {
            setPickerPosition({
              x: selectedNode.rect.left + selectedNode.rect.width / 2,
              y: selectedNode.rect.bottom + 8,
            });
            setShowShapePicker(true);
          }}
          onColorClick={() => {
            setPickerPosition({
              x: selectedNode.rect.left + selectedNode.rect.width / 2,
              y: selectedNode.rect.bottom + 8,
            });
            setShowColorPicker(true);
          }}
          onTextEdit={() => {
            // Focus code panel on the relevant line
            setCodePanelOpen(true);
          }}
          onDuplicate={duplicateNode}
          onDelete={deleteNode}
        />
      )}

      {/* Shape picker popup */}
      {showShapePicker && (
        <ShapePicker
          position={pickerPosition}
          onShapeSelect={(shape) => {
            changeNodeShape(shape.syntax);
            setShowShapePicker(false);
          }}
          onClose={() => setShowShapePicker(false)}
        />
      )}

      {/* Color picker popup */}
      {showColorPicker && (
        <ColorPicker
          position={pickerPosition}
          currentColor={selectedNode?.currentColor}
          onColorSelect={(color) => {
            changeNodeColor(color);
            setShowColorPicker(false);
          }}
          onClose={() => setShowColorPicker(false)}
        />
      )}

      {/* Snippets picker */}
      {showSnippets && (
        <SnippetsPicker
          position={{ x: 16, y: window.innerHeight - 60 }}
          onSnippetSelect={(code) => {
            handleContentChange(code);
            setShowSnippets(false);
          }}
          onClose={() => setShowSnippets(false)}
        />
      )}
    </div>

    <Toaster position="bottom-center" />

    {id && (
      <ShareModal
        drawingId={id}
        drawingName={drawingName}
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
      />
    )}
  </div>
);
```

**Step 2: Remove unused imports and state**

Remove:
- `splitPosition` state and `setSplitPosition`
- `MIN_PANEL_WIDTH_PX` constant
- `handleDragStart` callback
- `MonacoEditor` direct import (now in CodePanel)
- `previewContainerRef` (now in EditorCanvas)

**Step 3: Verify build**

Run: `cd /Users/arild/temp/ExcaliDash/frontend && npm run build`
Expected: Build succeeds with no TypeScript errors

**Step 4: Manual visual test**

Run: `cd /Users/arild/temp/ExcaliDash/frontend && npm run dev`

Check:
- [ ] Dotted grid canvas fills the screen
- [ ] Floating code panel opens/closes, resizes, has auto-update toggle
- [ ] Top toolbar shows with pan/select active states
- [ ] Bottom bar has snippets, AI, undo/redo, zoom controls
- [ ] Pan/zoom works on canvas
- [ ] Clicking a node shows selection ring and context toolbar
- [ ] Color picker changes node fill color
- [ ] Shape picker changes node shape
- [ ] Undo/redo works (Ctrl+Z / Ctrl+Shift+Z)
- [ ] Snippets picker loads templates
- [ ] Save, rename, share all still work
- [ ] Dark mode works correctly

**Step 5: Commit**

```bash
git add frontend/src/pages/Editor.tsx
git commit -m "Rewrite editor with canvas-based visual editor layout"
```

---

### Task 14: Polish and visual refinement

**Files:**
- Modify: `frontend/src/index.css` (add canvas-specific styles)
- Various component tweaks

**Step 1: Add global styles for the canvas**

Add to `frontend/src/index.css`:

```css
/* Panzoom reset — prevent panzoom from adding inline transform origin */
.mermaid-preview svg {
  transform-origin: 0 0;
}

/* Selection ring animation */
.node-selection-ring {
  animation: selection-dash 0.8s linear infinite;
}

@keyframes selection-dash {
  to {
    stroke-dashoffset: -18;
  }
}

/* Canvas grab cursor when panning */
.canvas-panning {
  cursor: grabbing !important;
}
```

**Step 2: Fix any dark mode issues**

Verify all floating panels use proper dark mode classes:
- `bg-white dark:bg-neutral-900`
- `border-border`
- `text-foreground` / `text-muted-foreground`

**Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "Add canvas animation styles and dark mode refinements"
```

---

### Task 15: Run full test suite and fix any breakage

**Step 1: Run existing tests**

Run: `cd /Users/arild/temp/ExcaliDash/frontend && npm run test`

**Step 2: Run build**

Run: `cd /Users/arild/temp/ExcaliDash/frontend && npm run build`

**Step 3: Fix any failures**

If tests reference the old split-pane layout, update them to work with the new component structure.

**Step 4: Run lint**

Run: `cd /Users/arild/temp/ExcaliDash/frontend && npm run lint`

**Step 5: Fix all lint/type errors**

**Step 6: Final commit**

```bash
git add -A
git commit -m "Fix tests and lint for visual editor rewrite"
```
