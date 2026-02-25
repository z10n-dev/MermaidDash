import React from 'react';
import { Shapes, Paintbrush, Type, Link, Copy, Trash2 } from 'lucide-react';

type NodeContextToolbarProps = {
  position: { x: number; y: number };
  onShapeClick: () => void;
  onColorClick: () => void;
  onTextEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

export const NodeContextToolbar: React.FC<NodeContextToolbarProps> = ({
  position, onShapeClick, onColorClick, onTextEdit, onDuplicate, onDelete,
}) => {
  const actions = [
    { id: 'shape', icon: <Shapes size={15} />, label: 'Change shape', onClick: onShapeClick },
    { id: 'color', icon: <Paintbrush size={15} />, label: 'Change color', onClick: onColorClick },
    { id: 'sep1', separator: true },
    { id: 'text', icon: <Type size={15} />, label: 'Edit text', onClick: onTextEdit },
    { id: 'link', icon: <Link size={15} />, label: 'Add link', onClick: () => {}, disabled: true },
    { id: 'sep2', separator: true },
    { id: 'duplicate', icon: <Copy size={15} />, label: 'Duplicate', onClick: onDuplicate },
    { id: 'delete', icon: <Trash2 size={15} />, label: 'Delete', onClick: onDelete, destructive: true },
  ] as const;

  return (
    <div
      className="fixed z-50 flex items-center gap-0.5 px-1.5 py-1 rounded-xl bg-white dark:bg-neutral-900 border border-border shadow-xl"
      style={{ left: position.x, top: position.y, transform: 'translateX(-50%)' }}
    >
      {actions.map((action) => {
        if ('separator' in action && action.separator) {
          return <div key={action.id} className="w-px h-5 bg-border mx-0.5" />;
        }
        if (!('onClick' in action)) return null;
        return (
          <button
            key={action.id}
            onClick={action.onClick}
            disabled={'disabled' in action && action.disabled}
            title={action.label}
            className={`p-1.5 rounded-lg transition-colors ${
              'disabled' in action && action.disabled
                ? 'text-muted-foreground/30 cursor-not-allowed'
                : 'destructive' in action && action.destructive
                  ? 'text-muted-foreground hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {action.icon}
          </button>
        );
      })}
    </div>
  );
};
