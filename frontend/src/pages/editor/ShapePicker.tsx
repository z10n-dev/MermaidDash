import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';

export type MermaidShape = {
  name: string;
  syntax: (id: string, text: string) => string;
  icon: React.ReactNode;
};

const ShapeIcon: React.FC<{ d: string }> = ({ d }) => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-foreground">
    <path d={d} stroke="currentColor" strokeWidth="1.5" fill="none" />
  </svg>
);

const SHAPES: Record<string, MermaidShape[]> = {
  Basic: [
    { name: 'Rectangle', syntax: (id, text) => `${id}[${text}]`, icon: <ShapeIcon d="M4 6h20v16H4z" /> },
    { name: 'Rounded', syntax: (id, text) => `${id}(${text})`, icon: <ShapeIcon d="M8 6h12a4 4 0 0 1 0 16H8a4 4 0 0 1 0-16z" /> },
    { name: 'Stadium', syntax: (id, text) => `${id}([${text}])`, icon: <ShapeIcon d="M10 7h8a7 7 0 0 1 0 14h-8a7 7 0 0 1 0-14z" /> },
    { name: 'Circle', syntax: (id, text) => `${id}((${text}))`, icon: <ShapeIcon d="M14 4a10 10 0 1 1 0 20 10 10 0 0 1 0-20z" /> },
    { name: 'Diamond', syntax: (id, text) => `${id}{${text}}`, icon: <ShapeIcon d="M14 3L25 14 14 25 3 14z" /> },
    { name: 'Hexagon', syntax: (id, text) => `${id}{{${text}}}`, icon: <ShapeIcon d="M8 4h12l6 10-6 10H8L2 14z" /> },
  ],
  Process: [
    { name: 'Subroutine', syntax: (id, text) => `${id}[[${text}]]`, icon: <ShapeIcon d="M4 6h20v16H4zM7 6v16M21 6v16" /> },
    { name: 'Cylindrical', syntax: (id, text) => `${id}[(${text})]`, icon: <ShapeIcon d="M6 8c0-2 3.5-4 8-4s8 2 8 4v12c0 2-3.5 4-8 4s-8-2-8-4zM6 8c0 2 3.5 4 8 4s8-2 8-4" /> },
    { name: 'Asymmetric', syntax: (id, text) => `${id}>${text}]`, icon: <ShapeIcon d="M4 6l6 8-6 8h20V6z" /> },
    { name: 'Parallelogram', syntax: (id, text) => `${id}[/${text}/]`, icon: <ShapeIcon d="M8 6h16l-4 16H4z" /> },
    { name: 'Trapezoid', syntax: (id, text) => `${id}[/${text}\\]`, icon: <ShapeIcon d="M6 22h16l-3-16H9z" /> },
    { name: 'Double circle', syntax: (id, text) => `${id}(((${text})))`, icon: <ShapeIcon d="M14 5a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM14 8a6 6 0 1 1 0 12 6 6 0 0 1 0-12z" /> },
  ],
  Technical: [
    { name: 'Database', syntax: (id, text) => `${id}[(${text})]`, icon: <ShapeIcon d="M6 8c0-2 3.5-4 8-4s8 2 8 4v12c0 2-3.5 4-8 4s-8-2-8-4zM6 8c0 2 3.5 4 8 4s8-2 8-4" /> },
    { name: 'Odd', syntax: (id, text) => `${id}>>${text}]`, icon: <ShapeIcon d="M3 6h18l4 8-4 8H3z" /> },
    { name: 'Inv trapezoid', syntax: (id, text) => `${id}[\\${text}/]`, icon: <ShapeIcon d="M9 6h10l3 16H6z" /> },
    { name: 'Lean right', syntax: (id, text) => `${id}[\\${text}\\]`, icon: <ShapeIcon d="M8 6h16l-4 16H4z" /> },
    { name: 'Lean left', syntax: (id, text) => `${id}[/${text}/]`, icon: <ShapeIcon d="M4 6h16l4 16H8z" /> },
    { name: 'No shape', syntax: (id, _text) => `${id}:::default`, icon: <div className="flex items-center gap-1 text-xs text-muted-foreground"><ArrowRight size={12} /><span>Aa</span></div> },
  ],
};

type ShapePickerProps = {
  position: { x: number; y: number };
  onShapeSelect: (shape: MermaidShape) => void;
  onClose: () => void;
};

export const ShapePicker: React.FC<ShapePickerProps> = ({
  position, onShapeSelect, onClose,
}) => {
  const [activeTab, setActiveTab] = useState<string>('Basic');
  const tabs = Object.keys(SHAPES);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-72 rounded-2xl bg-white dark:bg-neutral-900 border border-border shadow-xl overflow-hidden"
        style={{ left: position.x, top: position.y }}
      >
        <div className="flex border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                activeTab === tab ? 'text-accent border-b-2 border-accent' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="p-3">
          <div className="grid grid-cols-6 gap-1">
            {SHAPES[activeTab].map((shape) => (
              <button
                key={shape.name}
                onClick={() => onShapeSelect(shape)}
                title={shape.name}
                className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-muted transition-colors"
              >
                {shape.icon}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};
