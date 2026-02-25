import { useState, useCallback } from 'react';

type SelectedNode = {
  id: string;
  rect: DOMRect;
  label?: string;
  currentColor?: string;
};

const NODE_DEF_REGEX = /^(\s*)(\w+)([\[\(\{<>]+)(.+?)([\]\)\}>]+)/;
const STYLE_REGEX = /^\s*style\s+(\w+)\s+(.*)$/;

export function useNodeSelection(
  content: string,
  onContentChange: (newContent: string) => void,
) {
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);

  const selectNode = useCallback((nodeId: string, rect: DOMRect) => {
    const lines = content.split('\n');
    let currentColor: string | undefined;
    for (const line of lines) {
      const styleMatch = line.match(STYLE_REGEX);
      if (styleMatch && styleMatch[1] === nodeId) {
        const fillMatch = styleMatch[2].match(/fill:(#[0-9A-Fa-f]{6})/);
        if (fillMatch) currentColor = fillMatch[1];
      }
    }
    setSelectedNode({ id: nodeId, rect, currentColor });
  }, [content]);

  const deselectNode = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const changeNodeColor = useCallback((color: string) => {
    if (!selectedNode) return;
    const lines = content.split('\n');
    const styleDirective = `    style ${selectedNode.id} stroke:#000000,fill:${color}`;
    const existingIdx = lines.findIndex((line) => {
      const m = line.match(STYLE_REGEX);
      return m && m[1] === selectedNode.id;
    });
    if (existingIdx >= 0) {
      lines[existingIdx] = styleDirective;
    } else {
      lines.push(styleDirective);
    }
    onContentChange(lines.join('\n'));
    setSelectedNode((prev) => prev ? { ...prev, currentColor: color } : null);
  }, [selectedNode, content, onContentChange]);

  const changeNodeShape = useCallback((
    syntaxFn: (id: string, text: string) => string,
  ) => {
    if (!selectedNode) return;
    const lines = content.split('\n');
    const newLines = lines.map((line) => {
      const match = line.match(NODE_DEF_REGEX);
      if (!match) return line;
      const [, indent, id, , text] = match;
      if (id !== selectedNode.id) return line;
      return `${indent}${syntaxFn(id, text)}`;
    });
    onContentChange(newLines.join('\n'));
  }, [selectedNode, content, onContentChange]);

  const deleteNode = useCallback(() => {
    if (!selectedNode) return;
    const lines = content.split('\n');
    const id = selectedNode.id;
    const newLines = lines.filter((line) => {
      const defMatch = line.match(NODE_DEF_REGEX);
      if (defMatch && defMatch[2] === id) return false;
      const styleMatch = line.match(STYLE_REGEX);
      if (styleMatch && styleMatch[1] === id) return false;
      const trimmed = line.trim();
      const edgePattern = new RegExp(`(^|\\s)${id}(\\s|$|\\[|\\(|\\{|-->|---|-\\.-|==>|-.->|--)`);
      const arrowPattern = new RegExp(`(-->|---|-\\.-|==>|-.->|--)\\s*${id}(\\s|$|\\[|\\(|\\{)`);
      if (edgePattern.test(trimmed) || arrowPattern.test(trimmed)) return false;
      return true;
    });
    onContentChange(newLines.join('\n'));
    setSelectedNode(null);
  }, [selectedNode, content, onContentChange]);

  const duplicateNode = useCallback(() => {
    if (!selectedNode) return;
    const lines = content.split('\n');
    const id = selectedNode.id;
    const newId = `${id}_copy`;
    const newLines: string[] = [];
    for (const line of lines) {
      newLines.push(line);
      const defMatch = line.match(NODE_DEF_REGEX);
      if (defMatch && defMatch[2] === id) {
        newLines.push(line.replace(id, newId));
      }
    }
    onContentChange(newLines.join('\n'));
  }, [selectedNode, content, onContentChange]);

  return {
    selectedNode, selectNode, deselectNode,
    changeNodeColor, changeNodeShape, deleteNode, duplicateNode,
  };
}
