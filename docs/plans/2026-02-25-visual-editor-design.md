# Visual Editor Design

## Goal

Replace the basic 50/50 split-pane editor with a full visual editor matching MermaidChart.com's UX: full-canvas diagram with floating code panel, interactive node selection, shape/color pickers, toolbar, and bottom bar.

## Architecture

**Approach:** Enhanced SVG interaction layer on top of Mermaid rendering (same pattern as MermaidChart.com). Mermaid remains the rendering engine. All visual interactions translate to Mermaid code modifications.

## Layout

```
┌──────────────────────────────────────────────────────────┐
│  Header (existing: name, save status, avatars, share)    │
├──────────────────────────────────────────────────────────┤
│            Top Toolbar (floating, centered)               │
│  ┌─────────────┐                                         │
│  │ Code Panel   │     Mermaid SVG on pannable/zoomable   │
│  │ (floating    │     canvas with dotted grid background  │
│  │  overlay)    │                                         │
│  └─────────────┘                                         │
│  [Snippets]          [Use AI]     [↩ ↪] [🔍+ 🔍-] [⛶]  │
└──────────────────────────────────────────────────────────┘
```

- Canvas fills entire area below header with dotted grid background
- Code panel is floating overlay (top-left), togglable open/close
- Code panel header: `[<>] Code` | `Auto-Update toggle` | `Docs` | `X`

## Components

### Top Toolbar
Centered floating bar with icon groups:

**Navigation:** Pan (hand) | Select (pointer) | Multi-select (lasso)
**Creation:** Add node (shape+) | Connector | Text (T) | Edit | Image | Presentation | Layout
**Far right:** Sidebar toggle

First iteration: pan, select, add-node functional. Others as stubs.

### Bottom Bar
Fixed bar: `[Snippets]` left | `[Use AI]` center | `[Undo] [Redo] [Zoom-] [Zoom+] [Fit] [Fullscreen]` right

- Undo/Redo: content history stack
- Zoom: tied to panzoom instance
- Fullscreen: browser fullscreen API
- Snippets: dropdown with diagram templates

### Node Interaction
1. Mermaid SVG has `.node` elements with predictable IDs
2. After render, attach click handlers to `.node` elements
3. Click → identify node ID → find corresponding code line
4. Show selection highlight (outline on SVG node)
5. Show context toolbar floating near node

### Context Toolbar
Floats near selected node: `[Shape] [Style] [Color] [Text] [Duplicate] [Delete]`

### Shape Picker
Popup with tabs: Basic | Process | Technical

| Shape | Syntax |
|-------|--------|
| Rectangle | `A[text]` |
| Rounded | `A(text)` |
| Stadium | `A([text])` |
| Circle | `A((text))` |
| Diamond | `A{text}` |
| Hexagon | `A{{text}}` |
| Parallelogram | `A[/text/]` |
| Trapezoid | `A[/text\]` |
| Double circle | `A(((text)))` |
| No shape | plain text |

### Color Picker
Palette grid of ~18 predefined colors. Adds/updates `style` directive in Mermaid code.

## File Structure

```
frontend/src/pages/editor/
├── EditorCanvas.tsx          # Full-canvas with panzoom, grid, SVG render
├── CodePanel.tsx             # Floating code panel (Monaco + header)
├── TopToolbar.tsx            # Centered toolbar with tool icons
├── BottomBar.tsx             # Snippets, AI button, undo/redo, zoom
├── NodeContextToolbar.tsx    # Floating toolbar near selected node
├── ShapePicker.tsx           # Shape selection popup with tabs
├── ColorPicker.tsx           # Color palette popup
├── SnippetsPicker.tsx        # Dropdown with diagram templates
├── useCanvasInteraction.ts   # Hook: pan/zoom state, tool mode
├── useNodeSelection.ts       # Hook: SVG click → selection → code sync
├── useUndoRedo.ts            # Hook: content history stack
└── useBidirectionalSync.ts   # Hook: code cursor ↔ SVG highlight
```

Editor.tsx becomes thin shell composing these. Existing logic (save, socket, presence, share) stays.

## New Dependencies

| Package | Purpose |
|---------|---------|
| `panzoom` | Pan/zoom on SVG canvas |

## Design Quality Requirements

- Match MermaidChart.com visual polish — no generic AI look
- Subtle shadows, proper spacing, refined icon sizing
- Smooth transitions and hover states
- Glass-morphism on floating panels (subtle backdrop-blur)
- Consistent with existing app theme (light/dark)

## Out of Scope

- Manual node drag/reposition (Mermaid controls layout)
- Freehand drawing, image insertion
- Real-time collaborative cursors on canvas
- Edge creation by drag
- These toolbar icons present but disabled for future iterations
