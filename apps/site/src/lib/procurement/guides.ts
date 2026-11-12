export function sortProcurementGuides<T extends { id: string; data: { order: number } }>(guides: readonly T[]): T[] {
  for (const guide of guides) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(guide.id)
      || ["guides", "how-to-buy-from-china"].includes(guide.id)) {
      throw new Error(`Invalid or reserved procurement guide slug: ${guide.id}`);
    }
  }
  return [...guides].sort((a, b) => a.data.order - b.data.order || a.id.localeCompare(b.id));
}
