import React from 'react';

const PALETTE = [
  ['#FFFFFF', '#000000', '#4A4A4A', '#7A7A7A', '#A0A0A0', '#D0D0D0'],
  ['#E74C3C', '#F39C12', '#F1C40F', '#2ECC71', '#3498DB', '#9B59B6'],
  ['#FA93B2', '#FFBE76', '#FFF3A3', '#BEF6AC', '#A3E9CC', '#D4EFF0'],
];

type ColorPickerProps = {
  position: { x: number; y: number };
  currentColor?: string;
  onColorSelect: (color: string) => void;
  onClose: () => void;
};

export const ColorPicker: React.FC<ColorPickerProps> = ({
  position, currentColor, onColorSelect, onClose,
}) => {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 p-3 rounded-2xl bg-white dark:bg-neutral-900 border border-border shadow-xl"
        style={{ left: position.x, top: position.y }}
      >
        <div className="flex flex-col gap-2">
          {PALETTE.map((row, ri) => (
            <div key={ri} className="flex gap-1.5">
              {row.map((color) => {
                const isSelected = currentColor?.toUpperCase() === color.toUpperCase();
                return (
                  <button
                    key={color}
                    onClick={() => onColorSelect(color)}
                    className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${
                      isSelected ? 'ring-2 ring-accent ring-offset-2 ring-offset-white dark:ring-offset-neutral-900' : ''
                    } ${color === '#FFFFFF' ? 'border border-gray-200 dark:border-neutral-600' : ''}`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};
