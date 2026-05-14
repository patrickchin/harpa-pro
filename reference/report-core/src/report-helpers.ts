import type {
  GeneratedReportIssue,
  GeneratedReportWorkers,
  GeneratedSiteReport,
} from "./generated-report";

export function toTitleCase(value: string): string {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export type IssueSeverityTone = "danger" | "warning" | "neutral";

export function getIssueSeverityTone(
  severity: string | null | undefined,
): IssueSeverityTone {
  switch ((severity ?? "").trim().toLowerCase()) {
    case "high":
    case "critical":
      return "danger";
    case "medium":
      return "warning";
    default:
      return "neutral";
  }
}

export function getReportStats(report: GeneratedSiteReport) {
  const workers = report.report.workers?.totalWorkers ?? 0;
  const materials = report.report.materials.length;
  const issues = report.report.issues.length;

  return [
    {
      value: workers,
      label: workers === 1 ? "Worker" : "Workers",
      tone: "default" as const,
    },
    {
      value: materials,
      label: materials === 1 ? "Material" : "Materials",
      tone: "default" as const,
    },
    {
      value: issues,
      label: issues === 1 ? "Issue" : "Issues",
      tone: issues > 0 ? ("warning" as const) : ("default" as const),
    },
  ];
}

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function getWorkersLines(
  workers: GeneratedReportWorkers | null,
): string[] {
  if (!workers) return [];

  const lines: string[] = [];

  if (workers.totalWorkers !== null) {
    lines.push(`${workers.totalWorkers} workers recorded on site.`);
  }
  if (workers.workerHours) {
    lines.push(`Worker hours: ${workers.workerHours}`);
  }
  if (workers.notes) {
    lines.push(workers.notes);
  }
  for (const role of workers.roles) {
    const count = role.count !== null ? `${role.count} ` : "";
    const notes = role.notes ? ` - ${role.notes}` : "";
    lines.push(`${count}${role.role}${notes}`.trim());
  }

  return lines;
}

export function getWeatherLines(report: GeneratedSiteReport): string[] {
  const weather = report.report.weather;
  if (!weather) {
    return [];
  }

  return [
    weather.conditions,
    weather.temperature ? `Temperature: ${weather.temperature}` : null,
    weather.wind ? `Wind: ${weather.wind}` : null,
    weather.impact ? `Impact: ${weather.impact}` : null,
  ].filter(Boolean) as string[];
}

export function getIssueMeta(issue: GeneratedReportIssue): string {
  return [issue.category, issue.severity, issue.status]
    .filter(Boolean)
    .map(toTitleCase)
    .join(" • ");
}

export function getItemMeta(values: Array<string | null>): string {
  return values.filter(Boolean).join(" • ");
}

export function getReportCompleteness(report: GeneratedSiteReport): number {
  const checks = [
    report.report.meta.title !== "",
    report.report.meta.summary !== "",
    report.report.meta.visitDate !== null,
    report.report.weather !== null,
    report.report.workers !== null,
    report.report.materials.length > 0,
    report.report.issues.length > 0,
    report.report.nextSteps.length > 0,
    report.report.sections.length > 0,
  ];

  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}
