import {
  fsHasFeature,
  normalizeFsPlan,
  type FsFeature,
  type FsPlan,
} from "./entitlements";

function envEmailSet(name: string): Set<string> {
  return new Set(
    String(process.env[name] ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function getFsPlanForEmail(email: string | null | undefined): FsPlan {
  const normalizedEmail = String(email ?? "").trim().toLowerCase();

  if (normalizedEmail && envEmailSet("FREESLOTEX_ADMIN_EMAILS").has(normalizedEmail)) {
    return "admin";
  }

  if (normalizedEmail && envEmailSet("FREESLOTEX_PAID_EMAILS").has(normalizedEmail)) {
    return "paid";
  }

  return normalizeFsPlan(process.env.FREESLOTEX_DEFAULT_PLAN);
}

export function canUseFsFeature(
  email: string | null | undefined,
  feature: FsFeature,
): { allowed: true; plan: FsPlan } | { allowed: false; plan: FsPlan; message: string } {
  const plan = getFsPlanForEmail(email);

  if (fsHasFeature(plan, feature)) {
    return { allowed: true, plan };
  }

  return {
    allowed: false,
    plan,
    message: "This feature is available in the paid version of FreeSloTeX.",
  };
}
