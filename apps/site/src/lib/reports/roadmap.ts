export const ROADMAP_STATUSES = [
  "available",
  "in-progress",
  "planned",
  "exploring",
] as const;

export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];

export interface RoadmapStage {
  id: RoadmapStatus;
  label: string;
  icon: string;
  summary: string;
}

/** Display order and copy for each roadmap stage. Labels are always shown as text. */
export const ROADMAP_STAGES: readonly RoadmapStage[] = [
  {
    id: "available",
    label: "Available",
    icon: "circle-check",
    summary: "In the app on the App Store today.",
  },
  {
    id: "in-progress",
    label: "In progress",
    icon: "loader-circle",
    summary: "Being built and tested now.",
  },
  {
    id: "planned",
    label: "Planned",
    icon: "circle-dashed",
    summary: "Committed next steps that reuse the same field records.",
  },
  {
    id: "exploring",
    label: "Exploring",
    icon: "telescope",
    summary: "Ideas we are researching with project teams.",
  },
];

export const FEATURE_SUGGESTION_MAILTO =
  "mailto:patrick@harpapro.com?subject=" +
  encodeURIComponent("Harpa Pro feature suggestion");

export function stageFor(status: RoadmapStatus): RoadmapStage {
  const stage = ROADMAP_STAGES.find((s) => s.id === status);
  if (!stage) throw new Error(`Unknown roadmap status: ${status}`);
  return stage;
}
