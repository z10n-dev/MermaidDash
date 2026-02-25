import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Top node */}
      <rect
        x="176"
        y="32"
        width="160"
        height="80"
        rx="16"
        strokeWidth="20"
        className="fill-accent/10 dark:fill-accent/20 stroke-foreground/80"
      />
      {/* Left node */}
      <rect
        x="32"
        y="240"
        width="160"
        height="80"
        rx="16"
        strokeWidth="20"
        className="fill-accent/10 dark:fill-accent/20 stroke-foreground/80"
      />
      {/* Right node */}
      <rect
        x="320"
        y="240"
        width="160"
        height="80"
        rx="16"
        strokeWidth="20"
        className="fill-accent/10 dark:fill-accent/20 stroke-foreground/80"
      />
      {/* Bottom node */}
      <rect
        x="176"
        y="400"
        width="160"
        height="80"
        rx="40"
        strokeWidth="20"
        className="fill-accent/10 dark:fill-accent/20 stroke-foreground/80"
      />
      {/* Connectors */}
      <g
        strokeWidth="14"
        strokeLinecap="round"
        className="stroke-accent"
        style={{ stroke: 'hsl(var(--accent))' }}
      >
        {/* Top to Left */}
        <line x1="216" y1="112" x2="132" y2="240" />
        {/* Top to Right */}
        <line x1="296" y1="112" x2="380" y2="240" />
        {/* Left to Bottom */}
        <line x1="132" y1="320" x2="216" y2="400" />
        {/* Right to Bottom */}
        <line x1="380" y1="320" x2="296" y2="400" />
      </g>
      {/* Arrow heads */}
      <g style={{ fill: 'hsl(var(--accent))' }}>
        <polygon points="132,240 118,218 146,218" />
        <polygon points="380,240 366,218 394,218" />
        <polygon points="216,400 202,378 230,378" />
        <polygon points="296,400 282,378 310,378" />
      </g>
    </svg>
  );
};
