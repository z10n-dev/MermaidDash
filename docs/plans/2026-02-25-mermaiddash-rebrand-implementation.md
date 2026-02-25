# MermaidDash Rebrand Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebrand the frontend from Excalidraw to Mermaid visual identity using a token-based color system.

**Architecture:** Define CSS custom properties for light/dark themes in `index.css`, map them into Tailwind config, then migrate all components from hardcoded `indigo-*` classes to semantic token classes. Replace font, logo, favicons, and text references.

**Tech Stack:** Tailwind CSS 3, CSS custom properties, Google Fonts (Recursive Variable), React/TSX

---

### Task 1: Set up CSS color tokens and Tailwind theme

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/tailwind.config.js`

**Step 1: Add CSS custom properties to `index.css`**

Replace the entire file with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --accent: 340 100% 44%;
    --accent-foreground: 210 40% 98%;
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --muted: 228 24% 96%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --border: 214.3 31.8% 91.4%;
    --destructive: 0 72% 51%;
    --success: 160 84% 39%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --radius: 0.75rem;
  }

  .dark {
    --accent: 340 100% 44%;
    --accent-foreground: 210 40% 98%;
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --border: 217.2 32.6% 17.5%;
    --destructive: 0 72% 51%;
    --success: 160 84% 39%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
  }
}

html,
body {
  height: 100%;
  margin: 0;
  padding: 0;
}

body {
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
}

.no-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.no-scrollbar::-webkit-scrollbar {
  width: 0;
  height: 0;
}
```

Note: Removes the grid pattern background, Excalifont font-face, and the `!important` dark override. Uses clean background from tokens.

**Step 2: Add Tailwind theme mapping in `tailwind.config.js`**

```javascript
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        border: 'hsl(var(--border))',
        destructive: 'hsl(var(--destructive))',
        success: 'hsl(var(--success))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
      },
      fontFamily: {
        sans: ['"Recursive"', 'system-ui', 'sans-serif'],
        brand: ['"Recursive"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
```

**Step 3: Verify Tailwind picks up the new tokens**

Run: `cd frontend && npx tailwind -i src/index.css -o /dev/null` (should not error)

**Step 4: Commit**

```bash
git add frontend/src/index.css frontend/tailwind.config.js
git commit -m "Set up Mermaid color tokens and Tailwind theme"
```

---

### Task 2: Replace font from Excalifont to Recursive Variable

**Files:**
- Modify: `frontend/index.html`
- Delete: `frontend/src/assets/fonts/Excalifont-Regular.woff2`
- Modify: `frontend/src/components/Layout.tsx` (line 125)
- Modify: `frontend/src/components/Sidebar.tsx` (line 172)
- Modify: `frontend/src/pages/Dashboard.tsx` (line 689)
- Modify: `frontend/src/pages/Admin.tsx` (line 491)
- Modify: `frontend/src/pages/Profile.tsx` (line 225)
- Modify: `frontend/src/pages/Settings.tsx` (line 277)

**Step 1: Add Google Fonts link to `index.html`**

Add to `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Recursive:slnt,wght,CASL,CRSV,MONO@-15..0,300..1000,0..1,0..1,0..1&display=swap" rel="stylesheet">
<meta name="theme-color" content="#FF3670">
```

**Step 2: Delete old font file**

```bash
rm frontend/src/assets/fonts/Excalifont-Regular.woff2
```

If the `fonts` directory is now empty, remove it too.

**Step 3: Replace all `fontFamily: 'Excalifont'` references**

In all 6 component/page files, replace:
```tsx
style={{ fontFamily: 'Excalifont' }}
```
with:
```tsx
className="font-brand"
```

Merge into existing className if one exists. For example in Layout.tsx:
```tsx
// Before:
<span className="text-xl text-slate-900 dark:text-white mt-1" style={{ fontFamily: 'Excalifont' }}>ExcaliDash</span>
// After:
<span className="text-xl text-slate-900 dark:text-white mt-1 font-brand">MermaidDash</span>
```

**Step 4: Verify font loads in browser**

Run the dev server and check that Recursive renders correctly.

**Step 5: Commit**

```bash
git add -A
git commit -m "Replace Excalifont with Recursive Variable from Google Fonts"
```

---

### Task 3: Replace "ExcaliDash" text with "MermaidDash"

**Files:**
- Modify: `frontend/src/components/Layout.tsx` (line 125)
- Modify: `frontend/src/components/Sidebar.tsx` (line 174)
- Modify: `frontend/src/pages/Dashboard.tsx` (line ~689)
- Modify: `frontend/src/pages/Admin.tsx` (line ~491)
- Modify: `frontend/src/pages/Profile.tsx` (lines ~225, ~280)
- Modify: `frontend/src/pages/Settings.tsx` (line ~277)
- Modify: `frontend/src/pages/Login.tsx`
- Modify: `frontend/src/pages/Register.tsx`

**Step 1: Search and replace all "ExcaliDash" text**

Replace all user-facing "ExcaliDash" strings with "MermaidDash" in the files above.

Also check for `.excalidash` file extension references in Settings.tsx and update to `.mermaiddash` if applicable.

**Step 2: Verify no "ExcaliDash" remains in frontend src**

Run: `grep -ri "excalidash" frontend/src/ --include="*.tsx" --include="*.ts" -l`

Should return no results (excluding any import/export route references that are backend concerns).

**Step 3: Commit**

```bash
git add -A
git commit -m "Replace ExcaliDash text references with MermaidDash"
```

---

### Task 4: Rename localStorage keys

**Files:**
- Modify: `frontend/src/context/AuthContext.tsx`
- Modify: `frontend/src/context/AuthContext.test.tsx`
- Modify: `frontend/src/utils/identity.ts`
- Modify: `frontend/src/utils/__tests__/identity.test.ts`
- Modify: `frontend/src/utils/impersonation.ts`
- Modify: `frontend/src/components/UpdateBanner.tsx`
- Modify: `frontend/src/pages/Settings.tsx`
- Modify: `frontend/src/pages/AuthSetupChoice.tsx`
- Modify: `frontend/src/api/index.ts`

**Step 1: Replace all localStorage key strings**

Global search and replace in all files above:
- `'excalidash-user'` → `'mermaiddash-user'`
- `'excalidash-auth-enabled'` → `'mermaiddash-auth-enabled'`
- `'excalidash-device-id'` → `'mermaiddash-device-id'`
- `'excalidash-user-id'` → `'mermaiddash-user-id'`
- `'excalidash-impersonation'` → `'mermaiddash-impersonation'`
- `'excalidash-update-channel'` → `'mermaiddash-update-channel'`
- `'excalidash-update-ignored-version'` → `'mermaiddash-update-ignored-version'`
- `'excalidash-update-last-check'` → `'mermaiddash-update-last-check'`
- `'excalidash-update-info'` → `'mermaiddash-update-info'`
- `'excalidash-update-banner-closed-version'` → `'mermaiddash-update-banner-closed-version'`

Also update any `USER_KEY`, `IMPERSONATION_KEY` constants if they are defined with the old prefix.

**Step 2: Verify no excalidash- keys remain**

Run: `grep -r "excalidash-" frontend/src/ --include="*.ts" --include="*.tsx"`

Should return nothing.

**Step 3: Run existing tests**

Run: `cd frontend && npm test`

All tests should pass with the new key names.

**Step 4: Commit**

```bash
git add -A
git commit -m "Rename localStorage keys from excalidash- to mermaiddash-"
```

---

### Task 5: Migrate indigo Tailwind classes to accent tokens

**Files:** 21 component and page files (see mapping report above)

This is the largest task. The migration pattern is:

| Old class | New class |
|---|---|
| `bg-indigo-50` | `bg-accent/10` |
| `bg-indigo-100` | `bg-accent/15` |
| `bg-indigo-600` | `bg-accent` |
| `bg-indigo-500` | `bg-accent` |
| `bg-indigo-400` | `bg-accent/80` |
| `bg-indigo-900/20` | `bg-accent/20` |
| `bg-indigo-900/30` | `bg-accent/30` |
| `text-indigo-600` | `text-accent` |
| `text-indigo-700` | `text-accent` |
| `text-indigo-900` | `text-accent` |
| `text-indigo-500` | `text-accent` |
| `text-indigo-400` | `text-accent` |
| `text-indigo-300` | `text-accent/70` |
| `border-indigo-600` | `border-accent` |
| `border-indigo-500` | `border-accent` |
| `hover:bg-indigo-50` | `hover:bg-accent/10` |
| `hover:bg-indigo-100` | `hover:bg-accent/15` |
| `hover:bg-indigo-900/30` | `hover:bg-accent/30` |
| `hover:text-indigo-600` | `hover:text-accent` |
| `hover:text-indigo-400` | `hover:text-accent` |
| `focus-visible:ring-indigo-500` | `focus-visible:ring-accent` |
| `dark:focus:ring-indigo-400` | `dark:focus:ring-accent` |
| `dark:hover:bg-indigo-400` | `dark:hover:bg-accent` |
| `dark:hover:bg-indigo-500` | `dark:hover:bg-accent` |
| `dark:hover:text-indigo-400` | `dark:hover:text-accent` |
| `dark:hover:text-indigo-600` | `dark:hover:text-accent` |
| `dark:text-indigo-400` | `dark:text-accent` |
| `dark:text-indigo-300` | `dark:text-accent/70` |
| `dark:border-indigo-500` | `dark:border-accent` |

**Step 1: Migrate each file**

Work through the 21 files systematically. Many dark: variants can be simplified since the accent token already switches via CSS variables. For example:
```tsx
// Before:
className="text-indigo-600 dark:text-indigo-400"
// After:
className="text-accent"
```

**Step 2: Also update hardcoded colors in Layout.tsx**

Replace `bg-[#F3F4F6]` with `bg-muted` or `bg-background`.

**Step 3: Verify no indigo references remain**

Run: `grep -r "indigo" frontend/src/ --include="*.tsx" --include="*.ts"`

Should return nothing.

**Step 4: Visual check in browser**

Start dev server, verify accent color (#FF3670 rosa) appears correctly in both light and dark mode on:
- Sidebar active state
- Buttons
- Links/CTAs
- Hover states
- Focus rings

**Step 5: Commit**

```bash
git add -A
git commit -m "Migrate all indigo classes to accent color tokens"
```

---

### Task 6: Replace Logo and Favicons

**Files:**
- Rewrite: `frontend/src/components/Logo.tsx`
- Replace: `frontend/public/favicon.svg`
- Replace: `frontend/public/favicon-light.svg`
- Replace: `frontend/public/favicon-dark.svg`

**Step 1: Design and implement new Logo component**

Use `superpowers:frontend-design` skill to create a Mermaid-inspired logo:
- Flowchart/diagram motif (nodes + arrows)
- Uses `--accent` (#FF3670) as primary color
- Clean, minimal, works at small sizes
- Supports light/dark themes via props or CSS

**Step 2: Create matching favicon SVGs**

Create 3 SVG variants using the same motif:
- `favicon.svg` - default (works on both)
- `favicon-light.svg` - for light browser chrome
- `favicon-dark.svg` - for dark browser chrome

**Step 3: Verify favicons switch correctly with theme toggle**

Check ThemeContext.tsx logic still works with new file names (it should since we keep the same filenames).

**Step 4: Commit**

```bash
git add -A
git commit -m "Replace logo and favicons with Mermaid-branded design"
```

---

### Task 7: Clean up remaining Excalidraw references and final polish

**Files:** Various

**Step 1: Final grep for any remaining excalidraw/excalidash references**

```bash
grep -ri "excali" frontend/src/ --include="*.ts" --include="*.tsx" --include="*.css" --include="*.html"
```

Fix any remaining references.

**Step 2: Check for unused dark: variants**

Since the accent token auto-switches with CSS variables, many `dark:text-accent` / `dark:bg-accent` pairings are redundant. Clean up where the light and dark values are the same.

**Step 3: Run all frontend tests**

```bash
cd frontend && npm test
```

All should pass.

**Step 4: Visual QA in browser**

Check all pages in both light and dark mode:
- Dashboard
- Editor
- Settings
- Profile
- Admin
- Login/Register

**Step 5: Commit**

```bash
git add -A
git commit -m "Clean up remaining Excalidraw references, final rebrand polish"
```
