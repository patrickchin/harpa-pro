import { describe, expect, it } from "vitest";
import { formatCapturedAt, formatDurationMs } from "./format";

describe("formatCapturedAt", () => {
  it("returns the empty string for empty/invalid input", () => {
    expect(formatCapturedAt(null)).toBe("");
    expect(formatCapturedAt(undefined)).toBe("");
    expect(formatCapturedAt("")).toBe("");
    expect(formatCapturedAt("not-a-date")).toBe("");
  });

  it("formats a valid ISO timestamp non-empty", () => {
    expect(formatCapturedAt("2026-04-20T10:53:00Z")).not.toBe("");
  });
});

describe("formatDurationMs", () => {
  it("renders m:ss with zero-padded seconds", () => {
    expect(formatDurationMs(0)).toBe("0:00");
    expect(formatDurationMs(15000)).toBe("0:15");
    expect(formatDurationMs(60000)).toBe("1:00");
    expect(formatDurationMs(125000)).toBe("2:05");
  });

  it("clamps negative/non-finite values to 0:00", () => {
    expect(formatDurationMs(-100)).toBe("0:00");
    expect(formatDurationMs(Number.NaN)).toBe("0:00");
  });
});
