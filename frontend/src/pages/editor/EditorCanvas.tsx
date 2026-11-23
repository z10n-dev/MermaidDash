import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { ToolMode } from './useCanvasInteraction';
import { SHOW_MERMAID_WARNINGS } from '../../utils/mermaidWarnings';

type EditorCanvasProps = {
  previewSvg: string;
  previewError: string | null;
  toolMode: ToolMode;
  initSvgPanZoom: (svg: SVGSVGElement | null) => void;
  onNodeClick?: (nodeId: string, rect: DOMRect) => void;
  onCanvasClick?: (e?: React.MouseEvent) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
  onDragConnect?: (sourceId: string, targetId: string) => void;
  selectedNodeId?: string | null;
};

function getNodeId(node: SVGElement): string {
  return node.getAttribute('data-id')
    || node.id?.replace(/^flowchart-/, '').replace(/-\d+$/, '')
    || '';
}

export const EditorCanvas: React.FC<EditorCanvasProps> = ({
  previewSvg,
  previewError,
  toolMode,
  initSvgPanZoom,
  onNodeClick,
  onCanvasClick,
  onNodeDoubleClick,
  onDragConnect,
  selectedNodeId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const initializedSvgId = useRef<string | null>(null);

  // Drag-to-connect state
  const dragSourceRef = useRef<string | null>(null);
  const dragLineRef = useRef<SVGLineElement | null>(null);
  const isDraggingRef = useRef(false);

  // When previewSvg changes, inject it and init svg-pan-zoom on the SVG element
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!previewSvg) {
      container.innerHTML = '';
      initializedSvgId.current = null;
      return;
    }

    // Inject SVG HTML
    container.innerHTML = previewSvg;

    const svgEl = container.querySelector<SVGSVGElement>('svg');
    if (!svgEl) return;

    // Capture original dimensions before overriding for viewBox
    const origWidth = parseFloat(svgEl.getAttribute('width') || '') || svgEl.getBoundingClientRect().width;
    const origHeight = parseFloat(svgEl.getAttribute('height') || '') || svgEl.getBoundingClientRect().height;

    // Ensure SVG has a viewBox (Mermaid sometimes only sets width/height)
    if (!svgEl.getAttribute('viewBox')) {
      svgEl.setAttribute('viewBox', `0 0 ${origWidth} ${origHeight}`);
    }

    // Remove Mermaid's restrictive inline styles that clip content
    svgEl.style.overflow = 'visible';
    svgEl.style.maxWidth = 'none';

    // Let SVG fill the container — svg-pan-zoom manages transforms via viewBox
    svgEl.setAttribute('width', '100%');
    svgEl.setAttribute('height', '100%');
    svgEl.style.position = 'absolute';
    svgEl.style.top = '0';
    svgEl.style.left = '0';

    // Small delay to let the SVG render into DOM before measuring
    const timer = setTimeout(() => {
      initSvgPanZoom(svgEl);
      initializedSvgId.current = svgEl.id || 'initialized';
      setReady(true);
    }, 50);

    return () => clearTimeout(timer);
  }, [previewSvg, initSvgPanZoom]);

  // Attach click, double-click, and drag handlers to SVG nodes
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !previewSvg) return;

    const nodes = container.querySelectorAll<SVGElement>('.node');
    const cleanups: Array<() => void> = [];

    nodes.forEach((node) => {
      const nodeId = getNodeId(node);
      if (!nodeId) return;

      // Click handler
      const handleClick = (e: Event) => {
        e.stopPropagation();
        if (isDraggingRef.current) return;
        if (toolMode !== null && toolMode !== 'select' && toolMode !== 'style' && toolMode !== 'connector') return;
        const rect = node.getBoundingClientRect();
        onNodeClick?.(nodeId, rect);
      };

      // Double-click handler
      const handleDblClick = (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
        onNodeDoubleClick?.(nodeId);
      };

      // Drag-to-connect: mousedown on node starts drag
      const handleMouseDown = (e: MouseEvent) => {
        if (toolMode !== null && toolMode !== 'select' && toolMode !== 'style') return;
        e.stopPropagation();
        dragSourceRef.current = nodeId;
        isDraggingRef.current = false;

        const svgEl = container.querySelector<SVGSVGElement>('svg');
        if (!svgEl) return;

        // Create a temporary line in the SVG overlay
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', 'drag-connect-line');
        line.setAttribute('stroke', 'hsl(340, 100%, 44%)');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-dasharray', '8 4');
        line.style.pointerEvents = 'none';

        // Get start position (center of the node in screen coords)
        const nodeRect = node.getBoundingClientRect();
        const viewport = container.querySelector<SVGGElement>('.svg-pan-zoom_viewport');
        if (!viewport) return;

        const vpCTM = viewport.getCTM();
        if (!vpCTM) return;

        // Simpler approach: use screen coordinates for the overlay line
        // Place line as a fixed overlay outside the SVG
        line.setAttribute('x1', String(nodeRect.left + nodeRect.width / 2));
        line.setAttribute('y1', String(nodeRect.top + nodeRect.height / 2));
        line.setAttribute('x2', String(nodeRect.left + nodeRect.width / 2));
        line.setAttribute('y2', String(nodeRect.top + nodeRect.height / 2));

        dragLineRef.current = line;

        // We'll use a screen-space SVG overlay instead
        let overlay = document.getElementById('drag-connect-overlay') as unknown as SVGSVGElement;
        if (!overlay) {
          overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
          overlay.id = 'drag-connect-overlay';
          overlay.style.position = 'fixed';
          overlay.style.top = '0';
          overlay.style.left = '0';
          overlay.style.width = '100%';
          overlay.style.height = '100%';
          overlay.style.pointerEvents = 'none';
          overlay.style.zIndex = '100';
          document.body.appendChild(overlay);
        }
        overlay.appendChild(line);

        const handleMouseMove = (moveE: MouseEvent) => {
          isDraggingRef.current = true;
          if (dragLineRef.current) {
            dragLineRef.current.setAttribute('x2', String(moveE.clientX));
            dragLineRef.current.setAttribute('y2', String(moveE.clientY));
          }
        };

        const handleMouseUp = (upE: MouseEvent) => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);

          // Clean up line
          dragLineRef.current?.remove();
          dragLineRef.current = null;
          const overlayEl = document.getElementById('drag-connect-overlay');
          if (overlayEl && overlayEl.childElementCount === 0) {
            overlayEl.remove();
          }

          if (!isDraggingRef.current || !dragSourceRef.current) {
            dragSourceRef.current = null;
            isDraggingRef.current = false;
            return;
          }

          // Find if we released on a node
          const targetEl = document.elementFromPoint(upE.clientX, upE.clientY);
          const targetNode = targetEl?.closest('.node') as SVGElement | null;
          if (targetNode) {
            const targetId = getNodeId(targetNode);
            if (targetId && targetId !== dragSourceRef.current) {
              onDragConnect?.(dragSourceRef.current, targetId);
            }
          }

          dragSourceRef.current = null;
          // Reset dragging flag after a tick so click handler doesn't fire
          setTimeout(() => { isDraggingRef.current = false; }, 50);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
      };

      node.addEventListener('click', handleClick);
      node.addEventListener('dblclick', handleDblClick);
      node.addEventListener('mousedown', handleMouseDown);
      node.style.cursor = (toolMode === null || toolMode === 'select' || toolMode === 'style' || toolMode === 'connector') ? 'pointer' : 'default';

      cleanups.push(() => {
        node.removeEventListener('click', handleClick);
        node.removeEventListener('dblclick', handleDblClick);
        node.removeEventListener('mousedown', handleMouseDown);
      });
    });

    return () => cleanups.forEach(fn => fn());
  }, [previewSvg, toolMode, onNodeClick, onNodeDoubleClick, onDragConnect]);

  // Highlight selected node
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.querySelectorAll('.node-selection-ring').forEach(el => el.remove());

    if (!selectedNodeId) return;

    const nodes = container.querySelectorAll<SVGElement>('.node');
    nodes.forEach((node) => {
      const dataId = getNodeId(node);

      if (dataId === selectedNodeId) {
        const bbox = (node as any).getBBox?.();
        if (!bbox) return;

        const svgEl = container.querySelector('svg');
        if (!svgEl) return;
        const nodeCTM = (node as SVGGraphicsElement).getCTM();
        if (!nodeCTM) return;

        const viewport = container.querySelector('.svg-pan-zoom_viewport');
        if (!viewport) return;

        const vpCTM = (viewport as SVGGraphicsElement).getCTM();
        if (!vpCTM) return;
        const vpInverse = vpCTM.inverse();

        const svgP1 = (svgEl as SVGSVGElement).createSVGPoint();
        svgP1.x = bbox.x - 4;
        svgP1.y = bbox.y - 4;
        const local1 = svgP1.matrixTransform(nodeCTM).matrixTransform(vpInverse);

        const svgP2 = (svgEl as SVGSVGElement).createSVGPoint();
        svgP2.x = bbox.x + bbox.width + 4;
        svgP2.y = bbox.y + bbox.height + 4;
        const local2 = svgP2.matrixTransform(nodeCTM).matrixTransform(vpInverse);

        const ring = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        ring.setAttribute('class', 'node-selection-ring');
        ring.setAttribute('x', String(local1.x));
        ring.setAttribute('y', String(local1.y));
        ring.setAttribute('width', String(local2.x - local1.x));
        ring.setAttribute('height', String(local2.y - local1.y));
        ring.setAttribute('rx', '6');
        ring.setAttribute('ry', '6');
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', 'hsl(340, 100%, 44%)');
        ring.setAttribute('stroke-width', '2');
        ring.setAttribute('stroke-dasharray', '6 3');
        ring.style.pointerEvents = 'none';

        viewport.appendChild(ring);
      }
    });
  }, [selectedNodeId, previewSvg]);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.node')) return;
    onCanvasClick?.(e);
  }, [onCanvasClick]);

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        cursor: toolMode === 'pan' ? 'grab' : 'default',
        backgroundImage: `radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)`,
        backgroundSize: '24px 24px',
      }}
      onClick={handleCanvasClick}
    >
      {/* Fork: mermaid warning/error blocks are hidden unless VITE_SHOW_MERMAID_WARNINGS=1 */}
      {SHOW_MERMAID_WARNINGS && previewError && !previewSvg && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center p-8 max-w-md">
          <p className="text-sm text-red-500 dark:text-red-400 font-medium mb-2">Diagram Error</p>
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap">{previewError}</pre>
        </div>
      )}

      {SHOW_MERMAID_WARNINGS && previewError && previewSvg && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400 shadow-sm backdrop-blur-sm">
          Syntax error — showing last valid diagram
        </div>
      )}

      {!previewSvg && !previewError && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center p-8">
          <p className="text-sm text-muted-foreground">Write mermaid code to see a preview</p>
        </div>
      )}

      <div
        ref={containerRef}
        className="w-full h-full relative"
        data-mermaid-canvas
        style={{ opacity: ready ? 1 : 0, transition: 'opacity 0.15s ease-in' }}
      />
    </div>
  );
};
