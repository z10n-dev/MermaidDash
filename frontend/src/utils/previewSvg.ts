import mermaid from "mermaid";

let renderCounter = 0;

/**
 * True when the mermaid source declares its own theme in frontmatter.
 *
 * When it does, callers must NOT pass `theme` to mermaid.initialize — the
 * frontmatter value should win.
 */
export const hasFrontmatterTheme = (content: string): boolean =>
  /^---\s*\n[\s\S]*?theme:\s*\S+[\s\S]*?\n---/.test(content);

/**
 * Render mermaid diagram content to a self-contained SVG string.
 * Returns the SVG markup or null if rendering fails.
 *
 * mermaid is a module-level singleton shared with the editor, which
 * re-initializes it with the app theme on every render. We therefore
 * re-initialize on every call rather than memoizing — otherwise a dashboard
 * render could silently inherit the editor's theme.
 */
export const renderMermaidToSvg = async (
  content: string,
  theme: "default" | "dark" = "default"
): Promise<string | null> => {
  if (!content || content.trim().length === 0) return null;

  const trimmed = content.trim();
  try {
    mermaid.initialize({
      startOnLoad: false,
      ...(!hasFrontmatterTheme(trimmed) && { theme }),
      securityLevel: "loose",
    });
    const id = `mermaid-preview-${++renderCounter}`;
    const { svg } = await mermaid.render(id, trimmed);
    return ensureSvgHasStyles(svg);
  } catch (e) {
    console.error("Failed to render mermaid preview:", e);
    return null;
  }
};

/**
 * Ensure an SVG string has embedded <style> for standalone rendering.
 *
 * Mermaid v11 only embeds <style> on the first render for a given container ID.
 * Subsequent renders (after edits, theme changes) return SVG without CSS — the
 * styles exist in the document head but aren't included in the SVG string.
 *
 * This function checks if the SVG already has <style>. If not, it extracts
 * matching CSS rules from document.styleSheets and injects them.
 */
export const ensureSvgHasStyles = (svg: string): string => {
  if (!svg || /<style[\s>]/i.test(svg)) return svg;

  // Extract the SVG id to find matching CSS rules
  const idMatch = svg.match(/<svg[^>]*\bid="([^"]+)"/);
  if (!idMatch) return svg;
  const svgId = idMatch[1];

  // Collect CSS rules that target this SVG id from document stylesheets
  const rules: string[] = [];
  try {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.cssText.includes(`#${svgId}`)) {
            rules.push(rule.cssText);
          }
        }
      } catch {
        // Cross-origin stylesheets throw SecurityError — skip
      }
    }
  } catch {
    // document.styleSheets may not be available
  }

  if (rules.length === 0) return svg;

  // Inject <style> right after the opening <svg> tag
  const styleBlock = `<style>${rules.join("\n")}</style>`;
  return svg.replace(/(<svg[^>]*>)/, `$1${styleBlock}`);
};

/**
 * Check whether the preview SVG contains embedded <image> elements.
 */
export const previewHasEmbeddedImages = (
  preview: string | null | undefined
): boolean => typeof preview === "string" && /<image[\s>]/i.test(preview);

/**
 * Normalize an SVG preview string so it renders correctly in dashboard cards:
 * - Ensure viewBox is set (from width/height attrs if missing)
 * - Set preserveAspectRatio
 * - Remove restrictive inline styles (max-width, overflow, fixed dimensions)
 * - Fix white rects obscuring embedded images
 *
 * Uses regex for reliability across environments (jsdom, browser, SSR).
 */
export const normalizePreviewSvg = (preview: string | null | undefined): string | null => {
  if (typeof preview !== "string" || preview.trim().length === 0) {
    return null;
  }

  let svg = preview;

  // Extract current attributes from the <svg> tag
  const svgTagMatch = svg.match(/^(<svg\b[^>]*>)/);
  if (!svgTagMatch) return preview;

  let svgTag = svgTagMatch[1];
  const hasViewBox = /viewBox\s*=/.test(svgTag);
  const hasPreserveAR = /preserveAspectRatio\s*=/.test(svgTag);

  // Add viewBox from width/height if missing
  if (!hasViewBox) {
    const wMatch = svgTag.match(/\bwidth\s*=\s*"([^"]+)"/);
    const hMatch = svgTag.match(/\bheight\s*=\s*"([^"]+)"/);
    const w = wMatch ? parseFloat(wMatch[1]) : 0;
    const h = hMatch ? parseFloat(hMatch[1]) : 0;
    if (w > 0 && h > 0) {
      svgTag = svgTag.replace(/>$/, ` viewBox="0 0 ${w} ${h}">`);
    }
  }

  // Add preserveAspectRatio if missing
  if (!hasPreserveAR) {
    svgTag = svgTag.replace(/>$/, ' preserveAspectRatio="xMidYMid meet">');
  }

  // Remove fixed width/height so SVG scales to container
  svgTag = svgTag.replace(/\bwidth\s*=\s*"[^"]*"\s*/g, "");
  svgTag = svgTag.replace(/\bheight\s*=\s*"[^"]*"\s*/g, "");

  // Remove restrictive inline styles
  svgTag = svgTag.replace(
    /style\s*=\s*"([^"]*)"/,
    (_match, styles: string) => {
      const cleaned = styles
        .split(";")
        .filter((s: string) => {
          const prop = s.split(":")[0]?.trim().toLowerCase();
          return prop !== "max-width" && prop !== "overflow";
        })
        .join(";")
        .trim();
      return cleaned ? `style="${cleaned}"` : "";
    }
  );

  // Clean up any double spaces from removals
  svgTag = svgTag.replace(/\s{2,}/g, " ").replace(/\s+>/g, ">");

  svg = svg.replace(svgTagMatch[1], svgTag);

  // Fix white rects obscuring embedded images
  if (/<image[\s>]/i.test(svg)) {
    svg = svg.replace(
      /(<rect\b[^>]*\bx\s*=\s*"0"[^>]*\by\s*=\s*"0"[^>]*\bfill\s*=\s*")(?:#ffffff|#fff|white)(")/gi,
      "$1transparent$2"
    );
  }

  return svg;
};
