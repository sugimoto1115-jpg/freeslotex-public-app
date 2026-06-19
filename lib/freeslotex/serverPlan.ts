import { query } from "@/lib/db";
import {
  fsHasFeature,
  normalizeFsPlan,
  type FsFeature,
  type FsPlan,
} from "./entitlements";

let ensurePlanTablePromise: Promise<void> | null = null;

function envEmailSet(name: string): Set<string> {
  return new Set(
    String(process.env[name] ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

function normalizeEmail(email: string | null | undefined) {
  return String(email ?? "").trim().toLowerCase();
}

export function isFsAdminEmailFromEnv(email: string | null | undefined): boolean {
  const normalizedEmail = normalizeEmail(email);
  return Boolean(
    normalizedEmail &&
      envEmailSet("FREESLOTEX_ADMIN_EMAILS").has(normalizedEmail),
  );
}

export function getFsPlanForEmail(email: string | null | undefined): FsPlan {
  const normalizedEmail = normalizeEmail(email);

  if (normalizedEmail && envEmailSet("FREESLOTEX_ADMIN_EMAILS").has(normalizedEmail)) {
    return "admin";
  }

  if (normalizedEmail && envEmailSet("FREESLOTEX_PAID_EMAILS").has(normalizedEmail)) {
    return "paid";
  }

  return normalizeFsPlan(process.env.FREESLOTEX_DEFAULT_PLAN);
}

export async function ensureFsPlanTable() {
  if (!ensurePlanTablePromise) {
    ensurePlanTablePromise = (async () => {
      await query(`
        create table if not exists freeslotex_user_plans (
          email text primary key,
          plan text not null check (plan in ('free', 'paid', 'admin')),
          note text not null default '',
          set_by_email text not null default '',
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `);

      await query(`
        create index if not exists freeslotex_user_plans_plan_idx
        on freeslotex_user_plans(plan)
      `);
    })();
  }

  await ensurePlanTablePromise;
}

export async function getStoredFsPlanForEmail(
  email: string | null | undefined,
): Promise<FsPlan | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  await ensureFsPlanTable();

  const result = await query<{ plan: string }>(
    `
      select plan
      from freeslotex_user_plans
      where email = lower($1)
      limit 1
    `,
    [normalizedEmail],
  );

  if (result.rows.length === 0) return null;

  return normalizeFsPlan(result.rows[0].plan);
}

export async function getEffectiveFsPlanForEmail(
  email: string | null | undefined,
): Promise<FsPlan> {
  if (isFsAdminEmailFromEnv(email)) {
    return "admin";
  }

  const storedPlan = await getStoredFsPlanForEmail(email);
  if (storedPlan) {
    return storedPlan;
  }

  return getFsPlanForEmail(email);
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

export async function canUseFsFeatureForEmail(
  email: string | null | undefined,
  feature: FsFeature,
): Promise<
  { allowed: true; plan: FsPlan } | { allowed: false; plan: FsPlan; message: string }
> {
  const plan = await getEffectiveFsPlanForEmail(email);

  if (fsHasFeature(plan, feature)) {
    return { allowed: true, plan };
  }

  return {
    allowed: false,
    plan,
    message: "This feature is available in the paid version of FreeSloTeX.",
  };
}

export async function setFsPlanForEmail(
  email: string,
  planValue: FsPlan,
  setByEmail: string,
) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedSetByEmail = normalizeEmail(setByEmail);
  const plan = normalizeFsPlan(planValue);

  if (!normalizedEmail) {
    throw new Error("email_required");
  }

  await ensureFsPlanTable();

  await query(
    `
      insert into freeslotex_user_plans
        (email, plan, set_by_email, updated_at)
      values
        (lower($1), $2, lower($3), now())
      on conflict (email)
      do update set
        plan = excluded.plan,
        set_by_email = excluded.set_by_email,
        updated_at = now()
    `,
    [normalizedEmail, plan, normalizedSetByEmail],
  );

  return plan;
}
