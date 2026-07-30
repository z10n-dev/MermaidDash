import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Loader2, Share2, Sparkles } from 'lucide-react';
import mermaid from 'mermaid';
import debounce from 'lodash/debounce';
import { Toaster, toast } from 'sonner';
import { io, type Socket } from 'socket.io-client';
import type { UserIdentity } from '../utils/identity';
import type { Drawing } from '../types';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { useTheme } from '../context/ThemeContext';
import { useEditorChrome } from './editor/useEditorChrome';
import { useEditorIdentity } from './editor/useEditorIdentity';
import { ShareModal } from '../components/ShareModal';
import { EditorCanvas } from './editor/EditorCanvas';
import { CodePanel } from './editor/CodePanel';
import { TopToolbar, type MermaidTheme, type MermaidLook } from './editor/TopToolbar';
import { BottomBar } from './editor/BottomBar';
import { NodeContextToolbar } from './editor/NodeContextToolbar';
import { ShapePicker } from './editor/ShapePicker';
import { ColorPicker } from './editor/ColorPicker';
import { SnippetsPicker } from './editor/SnippetsPicker';
import { DiagramSidebar } from './editor/DiagramSidebar';
import { AiChatPanel } from './editor/AiChatPanel';
import { useCanvasInteraction } from './editor/useCanvasInteraction';
import { useUndoRedo } from './editor/useUndoRedo';
import { useNodeSelection } from './editor/useNodeSelection';
import { ensureSvgHasStyles, hasFrontmatterTheme } from '../utils/previewSvg';
import { getProvider } from '../services/ai/provider';
import { svgToPngDataUrl } from '../utils/exportUtils';

interface Peer extends UserIdentity {
  isActive: boolean;
}

const DEFAULT_MERMAID_CONTENT = `graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Do something]
    B -->|No| D[Do something else]
    C --> E[End]
    D --> E
`;

const MERMAID_RENDER_DEBOUNCE_MS = 300;
const AUTO_SAVE_DEBOUNCE_MS = 1000;

export const Editor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();
  const { user } = useAuth();

  const [accessLevel, setAccessLevel] = useState<"none" | "view" | "edit" | "owner">("none");
  const canEdit = accessLevel === "edit" || accessLevel === "owner";

  const [drawingName, setDrawingName] = useState('Untitled Drawing');
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [collectionName, setCollectionName] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [previewSvg, setPreviewSvg] = useState<string>('');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isShareOpen, setIsShareOpen] = useState(false);

  // Visual editor state
  const [codePanelOpen, setCodePanelOpen] = useState(true);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [showShapePicker, setShowShapePicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSnippets, setShowSnippets] = useState(false);
  const [pickerPosition, setPickerPosition] = useState({ x: 0, y: 0 });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [connectorSource, setConnectorSource] = useState<string | null>(null);

  const [peers, setPeers] = useState<Peer[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const socketMeRef = useRef<UserIdentity | null>(null);
  const lastPresenceUsersRef = useRef<Peer[] | null>(null);

  const currentVersionRef = useRef<number | null>(null);
  const contentRef = useRef(content);
  const renderCounterRef = useRef(0);
  const previewSvgRef = useRef(previewSvg);
  const isRemoteUpdateRef = useRef(false);

  const me = useEditorIdentity(user);

  const { isHeaderVisible } = useEditorChrome({
    drawingName,
    autoHideEnabled: false,
    isRenaming,
  });

  // Visual editor hooks
  const { pushState, undo, redo, canUndo, canRedo } = useUndoRedo(content);

  const {
    toolMode, setToolMode, zoomLevel,
    zoomIn, zoomOut, fitToScreen, initSvgPanZoom,
  } = useCanvasInteraction();

  // Keep refs in sync
  useEffect(() => {
    contentRef.current = content;
  }, [content]);
  useEffect(() => {
    previewSvgRef.current = previewSvg;
  }, [previewSvg]);

  // Initialize socketMe
  useEffect(() => {
    socketMeRef.current = me;
  }, [me]);

  // Initialize mermaid
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: theme === 'dark' ? 'dark' : 'default',
      securityLevel: 'loose',
    });
  }, [theme]);

  // Mermaid rendering
  const renderMermaidPreview = useCallback(async (mermaidContent: string) => {
    if (!mermaidContent.trim()) {
      setPreviewSvg('');
      setPreviewError(null);
      return;
    }

    const renderCount = ++renderCounterRef.current;

    try {
      // Only set a default theme if the content doesn't specify one in frontmatter
      const frontmatterTheme = hasFrontmatterTheme(mermaidContent);
      mermaid.initialize({
        startOnLoad: false,
        ...(!frontmatterTheme && { theme: theme === 'dark' ? 'dark' : 'default' }),
        securityLevel: 'loose',
      });

      const containerId = `mermaid-preview-${renderCount}`;
      const { svg } = await mermaid.render(containerId, mermaidContent);

      if (renderCount === renderCounterRef.current) {
        // Mermaid v11 only embeds <style> on the first render for a given ID.
        // Ensure styles are always present so the SVG is self-contained for
        // export and dashboard preview.
        setPreviewSvg(ensureSvgHasStyles(svg));
        setPreviewError(null);
      }
    } catch (e: any) {
      if (renderCount === renderCounterRef.current) {
        setPreviewError(e?.message || 'Failed to render diagram');
      }
    }
  }, [theme]);

  // Re-render preview when theme changes
  useEffect(() => {
    if (contentRef.current) {
      renderMermaidPreview(contentRef.current);
    }
  }, [theme, renderMermaidPreview]);

  // Debounced mermaid render
  const debouncedRender = useMemo(
    () => debounce((c: string) => renderMermaidPreview(c), MERMAID_RENDER_DEBOUNCE_MS),
    [renderMermaidPreview]
  );

  // Save function
  const saveDrawing = useCallback(async (drawingContent: string) => {
    if (!id || !canEdit) return;

    setIsSaving(true);
    try {
      // Convert the live SVG preview to a PNG data URL for the dashboard thumbnail.
      // This avoids SVG sanitization stripping mermaid's <style> elements.
      const currentPreview = previewSvgRef.current;
      const preview = currentPreview ? await svgToPngDataUrl(currentPreview) ?? undefined : undefined;

      const data: Partial<Drawing> = {
        content: drawingContent,
      };
      if (preview) data.preview = preview;
      if (currentVersionRef.current !== null) {
        data.version = currentVersionRef.current;
      }

      const result = await api.updateDrawing(id, data);
      if (typeof result.version === 'number') {
        currentVersionRef.current = result.version;
      }
      setLastSavedAt(new Date());
      setIsSaving(false);
    } catch (err: any) {
      setIsSaving(false);
      if (api.isAxiosError(err) && err.response?.status === 409) {
        toast.error('Drawing changed in another tab. Refresh to load latest.');
        const reportedVersion = Number(err.response?.data?.currentVersion);
        if (Number.isInteger(reportedVersion) && reportedVersion > 0) {
          currentVersionRef.current = reportedVersion;
        }
        return;
      }
      console.error('Failed to save drawing', err);
      toast.error('Failed to save changes');
    }
  }, [id, canEdit]);

  // Debounced auto-save
  const debouncedSave = useMemo(
    () => debounce((c: string) => saveDrawing(c), AUTO_SAVE_DEBOUNCE_MS),
    [saveDrawing]
  );

  const debouncedRenderRef = useRef(debouncedRender);
  useEffect(() => { debouncedRenderRef.current = debouncedRender; }, [debouncedRender]);

  // Cleanup debounced functions
  useEffect(() => {
    return () => {
      debouncedRender.cancel();
      debouncedSave.cancel();
    };
  }, [debouncedRender, debouncedSave]);

  // Handle content change (from code editor — debounced render)
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

  // Handle content change from toolbar actions — immediate render
  const handleContentChangeImmediate = useCallback((value: string) => {
    setContent(value);
    pushState(value);
    renderMermaidPreview(value);
    if (canEdit) {
      debouncedSave(value);
    }
    if (!isRemoteUpdateRef.current && socketRef.current && id) {
      socketRef.current.emit('content-update', { drawingId: id, content: value });
    }
  }, [renderMermaidPreview, debouncedSave, canEdit, id, pushState]);

  // Parse current theme/look from frontmatter
  const currentTheme = useMemo<MermaidTheme | null>(() => {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) return null;
    const themeMatch = match[1].match(/theme:\s*(\S+)/);
    return (themeMatch?.[1] as MermaidTheme) ?? null;
  }, [content]);

  const currentLook = useMemo<MermaidLook | null>(() => {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) return null;
    const lookMatch = match[1].match(/look:\s*(\S+)/);
    return (lookMatch?.[1] as MermaidLook) ?? null;
  }, [content]);

  const setFrontmatterField = useCallback((key: string, value: string) => {
    const c = contentRef.current;
    const frontmatterMatch = c.match(/^---\s*\n([\s\S]*?)\n---/);
    const keyRegex = new RegExp(`^(\\s*)${key}:\\s*\\S+`, 'm');

    if (frontmatterMatch) {
      const fm = frontmatterMatch[1];
      let newFm: string;
      if (keyRegex.test(fm)) {
        newFm = fm.replace(keyRegex, `$1${key}: ${value}`);
      } else {
        const configMatch = fm.match(/^(\s*)config:\s*$/m);
        if (configMatch) {
          newFm = fm.replace(/^(\s*config:\s*)$/m, `$1\n$1  ${key}: ${value}`);
        } else {
          newFm = fm.trimEnd() + `\n  config:\n    ${key}: ${value}`;
        }
      }
      return c.replace(/^---\s*\n[\s\S]*?\n---/, `---\n${newFm}\n---`);
    }
    return `---\nconfig:\n  ${key}: ${value}\n---\n${c}`;
  }, []);

  const handleThemeChange = useCallback((theme: MermaidTheme) => {
    handleContentChangeImmediate(setFrontmatterField('theme', theme));
  }, [handleContentChangeImmediate, setFrontmatterField]);

  const handleLookChange = useCallback((look: MermaidLook) => {
    handleContentChangeImmediate(setFrontmatterField('look', look));
  }, [handleContentChangeImmediate, setFrontmatterField]);

  // Node selection (depends on handleContentChange)
  const {
    selectedNode, selectNode, deselectNode,
    changeNodeColor, changeNodeShape, deleteNode, duplicateNode,
  } = useNodeSelection(content, (newContent) => {
    handleContentChange(newContent);
  });

  // Undo/redo handlers
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

  // Toolbar action handlers
  const nextNodeId = useCallback(() => {
    const c = contentRef.current;
    const existing = c.match(/\b([A-Z])[\[\(\{<]/g) || [];
    const usedLetters = new Set(existing.map(m => m[0]));
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i);
      if (!usedLetters.has(letter)) return letter;
    }
    return `N${Date.now().toString(36).slice(-3)}`;
  }, []);

  const handleAddNodeOnCanvas = useCallback(() => {
    const text = prompt('Node label:', 'New Node');
    if (!text) {
      setToolMode(null);
      return;
    }
    const nodeId = nextNodeId();
    const newNode = `    ${nodeId}[${text}]`;
    const lines = contentRef.current.split('\n');
    const insertIndex = Math.max(lines.length - 1, 1);
    lines.splice(insertIndex, 0, newNode);
    handleContentChangeImmediate(lines.join('\n'));
    toast.success(`Added node "${text}"`);
    setToolMode(null);
  }, [nextNodeId, handleContentChangeImmediate, setToolMode]);

  const handleConnectorNodeClick = useCallback((nodeId: string) => {
    if (!connectorSource) {
      setConnectorSource(nodeId);
      toast('Select target node', { description: `Source: ${nodeId}` });
    } else {
      const edge = `    ${connectorSource} --> ${nodeId}`;
      const newContent = contentRef.current.trimEnd() + '\n' + edge + '\n';
      handleContentChangeImmediate(newContent);
      toast.success(`Connected ${connectorSource} → ${nodeId}`);
      setConnectorSource(null);
      setToolMode(null);
    }
  }, [connectorSource, handleContentChangeImmediate, setToolMode]);

  const handleAddTextOnCanvas = useCallback(() => {
    const text = prompt('Enter text:');
    if (!text) {
      setToolMode(null);
      return;
    }
    const nodeId = nextNodeId();
    const newNode = `    ${nodeId}["${text}"]`;
    const lines = contentRef.current.split('\n');
    const insertIndex = Math.max(lines.length - 1, 1);
    lines.splice(insertIndex, 0, newNode);
    handleContentChangeImmediate(lines.join('\n'));
    toast.success(`Added text node`);
    setToolMode(null);
  }, [nextNodeId, handleContentChangeImmediate, setToolMode]);

  const handleAddNote = useCallback(() => {
    const lines = contentRef.current.split('\n');
    const firstLine = lines[0]?.trim().toLowerCase() ?? '';
    if (firstLine.startsWith('sequencediagram')) {
      const noteText = `Note right of ${nextNodeId()}: Add your note here`;
      lines.push(`    ${noteText}`);
      handleContentChangeImmediate(lines.join('\n'));
      toast.success('Added note annotation');
    } else {
      const nodeId = nextNodeId();
      const note = `    ${nodeId}["Note: Add text here"]:::noteStyle`;
      const styleDef = `    classDef noteStyle fill:#fef3c7,stroke:#f59e0b,color:#92400e`;
      const hasClassDef = lines.some(l => l.includes('classDef noteStyle'));
      const insertIndex = Math.max(lines.length - 1, 1);
      lines.splice(insertIndex, 0, note);
      if (!hasClassDef) lines.push(styleDef);
      handleContentChangeImmediate(lines.join('\n'));
      toast.success('Added note node');
    }
  }, [nextNodeId, handleContentChangeImmediate]);

  const handleInsertImage = useCallback(() => {
    toast.info('Images are embedded as linked nodes in Mermaid', {
      description: 'Add click events to link to external images',
    });
    const nodeId = nextNodeId();
    const imgNode = `    ${nodeId}[Image]`;
    const clickDef = `    click ${nodeId} "https://example.com/image.png" _blank`;
    const newContent = contentRef.current.trimEnd() + '\n' + imgNode + '\n' + clickDef + '\n';
    handleContentChangeImmediate(newContent);
  }, [nextNodeId, handleContentChangeImmediate]);

  const handlePresentation = useCallback(() => {
    setPresentationMode(prev => !prev);
  }, []);

  // Double-click to edit node label
  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    const c = contentRef.current;
    // Match node definitions like: nodeId[label], nodeId(label), nodeId{label}, nodeId["label"]
    const nodeRegex = new RegExp(
      `(\\b${nodeId}\\s*)(\\[\\[|\\[\\(|\\["|\\[|\\(\\[|\\(\\(|\\(|\\{\\{|\\{|>)([^\\]\\)\\}>]*?)(\\]\\]|\\)\\]|"\\]|\\]|\\]\\)|\\)\\)|\\)|\\}\\}|\\}|\\])`,
    );
    const match = c.match(nodeRegex);
    if (!match) {
      toast.error(`Could not find node "${nodeId}" in code`);
      return;
    }
    const currentLabel = match[3];
    const newLabel = prompt('Edit node label:', currentLabel);
    if (newLabel === null || newLabel === currentLabel) return;
    const newContent = c.replace(nodeRegex, `$1$2${newLabel}$4`);
    handleContentChangeImmediate(newContent);
    toast.success(`Updated label to "${newLabel}"`);
  }, [handleContentChangeImmediate]);

  // Drag-to-connect: add edge between two nodes
  const handleDragConnect = useCallback((sourceId: string, targetId: string) => {
    const edge = `    ${sourceId} --> ${targetId}`;
    const newContent = contentRef.current.trimEnd() + '\n' + edge + '\n';
    handleContentChangeImmediate(newContent);
    toast.success(`Connected ${sourceId} → ${targetId}`);
  }, [handleContentChangeImmediate]);

  const handleLayoutChange = useCallback((direction: string) => {
    const lines = contentRef.current.split('\n');
    const firstLine = lines[0] ?? '';
    const directionRegex = /^(\s*(?:graph|flowchart)\s+)(TD|TB|BT|LR|RL)/i;
    if (directionRegex.test(firstLine)) {
      lines[0] = firstLine.replace(directionRegex, `$1${direction}`);
    } else if (/^\s*(graph|flowchart)\s*$/i.test(firstLine)) {
      lines[0] = `${firstLine.trimEnd()} ${direction}`;
    }
    handleContentChangeImmediate(lines.join('\n'));
    toast.success(`Layout changed to ${direction}`);
  }, [handleContentChangeImmediate]);

  // Load drawing on mount
  useEffect(() => {
    if (!id) {
      setContent(DEFAULT_MERMAID_CONTENT);
      setIsLoading(false);
      renderMermaidPreview(DEFAULT_MERMAID_CONTENT);
      return;
    }

    const loadData = async () => {
      try {
        const [data, collections] = await Promise.all([
          api.getDrawing(id),
          api.getCollections(),
        ]);
        setDrawingName(data.name);
        setCollectionId(data.collectionId);
        if (data.collectionId) {
          const col = collections.find(c => c.id === data.collectionId);
          setCollectionName(col?.name ?? null);
        } else {
          setCollectionName(null);
        }
        setAccessLevel(
          data.accessLevel === "view" || data.accessLevel === "edit" || data.accessLevel === "owner"
            ? data.accessLevel
            : "owner"
        );

        const drawingContent = data.content || DEFAULT_MERMAID_CONTENT;
        setContent(drawingContent);
        currentVersionRef.current = typeof data.version === 'number' ? data.version : null;

        await renderMermaidPreview(drawingContent);
      } catch (err) {
        console.error('Failed to load drawing', err);
        let message = 'Failed to load drawing';
        if (api.isAxiosError(err)) {
          const responseMessage =
            typeof err.response?.data?.message === 'string'
              ? err.response.data.message
              : null;
          if (responseMessage) {
            message = responseMessage;
          } else if (err.response?.status === 403) {
            message = 'You do not have access to this drawing';
          } else if (err.response?.status === 404) {
            message = 'Drawing not found';
          }

          if (err.response?.status === 403 && id && location.pathname.startsWith('/editor/')) {
            navigate(`/shared/${id}${location.search}${location.hash}`, { replace: true });
            return;
          }
        }
        toast.error(message);
        setLoadError(message);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [id, navigate, location.pathname, location.search, location.hash, renderMermaidPreview]);

  // Socket.IO connection for presence
  useEffect(() => {
    if (!id) return;

    const socketUrl = import.meta.env.VITE_API_URL === '/api'
      ? window.location.origin
      : (import.meta.env.VITE_API_URL || 'http://localhost:8000');

    const socket = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.emit('join-room', { drawingId: id, user: me }, (payload: any) => {
      const serverUser = payload?.user;
      if (!serverUser || typeof serverUser.id !== 'string') return;
      const next: UserIdentity = {
        id: serverUser.id,
        name: typeof serverUser.name === 'string' ? serverUser.name : me.name,
        initials: typeof serverUser.initials === 'string' ? serverUser.initials : me.initials,
        color: typeof serverUser.color === 'string' ? serverUser.color : me.color,
      };
      socketMeRef.current = next;
      const lastUsers = lastPresenceUsersRef.current;
      if (lastUsers) {
        setPeers(lastUsers.filter((u) => u.id !== next.id));
      }
    });

    socket.on('presence-update', (users: Peer[]) => {
      lastPresenceUsersRef.current = users;
      const selfId = socketMeRef.current?.id ?? me.id;
      setPeers(users.filter(u => u.id !== selfId));
    });

    socket.on('content-update', (data: { drawingId: string; content: string }) => {
      if (data.drawingId !== id) return;
      isRemoteUpdateRef.current = true;
      setContent(data.content);
      contentRef.current = data.content;
      debouncedRenderRef.current(data.content);
      isRemoteUpdateRef.current = false;
    });

    socket.on('error', (payload: any) => {
      const message = typeof payload?.message === 'string' ? payload.message : null;
      console.warn('[Editor] Socket error:', payload);
      if (
        message === 'You do not have access to this drawing' &&
        id &&
        location.pathname.startsWith('/editor/')
      ) {
        navigate(`/shared/${id}${location.search}${location.hash}`, { replace: true });
        return;
      }
      if (message) toast.error(message);
    });

    return () => {
      socket.off('presence-update');
      socket.off('content-update');
      socket.off('error');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [id, me, navigate, location.pathname, location.search, location.hash]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      // Redo
      if ((e.metaKey || e.ctrlKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        e.preventDefault();
        handleRedo();
        return;
      }
      // Escape exits presentation mode or cancels connector
      if (e.key === 'Escape') {
        if (presentationMode) {
          setPresentationMode(false);
          return;
        }
        if (connectorSource) {
          setConnectorSource(null);
          toast.dismiss();
          return;
        }
      }
      // Save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (!canEdit || !id) return;
        debouncedSave.cancel();
        await saveDrawing(contentRef.current);
        toast.success('Saved changes to server');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canEdit, id, saveDrawing, debouncedSave, handleUndo, handleRedo, presentationMode, connectorSource]);

  // Rename handling
  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (newName.trim() && id) {
      setDrawingName(newName);
      setIsRenaming(false);
      try {
        await api.updateDrawing(id, { name: newName } as any);
      } catch (err) {
        console.error('Failed to rename', err);
      }
    }
  };

  const handleRenameBlur = () => {
    if (newName.trim() && id && canEdit) {
      setDrawingName(newName);
      setIsRenaming(false);
      api.updateDrawing(id, { name: newName } as any).catch((err) => {
        console.error('Failed to rename', err);
      });
    } else {
      setIsRenaming(false);
    }
  };

  const [aiConfigured, setAiConfigured] = useState(false);
  const [isSuggestingName, setIsSuggestingName] = useState(false);

  useEffect(() => {
    api.getAiSettings().then(s => setAiConfigured(s.configured)).catch(() => {});
  }, []);

  const handleSuggestName = useCallback(async () => {
    if (!canEdit || !id || isSuggestingName) return;
    const code = contentRef.current?.trim();
    if (!code) return;

    setIsSuggestingName(true);
    try {
      const config = await api.getAiSettingsKey();
      if (!config.apiKey) {
        toast.error('No AI API key configured. Set one in Profile settings.');
        return;
      }

      const provider = getProvider(config.provider || 'openai');
      let name = '';
      for await (const chunk of provider.chat(
        [{ role: 'user', content: 'Give me a short, descriptive name (max 5 words, no quotes) for this diagram. Reply with ONLY the name, nothing else.' }],
        code,
        config.apiKey,
        config.model || 'gpt-5-mini',
      )) {
        name += chunk;
      }

      name = name.trim().replace(/^["']|["']$/g, '');
      if (name) {
        setNewName(name);
        setIsRenaming(true);
      }
    } catch (err) {
      console.error('Failed to suggest name', err);
      toast.error('Failed to suggest a name');
    } finally {
      setIsSuggestingName(false);
    }
  }, [canEdit, id, isSuggestingName]);

  // Back button with save
  const handleBackClick = async () => {
    if (canEdit && id) {
      debouncedSave.cancel();
      try {
        await saveDrawing(contentRef.current);
      } catch {
        // Best effort
      }
    }
    navigate('/');
  };

  // Save status indicator text
  const saveStatusText = isSaving
    ? 'Saving...'
    : lastSavedAt
      ? `Saved ${lastSavedAt.toLocaleTimeString()}`
      : '';

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white dark:bg-neutral-950">
        <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
          <Loader2 className="animate-spin" size={20} />
          <span className="text-sm font-medium">Loading drawing...</span>
        </div>
        <Toaster position="bottom-center" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-white dark:bg-neutral-950 px-6">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Unable to open drawing
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {loadError}
          </p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 rounded-lg border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100 font-semibold hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
        >
          Back to dashboard
        </button>
        <Toaster position="bottom-center" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top bar */}
      {!presentationMode && <header
        className={`h-14 bg-white dark:bg-neutral-900 border-b border-border flex items-center px-4 justify-between z-30 shrink-0 transition-transform duration-300 ${
          isHeaderVisible ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackClick}
            className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-full text-gray-600 dark:text-gray-300 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>

          <div className="flex items-center gap-1.5 text-sm min-w-0">
            <button
              onClick={() => navigate('/')}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors shrink-0"
            >
              Projects
            </button>
            <span className="text-gray-300 dark:text-gray-600 shrink-0">/</span>
            {collectionName && collectionId && (
              <>
                <button
                  onClick={() => navigate(`/collections?id=${collectionId}`)}
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors truncate max-w-[150px]"
                  title={collectionName}
                >
                  {collectionName}
                </button>
                <span className="text-gray-300 dark:text-gray-600 shrink-0">/</span>
              </>
            )}

            {isRenaming ? (
              <form onSubmit={handleRenameSubmit}>
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onBlur={handleRenameBlur}
                  className="font-medium text-gray-900 dark:text-white bg-transparent px-2 py-1 border-2 border-accent rounded-md outline-none min-w-[200px]"
                  style={{ width: `${Math.max(200, newName.length * 9 + 20)}px` }}
                />
              </form>
            ) : (
              <h1
                className="font-medium text-gray-900 dark:text-white px-1 py-0.5 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded cursor-text truncate max-w-[300px]"
                onDoubleClick={() => {
                  if (!canEdit) return;
                  setNewName(drawingName);
                  setIsRenaming(true);
                }}
                title={drawingName}
              >
                {drawingName}
              </h1>
            )}

            {aiConfigured && canEdit && (
              <button
                onClick={handleSuggestName}
                disabled={isSuggestingName}
                className="p-1 text-gray-400 hover:text-accent dark:text-gray-500 dark:hover:text-accent transition-colors shrink-0 disabled:opacity-50"
                title="Suggest name with AI"
              >
                {isSuggestingName ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              </button>
            )}
          </div>

          {saveStatusText && (
            <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
              {isSaving && <Loader2 size={12} className="inline animate-spin mr-1" />}
              {saveStatusText}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {!canEdit && (
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200 border border-amber-200 dark:border-amber-800">
              Read-only
            </span>
          )}

          {accessLevel === 'owner' && id && (
            <button
              onClick={() => setIsShareOpen(true)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg text-gray-600 dark:text-gray-300 transition-colors"
              title="Share"
            >
              <Share2 size={20} />
            </button>
          )}

          <div className="h-6 w-px bg-gray-300 dark:bg-gray-700" />

          {/* User avatars */}
          <div className="flex items-center">
            <div className="relative group">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white shadow-sm"
                style={{ backgroundColor: me.color }}
              >
                {me.initials}
              </div>
              <div className="absolute top-full mt-2 right-0 bg-gray-900 text-white text-xs py-1 px-2 rounded whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                {me.name} (You)
              </div>
            </div>

            {peers.length > 0 && (
              <>
                <div className="h-6 w-px bg-gray-300 dark:bg-gray-700 mx-2" />
                <div className="flex items-center gap-1">
                  {peers.map(peer => (
                    <div key={peer.id} className="relative group">
                      <div
                        data-testid="collaborator-avatar"
                        className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white shadow-sm transition-all duration-300 ${
                          !peer.isActive ? 'opacity-30 grayscale' : ''
                        }`}
                        style={{ backgroundColor: peer.color }}
                      >
                        {peer.initials}
                      </div>
                      <div className="absolute top-full mt-2 right-0 bg-gray-900 text-white text-xs py-1 px-2 rounded whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                        {peer.name}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>}

      {/* Main canvas area */}
      <div className="flex-1 relative overflow-hidden">
        {/* Canvas background with Mermaid SVG */}
        <EditorCanvas
          previewSvg={previewSvg}
          previewError={previewError}
          toolMode={toolMode}
          initSvgPanZoom={initSvgPanZoom}
          onNodeClick={(nodeId, rect) => {
            if (toolMode === 'connector') {
              handleConnectorNodeClick(nodeId);
            } else if (toolMode === 'style') {
              selectNode(nodeId, rect);
              setPickerPosition({
                x: rect.left + rect.width / 2,
                y: rect.bottom + 8,
              });
              setShowColorPicker(true);
              setShowShapePicker(false);
            } else {
              selectNode(nodeId, rect);
            }
          }}
          onNodeDoubleClick={handleNodeDoubleClick}
          onDragConnect={handleDragConnect}
          onCanvasClick={() => {
            if (toolMode === 'add-node') {
              handleAddNodeOnCanvas();
              return;
            }
            if (toolMode === 'text') {
              handleAddTextOnCanvas();
              return;
            }
            deselectNode();
            setConnectorSource(null);
            setShowShapePicker(false);
            setShowColorPicker(false);
          }}
          selectedNodeId={selectedNode?.id}
        />

        {/* Top toolbar */}
        {!presentationMode && (
          <TopToolbar
            toolMode={toolMode}
            onToolModeChange={(mode) => {
              setToolMode(mode);
              setConnectorSource(null);
            }}
            currentTheme={currentTheme}
            onThemeChange={handleThemeChange}
            currentLook={currentLook}
            onLookChange={handleLookChange}
            onAddNote={handleAddNote}
            onInsertImage={handleInsertImage}
            onPresentation={handlePresentation}
            onLayoutChange={handleLayoutChange}
            onToggleSidebar={() => setSidebarOpen(prev => !prev)}
            sidebarOpen={sidebarOpen}
            onToggleAi={() => setAiChatOpen(prev => !prev)}
            aiOpen={aiChatOpen}
          />
        )}

        {/* Floating code panel */}
        {!presentationMode && <CodePanel
          content={content}
          onChange={handleContentChange}
          readOnly={!canEdit}
          isOpen={codePanelOpen}
          onClose={() => setCodePanelOpen(false)}
          onOpen={() => setCodePanelOpen(true)}
          autoUpdate={autoUpdate}
          onAutoUpdateChange={setAutoUpdate}
        />}

        {/* Bottom bar */}
        {!presentationMode && (
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
        )}

        {/* Presentation mode exit */}
        {presentationMode && (
          <button
            onClick={() => setPresentationMode(false)}
            className="absolute top-4 right-4 z-50 px-3 py-1.5 rounded-lg bg-black/60 text-white text-sm hover:bg-black/80 transition-colors backdrop-blur-sm"
          >
            Exit Presentation
          </button>
        )}

        {/* Diagram info sidebar */}
        <DiagramSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          content={content}
        />

        {/* AI Chat Panel */}
        <AiChatPanel
          isOpen={aiChatOpen}
          onClose={() => setAiChatOpen(false)}
          diagramContent={content}
          onApplyDiagram={handleContentChangeImmediate}
        />

        {/* Node context toolbar */}
        {!presentationMode && selectedNode && (
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
              setShowColorPicker(false);
            }}
            onColorClick={() => {
              setPickerPosition({
                x: selectedNode.rect.left + selectedNode.rect.width / 2,
                y: selectedNode.rect.bottom + 8,
              });
              setShowColorPicker(true);
              setShowShapePicker(false);
            }}
            onTextEdit={() => {
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
          svgContent={previewSvg || undefined}
        />
      )}
    </div>
  );
};
