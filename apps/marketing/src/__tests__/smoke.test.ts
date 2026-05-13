import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

describe("marketing smoke", () => {
  it("package name is @harpa/marketing", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(here, "../../package.json"), "utf8"),
    ) as { name: string };
    expect(pkg.name).toBe("@harpa/marketing");
  });

  it("astro config targets static output for harpapro.com", () => {
    const cfg = readFileSync(
      resolve(here, "../../astro.config.mjs"),
      "utf8",
    );
    expect(cfg).toContain('site: "https://harpapro.com"');
    expect(cfg).toContain('output: "static"');
  });
});
