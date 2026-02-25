import express from "express";
import { registerAiSettingsRoutes } from "./aiSettings";
import { registerCollectionRoutes } from "./collections";
import { registerDrawingRoutes } from "./drawings";
import { registerLibraryRoutes } from "./library";
import { DashboardRouteDeps } from "./types";

export const registerDashboardRoutes = (
  app: express.Router,
  deps: DashboardRouteDeps
) => {
  registerDrawingRoutes(app, deps);
  registerCollectionRoutes(app, deps);
  registerLibraryRoutes(app, deps);
  registerAiSettingsRoutes(app, deps);
};

export type { DashboardRouteDeps } from "./types";
