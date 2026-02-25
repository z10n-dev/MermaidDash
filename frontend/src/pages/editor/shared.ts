export { getInitialsFromName } from "../../utils/user";

export const getColorFromString = (str: string): string => {
  const COLORS = [
    "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e", "#10b981",
    "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6",
    "#a855f7", "#d946ef", "#ec4899", "#f43f5e",
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
};
