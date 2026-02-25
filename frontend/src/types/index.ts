export interface DrawingSummary {
  id: string;
  name: string;
  collectionId: string | null;
  updatedAt: number;
  createdAt: number;
  version: number;
  preview?: string | null;
  accessLevel?: "none" | "view" | "edit" | "owner";
}

export interface Drawing extends DrawingSummary {
  content: string;
}

export interface Collection {
  id: string;
  name: string;
  createdAt: number;
}
