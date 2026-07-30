import { useCallback, useEffect, useRef } from "react";
import * as api from "../../api";
import type { DrawingSummary } from "../../types";
import { svgToPngDataUrl } from "../../utils/exportUtils";
import { renderMermaidToSvg } from "../../utils/previewSvg";
import {
  runPreviewBackfill,
  selectPreviewCandidates,
  type PreviewBackfillDeps,
} from "../../utils/previewBackfill";

/** Cards filled per pass. Keeps a large first page from flooding the API. */
const BATCH_SIZE = 8;
const CONCURRENCY = 2;

type UsePreviewBackfillOptions = {
  drawings: DrawingSummary[];
  setDrawings: React.Dispatch<React.SetStateAction<DrawingSummary[]>>;
  /** False for the trash view, where thumbnails are not worth generating. */
  enabled: boolean;
  theme?: "default" | "dark";
};

/**
 * Generate missing dashboard thumbnails in the browser and persist them.
 *
 * Drawings created outside the editor — via the MCP server, import, or the
 * public API — have no `preview`, because only the editor produces one. Without
 * this, such cards stay blank until someone opens them in the editor and
 * navigates back, which is what triggers the editor's save.
 *
 * The write is a preview-only PUT: the backend does not treat it as a scene
 * update, so it neither bumps `version` nor emits `diagrams-changed`. That is
 * what keeps this from conflicting with an open editor or looping against the
 * dashboard's own socket refresh.
 */
export const usePreviewBackfill = ({
  drawings,
  setDrawings,
  enabled,
  theme = "default",
}: UsePreviewBackfillOptions): void => {
  const attemptedRef = useRef<Set<string>>(new Set());
  const isRunningRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const applyPreview = useCallback(
    (id: string, preview: string) => {
      setDrawings((prev) => prev.map((d) => (d.id === id ? { ...d, preview } : d)));
    },
    [setDrawings]
  );

  useEffect(() => {
    if (!enabled || isRunningRef.current) return;

    const ids = selectPreviewCandidates(drawings, {
      attempted: attemptedRef.current,
      limit: BATCH_SIZE,
    });
    if (ids.length === 0) return;

    // Claim the ids up front so a re-render mid-run cannot queue them twice.
    ids.forEach((id) => attemptedRef.current.add(id));
    isRunningRef.current = true;

    const deps: PreviewBackfillDeps = {
      fetchContent: async (id) => (await api.getDrawing(id)).content,
      renderSvg: (content) => renderMermaidToSvg(content, theme),
      toPng: (svg) => svgToPngDataUrl(svg),
      savePreview: async (id, preview) => {
        await api.updateDrawing(id, { preview });
      },
      onSaved: applyPreview,
      onFailed: (id, reason) => {
        console.warn(`Preview backfill failed for drawing ${id}:`, reason);
      },
      isCancelled: () => cancelledRef.current,
    };

    runPreviewBackfill(ids, deps, { concurrency: CONCURRENCY }).finally(() => {
      isRunningRef.current = false;
    });
  }, [drawings, enabled, theme, applyPreview]);
};
