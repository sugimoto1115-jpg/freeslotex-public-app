import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import type { FsPlan } from "@/lib/freeslotex/entitlements";
import {
  getEffectiveFsPlanForEmail,
  setFsPlanForEmail,
} from "@/lib/freeslotex/serverPlan";

export const runtime = "nodejs";

type UserRow = {
  email: string;
};

function redirectToAdmin(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/admin/freeslotex", request.url);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url);
}

function isFsPlan(value: string): value is FsPlan {
  return value === "free" || value === "paid" || value === "admin";
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();

  if (!currentUser?.email) {
    return redirectToAdmin(request, { error: "login_required" });
  }

  const currentPlan = await getEffectiveFsPlanForEmail(currentUser.email);
  if (currentPlan !== "admin") {
    return NextResponse.json(
      { ok: false, error: "admin_required" },
      { status: 403 },
    );
  }

  const formData = await request.formData();

  const emailRaw = String(formData.get("email") ?? "").trim().toLowerCase();
  const planRaw = String(formData.get("plan") ?? "").trim().toLowerCase();

  if (!emailRaw || !emailRaw.includes("@")) {
    return redirectToAdmin(request, { error: "invalid_email" });
  }

  if (!isFsPlan(planRaw)) {
    return redirectToAdmin(request, { error: "invalid_plan" });
  }

  const targetUserResult = await query<UserRow>(
    `
      select email
      from users
      where lower(email) = lower($1)
      limit 1
    `,
    [emailRaw],
  );

  if (targetUserResult.rows.length === 0) {
    return redirectToAdmin(request, { error: "target_user_not_found" });
  }

  await setFsPlanForEmail(
    targetUserResult.rows[0].email,
    planRaw,
    currentUser.email,
  );

  return redirectToAdmin(request, {
    updated: targetUserResult.rows[0].email,
  });
}
