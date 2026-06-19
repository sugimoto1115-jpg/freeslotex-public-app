export type FsPlan = "free" | "student" | "paid" | "admin";

export type FsFeature =
  | "edit"
  | "save"
  | "saveAs"
  | "compile"
  | "pdfPreview"
  | "download"
  | "upload"
  | "deleteFile"
  | "outline"
  | "historyRestore"
  | "checkpoint"
  | "restoreDeletedFile"
  | "largerStorage"
  | "longerCompile"
  | "labMembers"
  | "templates"
  | "assignmentWorkflow";

const FREE_FEATURES: FsFeature[] = [
  "edit",
  "save",
  "saveAs",
  "compile",
  "pdfPreview",
  "download",
  "upload",
  "deleteFile",
  "outline",
];

const PAID_FEATURES: FsFeature[] = [
  ...FREE_FEATURES,
  "historyRestore",
  "checkpoint",
  "restoreDeletedFile",
  "largerStorage",
  "longerCompile",
  "labMembers",
  "templates",
  "assignmentWorkflow",
];

export function normalizeFsPlan(value: unknown): FsPlan {
  const plan = String(value ?? "").trim().toLowerCase();
  if (plan === "student" || plan === "paid" || plan === "admin") return plan;
  return "free";
}

export function fsPlanLabel(plan: FsPlan): string {
  if (plan === "admin") return "Admin";
  if (plan === "paid") return "Paid";
  if (plan === "student") return "Student";
  return "Free";
}

export function fsHasFeature(planValue: unknown, feature: FsFeature): boolean {
  const plan = normalizeFsPlan(planValue);
  if (plan === "admin") return true;
  if (plan === "paid" || plan === "student") return PAID_FEATURES.includes(feature);
  return FREE_FEATURES.includes(feature);
}
