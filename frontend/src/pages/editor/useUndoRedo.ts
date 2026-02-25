import { useRef, useCallback, useState } from 'react';

export function useUndoRedo(initialContent: string, maxHistory = 100) {
  const historyRef = useRef<string[]>([initialContent]);
  const pointerRef = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateFlags = useCallback(() => {
    setCanUndo(pointerRef.current > 0);
    setCanRedo(pointerRef.current < historyRef.current.length - 1);
  }, []);

  const pushState = useCallback((content: string) => {
    const history = historyRef.current;
    const pointer = pointerRef.current;
    historyRef.current = history.slice(0, pointer + 1);
    historyRef.current.push(content);
    if (historyRef.current.length > maxHistory) {
      historyRef.current = historyRef.current.slice(historyRef.current.length - maxHistory);
    }
    pointerRef.current = historyRef.current.length - 1;
    updateFlags();
  }, [maxHistory, updateFlags]);

  const undo = useCallback((): string | undefined => {
    if (pointerRef.current <= 0) return undefined;
    pointerRef.current--;
    updateFlags();
    return historyRef.current[pointerRef.current];
  }, [updateFlags]);

  const redo = useCallback((): string | undefined => {
    if (pointerRef.current >= historyRef.current.length - 1) return undefined;
    pointerRef.current++;
    updateFlags();
    return historyRef.current[pointerRef.current];
  }, [updateFlags]);

  return { pushState, undo, redo, canUndo, canRedo };
}
