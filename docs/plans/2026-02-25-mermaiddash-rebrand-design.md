# MermaidDash Rebrand Design

## Goal

Rebrand the frontend from Excalidraw look-and-feel to Mermaid look-and-feel, using a token-based approach (Approach A). The app should feel like part of the Mermaid family (mermaid.live, mermaid.ai). Layout and UX patterns are kept as-is.

## Color Tokens

Defined as CSS custom properties in `index.css`, mapped into `tailwind.config.js`.

### Light mode

| Token | Value | Usage |
|---|---|---|
| `--accent` | `#FF3670` | CTAs, active states, hover, brand |
| `--accent-foreground` | `#F8FAFC` | Text on accent surfaces |
| `--background` | `#FFFFFF` | Page background |
| `--foreground` | `#020817` | Primary text |
| `--muted` | `#F1F2F8` | Muted backgrounds, secondary surfaces |
| `--muted-foreground` | `#64748B` | Secondary text |
| `--border` | `#E2E8F0` | Borders |
| `--destructive` | `#DC2626` | Error/delete actions |
| `--success` | `#10B981` | Success states |

### Dark mode

| Token | Value |
|---|---|
| `--accent` | `#FF3670` (same) |
| `--accent-foreground` | `#F8FAFC` |
| `--background` | `#020817` |
| `--foreground` | `#F8FAFC` |
| `--muted` | `#1E293B` |
| `--muted-foreground` | `#94A3B8` |
| `--border` | `#1E293B` |

## Font

- Replace `Excalifont` (custom woff2) with `Recursive Variable` from Google Fonts CDN
- Load in `index.html` via `<link>`
- Remove `Excalifont-Regular.woff2` file
- Update all `font-['Excalifont']` references in components

## Logo & Favicon

- New SVG logo in `Logo.tsx` - diagram/flowchart-inspired with mermaid rosa accent
- 3 new favicon SVGs: `favicon.svg`, `favicon-light.svg`, `favicon-dark.svg`
- Remove old dashboard-grid-with-pencil design
- Add `<meta name="theme-color" content="#FF3670">` to `index.html`

## Background & Surfaces

- Remove excalidraw-style grid pattern from `index.css`
- Use clean `--background` token instead
- Keep frosted glass effect on cards (`backdrop-blur-sm`)
- Base border-radius: `0.75rem` (12px)
- Keep existing layout structure (sidebar, resizable panels, cards)

## Text & Naming

- All "ExcaliDash" references in UI -> "MermaidDash"

## LocalStorage Keys

- Rename all `excalidash-*` keys to `mermaiddash-*` (no migration needed)
  - `excalidash-user` -> `mermaiddash-user`
  - `excalidash-auth-enabled` -> `mermaiddash-auth-enabled`
  - `excalidash-device-id` -> `mermaiddash-device-id`
  - `excalidash-user-id` -> `mermaiddash-user-id`

## Color Migration

Replace all hardcoded `indigo-*` Tailwind classes with `accent` token equivalents:
- `bg-indigo-50` -> `bg-accent/10`
- `bg-indigo-600` -> `bg-accent`
- `text-indigo-600` -> `text-accent`
- `hover:bg-indigo-400` -> `hover:bg-accent`
- etc.

Keep `rose-*` for destructive actions (map to `--destructive` token).

## What We Keep

- Layout and UX patterns (sidebar, resizable panels, drag-and-drop)
- Dark mode system (class-based toggle)
- Card frosted glass effect
- General component structure

## Future Considerations

- Full redesign of components is not ruled out but out of scope for this phase
