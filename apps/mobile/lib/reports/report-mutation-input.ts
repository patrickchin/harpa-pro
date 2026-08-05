export function reportMutationInput(
  project: string,
  number: number,
  expectedUpdatedAt: string,
) {
  return {
    params: { project, number },
    body: { expectedUpdatedAt },
  };
}
