import React, { useCallback } from 'react';
import {
  Undo2, Redo2,
  ZoomIn, ZoomOut, Scan, Maximize,
  Code2,
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
  canUndo, canRedo, onUndo, onRedo,
  zoomLevel, onZoomIn, onZoomOut, onFitToScreen,
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

      {/* Right: Undo/Redo + Zoom + Fullscreen */}
      <div className="pointer-events-auto flex items-center gap-1 px-1.5 py-1.5 rounded-xl bg-white dark:bg-neutral-900 border border-border shadow-lg">
        <button onClick={onUndo} disabled={!canUndo} title="Undo"
          className={`p-2 rounded-lg transition-colors ${canUndo ? 'text-muted-foreground hover:bg-muted hover:text-foreground' : 'text-muted-foreground/30 cursor-not-allowed'}`}>
          <Undo2 size={16} />
        </button>
        <button onClick={onRedo} disabled={!canRedo} title="Redo"
          className={`p-2 rounded-lg transition-colors ${canRedo ? 'text-muted-foreground hover:bg-muted hover:text-foreground' : 'text-muted-foreground/30 cursor-not-allowed'}`}>
          <Redo2 size={16} />
        </button>
        <div className="w-px h-5 bg-border mx-0.5" />
        <button onClick={onZoomOut} title="Zoom out" className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <ZoomOut size={16} />
        </button>
        <span className="text-xs text-muted-foreground font-medium w-10 text-center tabular-nums">{zoomPercent}%</span>
        <button onClick={onZoomIn} title="Zoom in" className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <ZoomIn size={16} />
        </button>
        <button onClick={onFitToScreen} title="Fit to screen" className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <Scan size={16} />
        </button>
        <div className="w-px h-5 bg-border mx-0.5" />
        <button onClick={toggleFullscreen} title="Fullscreen" className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <Maximize size={16} />
        </button>
      </div>
    </div>
  );
};
