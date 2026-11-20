// Groups certificates into stages of life (a wall each in the Certificates hall), using each certificate's
// date. The stages come from _system/certificates.md, for example:
//   stages:
//     - { name: "School", until: "2020-06-01" }
//     - { name: "University", until: "2024-06-01" }
//     - { name: "Work" }                      (the last one has no end)
// Without that file every certificate is on one wall. Empty stages are left out.
export interface Stage {
  name: string;
  until: string; // first date NOT in this stage (YYYY-MM-DD)
}
export const ALL: Stage[] = [{ name: "Certificates", until: "9999-12-31" }];

export function stageOf(date: string, stages: Stage[]): string {
  return stages.find((s) => date < s.until)?.name ?? stages[stages.length - 1].name;
}

// Oldest first inside each stage, so the walls read like a timeline.
export function certStages<T extends { date: string }>(certs: T[], stages: Stage[] = ALL): { name: string; certs: T[] }[] {
  return stages
    .map((stage) => ({
      name: stage.name,
      certs: certs.filter((c) => stageOf(c.date, stages) === stage.name).sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .filter((group) => group.certs.length > 0);
}
