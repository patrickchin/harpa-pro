import { describe, expect, it } from "vitest";
import { sortProcurementGuides } from "./guides";

describe("procurement guide routing", () => {
  it("sorts independently merged articles with deterministic ties without mutating input", () => {
    const guides = [
      { id: "shipping", data: { order: 11 } },
      { id: "suppliers", data: { order: 1 } },
      { id: "samples", data: { order: 1 } },
    ];
    expect(sortProcurementGuides(guides).map(({ id }) => id)).toEqual([
      "samples", "suppliers", "shipping",
    ]);
    expect(guides[0]?.id).toBe("shipping");
    expect(sortProcurementGuides([])).toEqual([]);
  });

  it.each(["guides", "how-to-buy-from-china", "nested/guide", "Not-a-slug", "../other", ""])(
    "rejects route collisions and invalid slugs: %s",
    (id) => {
      expect(() => sortProcurementGuides([{ id, data: { order: 1 } }])).toThrow(
        "Invalid or reserved procurement guide slug",
      );
    },
  );
});
