import { registerMermaidImportRoutes } from "./mermaidImportRoutes";
import { registerMermaidExportRoutes } from "./exportRoutes";
import { RegisterImportExportDeps } from "./shared";

export const registerImportExportRoutes = (deps: RegisterImportExportDeps) => {
  registerMermaidExportRoutes(deps);
  registerMermaidImportRoutes(deps);
};

export type { RegisterImportExportDeps } from "./shared";
