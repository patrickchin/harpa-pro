import { describe, expect, it } from "vitest";
import { colors } from "./colors";

/** The tokens module is the single source of truth for the design system.
 *  These smoke tests guard against accidental ramp deletions that would
 *  silently break `bg-primary`, `text-warning-text`, etc. in NativeWind. */
describe("colors token map", () => {
  it("exposes the primary ramp with foreground", () => {
    expect(colors.primary.DEFAULT).toMatch(/^#/);
    expect(colors.primary.foreground).toMatch(/^#/);
  });

  it("exposes warning + danger soft/border/text triples used by report cards", () => {
    expect(colors.warning.soft).toBeTruthy();
    expect(colors.warning.border).toBeTruthy();
    expect(colors.warning.text).toBeTruthy();
    expect(colors.danger.soft).toBeTruthy();
    expect(colors.danger.border).toBeTruthy();
    expect(colors.danger.text).toBeTruthy();
  });

  it("exposes the foreground / muted-foreground pair used by lucide icons", () => {
    expect(colors.foreground).toBeTruthy();
    expect(colors.muted.foreground).toBeTruthy();
  });
});
