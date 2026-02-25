import React, { useState } from 'react';
import {
  Hand, Palette, Paintbrush,
  Shapes, Diamond, Image, ALargeSmall, AppWindow,
  ChevronDown, Network, Sparkles, Check,
} from 'lucide-react';
import type { ToolMode } from './useCanvasInteraction';

export const MERMAID_LOOKS = [
  { value: 'classic', label: 'Classic' },
  { value: 'handDrawn', label: 'Hand Drawn' },
] as const;

export type MermaidLook = typeof MERMAID_LOOKS[number]['value'];

export const MERMAID_THEMES = [
  { value: 'mc', label: 'Mermaid Chart' },
  { value: 'neo', label: 'Neo' },
  { value: 'neo-dark', label: 'Neo Dark' },
  { value: 'default', label: 'Default' },
  { value: 'forest', label: 'Forest' },
  { value: 'base', label: 'Base' },
  { value: 'dark', label: 'Dark' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'redux', label: 'Redux' },
  { value: 'redux-dark', label: 'Redux Dark' },
] as const;

export type MermaidTheme = typeof MERMAID_THEMES[number]['value'];

type TopToolbarProps = {
  toolMode: ToolMode;
  onToolModeChange: (mode: NonNullable<ToolMode>) => void;
  currentTheme: MermaidTheme | null;
  onThemeChange: (theme: MermaidTheme) => void;
  currentLook: MermaidLook | null;
  onLookChange: (look: MermaidLook) => void;
  onAddNote: () => void;
  onInsertImage: () => void;
  onPresentation: () => void;
  onLayoutChange: (direction: string) => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  onToggleAi: () => void;
  aiOpen: boolean;
};

const LAYOUT_OPTIONS = [
  { value: 'TD', label: 'Top → Down' },
  { value: 'LR', label: 'Left → Right' },
  { value: 'RL', label: 'Right → Left' },
  { value: 'BT', label: 'Bottom → Top' },
];

export const TopToolbar: React.FC<TopToolbarProps> = ({
  toolMode,
  onToolModeChange,
  currentTheme,
  onThemeChange,
  currentLook,
  onLookChange,
  onAddNote,
  onInsertImage,
  onPresentation,
  onLayoutChange,
  onToggleSidebar,
  sidebarOpen,
  onToggleAi,
  aiOpen,
}) => {
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showLookMenu, setShowLookMenu] = useState(false);

  const toolButton = (
    id: string,
    icon: React.ReactNode,
    label: string,
    opts: { mode?: NonNullable<ToolMode>; onClick?: () => void; active?: boolean },
  ) => {
    const isActive = opts.active ?? (opts.mode && opts.mode === toolMode);
    return (
      <button
        key={id}
        onClick={() => {
          if (opts.mode) onToolModeChange(opts.mode);
          opts.onClick?.();
        }}
        title={label}
        className={`
          relative p-2.5 rounded-xl transition-all
          ${isActive
            ? 'bg-accent text-white shadow-sm'
            : 'text-foreground hover:bg-muted'
          }
        `}
      >
        {icon}
      </button>
    );
  };

  const group = (children: React.ReactNode) => (
    <div className="flex items-center gap-0.5 px-1 py-1 rounded-2xl bg-muted/50">
      {children}
    </div>
  );

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
      <div className="flex items-center gap-2 px-2 py-2 rounded-2xl bg-white dark:bg-neutral-900 border border-border shadow-lg">
        {/* Group 1: Navigation & styling */}
        {group(<>
          {toolButton('pan', <Hand size={20} />, 'Pan (drag to move canvas)', { mode: 'pan' })}
          <div className="w-px h-6 bg-border" />
          <div className="relative">
            <button
              title="Theme"
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className={`relative p-2.5 rounded-xl transition-all ${
                showThemeMenu
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-foreground hover:bg-muted'
              }`}
            >
              <Palette size={20} />
            </button>
            {showThemeMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowThemeMenu(false)} />
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 w-48 rounded-xl bg-white dark:bg-neutral-900 border border-border shadow-xl overflow-hidden py-1">
                  <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Themes
                  </div>
                  {MERMAID_THEMES.map((theme) => (
                    <button
                      key={theme.value}
                      onClick={() => {
                        onThemeChange(theme.value);
                        setShowThemeMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors flex items-center justify-between"
                    >
                      {theme.label}
                      {currentTheme === theme.value && <Check size={16} className="text-accent" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="relative">
            <button
              title="Look"
              onClick={() => setShowLookMenu(!showLookMenu)}
              className={`relative p-2.5 rounded-xl transition-all ${
                showLookMenu
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-foreground hover:bg-muted'
              }`}
            >
              <Paintbrush size={20} />
            </button>
            {showLookMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowLookMenu(false)} />
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 w-48 rounded-xl bg-white dark:bg-neutral-900 border border-border shadow-xl overflow-hidden py-1">
                  <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Look
                  </div>
                  {MERMAID_LOOKS.map((look) => (
                    <button
                      key={look.value}
                      onClick={() => {
                        onLookChange(look.value);
                        setShowLookMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors flex items-center justify-between"
                    >
                      {look.label}
                      {currentLook === look.value && <Check size={16} className="text-accent" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </>)}

        {/* Group 2: Creation tools */}
        {group(<>
          {toolButton('add-node', <Shapes size={20} />, 'Add shape', { mode: 'add-node' })}
          {toolButton('connector', <Diamond size={20} />, 'Add connection', { mode: 'connector' })}
          {toolButton('image', <Image size={20} />, 'Insert image', { onClick: onInsertImage })}
          {toolButton('text', <ALargeSmall size={20} />, 'Add text', { mode: 'text' })}
          {toolButton('present', <AppWindow size={20} />, 'Presentation mode', { onClick: onPresentation })}
        </>)}

        {/* Group 3: Insert menu & layout */}
        {group(<>
          <div className="relative">
            <button
              title="More options"
              onClick={() => setShowInsertMenu(!showInsertMenu)}
              className="relative p-2.5 rounded-xl transition-all text-foreground hover:bg-muted"
            >
              <ChevronDown size={20} />
            </button>

            {showInsertMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowInsertMenu(false)} />
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 w-48 rounded-xl bg-white dark:bg-neutral-900 border border-border shadow-xl overflow-hidden py-1">
                  <button
                    onClick={() => { onAddNote(); setShowInsertMenu(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    Add note
                  </button>
                  <div className="h-px bg-border mx-2 my-1" />
                  {LAYOUT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        onLayoutChange(opt.value);
                        setShowInsertMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      Layout: {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            title="Toggle diagram info"
            onClick={onToggleSidebar}
            className={`p-2.5 rounded-xl transition-all ${
              sidebarOpen
                ? 'bg-accent text-white shadow-sm'
                : 'text-foreground hover:bg-muted'
            }`}
          >
            <Network size={20} />
          </button>
        </>)}

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
      </div>
    </div>
  );
};
