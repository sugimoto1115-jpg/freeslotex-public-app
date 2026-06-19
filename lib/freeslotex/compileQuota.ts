import { query } from "@/lib/db";
import { getEffectiveFsPlanForEmail } from "@/lib/freeslotex/serverPlan";

export const FREE_DAILY_COMPILE_LIMIT = 50;

type CompileUsageRow = {
  usage_date: string;
  compile_count: string;
};

let ensureCompileUsageTablePromise: Promise<void> | null = null;

function normalizeEmail(email: string | null | undefined) {
  return String(email ?? "").trim().toLowerCase();
}

export async function ensureCompileUsageTable() {
  if (!ensureCompileUsageTablePromise) {
    ensureCompileUsageTablePromise = (async () => {
      await query(`
        create table if not exists freeslotex_compile_usage (
          email text not null,
          usage_date date not null,
          compile_count integer not null default 0,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          primary key (email, usage_date)
        )
      `);

      await query(`
        create index if not exists freeslotex_compile_usage_email_idx
        on freeslotex_compile_usage(email)
      `);
    })();
  }

  await ensureCompileUsageTablePromise;
}

export async function getCompileQuotaForEmail(email: string | null | undefined) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return {
      ok: false,
      error: "email_required",
    };
  }

  await ensureCompileUsageTable();

  const plan = await getEffectiveFsPlanForEmail(normalizedEmail);

  const result = await query<CompileUsageRow>(
    `
      select
        (timezone('Asia/Tokyo', now()))::date::text as usage_date,
        coalesce(u.compile_count, 0)::text as compile_count
      from (select 1) x
      left join freeslotex_compile_usage u
        on u.email = lower($1)
       and u.usage_date = (timezone('Asia/Tokyo', now()))::date
      limit 1
    `,
    [normalizedEmail],
  );

  const row = result.rows[0];
  const usedToday = Number(row?.compile_count ?? "0");

  const freeDailyLimit =
    plan === "free" ? FREE_DAILY_COMPILE_LIMIT : null;

  const remainingToday =
    freeDailyLimit === null
      ? null
      : Math.max(0, freeDailyLimit - usedToday);

  return {
    ok: true,
    email: normalizedEmail,
    plan,
    usageDate: row?.usage_date ?? "",
    usedToday,
    freeDailyLimit,
    remainingToday,
    canCompile:
      freeDailyLimit === null ? true : usedToday < freeDailyLimit,
  };
}
