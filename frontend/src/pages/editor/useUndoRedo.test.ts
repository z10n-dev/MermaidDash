import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useUndoRedo } from './useUndoRedo';

describe('useUndoRedo', () => {
  it('initializes with given content', () => {
    const { result } = renderHook(() => useUndoRedo('initial'));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('tracks changes and allows undo', () => {
    const { result } = renderHook(() => useUndoRedo('v1'));
    act(() => result.current.pushState('v2'));
    act(() => result.current.pushState('v3'));
    expect(result.current.canUndo).toBe(true);
    let undone: string | undefined;
    act(() => { undone = result.current.undo(); });
    expect(undone).toBe('v2');
    act(() => { undone = result.current.undo(); });
    expect(undone).toBe('v1');
    expect(result.current.canUndo).toBe(false);
  });

  it('allows redo after undo', () => {
    const { result } = renderHook(() => useUndoRedo('v1'));
    act(() => result.current.pushState('v2'));
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);
    let redone: string | undefined;
    act(() => { redone = result.current.redo(); });
    expect(redone).toBe('v2');
  });

  it('clears redo stack on new push', () => {
    const { result } = renderHook(() => useUndoRedo('v1'));
    act(() => result.current.pushState('v2'));
    act(() => result.current.undo());
    act(() => result.current.pushState('v3'));
    expect(result.current.canRedo).toBe(false);
  });

  it('caps history at maxHistory', () => {
    const { result } = renderHook(() => useUndoRedo('v0', 3));
    act(() => result.current.pushState('v1'));
    act(() => result.current.pushState('v2'));
    act(() => result.current.pushState('v3'));
    act(() => result.current.undo());
    act(() => result.current.undo());
    expect(result.current.canUndo).toBe(false);
  });
});
