import React from 'react';

type Snippet = { name: string; description: string; code: string };

const SNIPPETS: Snippet[] = [
  {
    name: 'Flowchart',
    description: 'Basic flowchart with decision',
    code: `flowchart TD\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Action]\n    B -->|No| D[Other action]\n    C --> E[End]\n    D --> E`,
  },
  {
    name: 'Sequence Diagram',
    description: 'Service interaction',
    code: `sequenceDiagram\n    participant U as User\n    participant S as Server\n    participant DB as Database\n    U->>S: Request\n    S->>DB: Query\n    DB-->>S: Result\n    S-->>U: Response`,
  },
  {
    name: 'Class Diagram',
    description: 'OOP class structure',
    code: `classDiagram\n    class Animal {\n        +String name\n        +makeSound() void\n    }\n    class Dog {\n        +fetch() void\n    }\n    Animal <|-- Dog`,
  },
  {
    name: 'State Diagram',
    description: 'State machine',
    code: `stateDiagram-v2\n    [*] --> Idle\n    Idle --> Processing: start\n    Processing --> Done: complete\n    Processing --> Error: fail\n    Error --> Idle: retry\n    Done --> [*]`,
  },
  {
    name: 'Entity Relationship',
    description: 'Database schema',
    code: `erDiagram\n    USER ||--o{ ORDER : places\n    ORDER ||--|{ LINE_ITEM : contains\n    PRODUCT ||--o{ LINE_ITEM : "is in"`,
  },
  {
    name: 'Gantt Chart',
    description: 'Project timeline',
    code: `gantt\n    title Project Plan\n    dateFormat YYYY-MM-DD\n    section Phase 1\n        Design    :a1, 2024-01-01, 14d\n        Develop   :a2, after a1, 21d\n    section Phase 2\n        Test      :a3, after a2, 14d\n        Deploy    :a4, after a3, 7d`,
  },
];

type SnippetsPickerProps = {
  position: { x: number; y: number };
  onSnippetSelect: (code: string) => void;
  onClose: () => void;
};

export const SnippetsPicker: React.FC<SnippetsPickerProps> = ({
  position, onSnippetSelect, onClose,
}) => {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-80 max-h-96 rounded-2xl bg-white dark:bg-neutral-900 border border-border shadow-xl overflow-hidden"
        style={{ left: position.x, bottom: window.innerHeight - position.y + 8 }}
      >
        <div className="px-3 py-2.5 border-b border-border">
          <span className="text-sm font-semibold text-foreground">Snippets</span>
        </div>
        <div className="overflow-y-auto max-h-80 p-1.5">
          {SNIPPETS.map((snippet) => (
            <button
              key={snippet.name}
              onClick={() => onSnippetSelect(snippet.code)}
              className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-muted transition-colors"
            >
              <div className="text-sm font-medium text-foreground">{snippet.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{snippet.description}</div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
};
