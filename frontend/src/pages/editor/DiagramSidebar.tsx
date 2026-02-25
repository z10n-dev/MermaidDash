import React from 'react';
import { X, FileText, GitFork, Palette } from 'lucide-react';

type DiagramSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  content: string;
};

function detectDiagramType(content: string): string {
  const first = content.trim().split('\n')[0]?.trim().toLowerCase() ?? '';
  if (first.startsWith('flowchart') || first.startsWith('graph')) return 'Flowchart';
  if (first.startsWith('sequencediagram')) return 'Sequence Diagram';
  if (first.startsWith('classdiagram')) return 'Class Diagram';
  if (first.startsWith('statediagram')) return 'State Diagram';
  if (first.startsWith('erdiagram')) return 'Entity Relationship';
  if (first.startsWith('gantt')) return 'Gantt Chart';
  if (first.startsWith('pie')) return 'Pie Chart';
  if (first.startsWith('gitgraph')) return 'Git Graph';
  if (first.startsWith('mindmap')) return 'Mindmap';
  if (first.startsWith('timeline')) return 'Timeline';
  return 'Unknown';
}

function countNodes(content: string): number {
  // Count unique node IDs (rough heuristic)
  const nodePattern = /^\s*(\w+)[\[\(\{<>]/gm;
  const ids = new Set<string>();
  let match;
  while ((match = nodePattern.exec(content)) !== null) {
    ids.add(match[1]);
  }
  return ids.size;
}

function countEdges(content: string): number {
  const edgePattern = /-->|---|-\.->|==>|-->/g;
  return (content.match(edgePattern) || []).length;
}

export const DiagramSidebar: React.FC<DiagramSidebarProps> = ({
  isOpen,
  onClose,
  content,
}) => {
  if (!isOpen) return null;

  const diagramType = detectDiagramType(content);
  const nodeCount = countNodes(content);
  const edgeCount = countEdges(content);
  const lineCount = content.split('\n').length;

  return (
    <div className="absolute top-4 right-4 z-30 w-64 rounded-2xl bg-white dark:bg-neutral-900 border border-border shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-sm font-semibold text-foreground">Diagram Info</span>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="p-3 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-muted">
            <FileText size={14} className="text-muted-foreground" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Type</div>
            <div className="text-sm font-medium text-foreground">{diagramType}</div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-muted">
            <GitFork size={14} className="text-muted-foreground" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Structure</div>
            <div className="text-sm font-medium text-foreground">
              {nodeCount} nodes, {edgeCount} edges
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-muted">
            <Palette size={14} className="text-muted-foreground" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Code</div>
            <div className="text-sm font-medium text-foreground">{lineCount} lines</div>
          </div>
        </div>
      </div>
    </div>
  );
};
