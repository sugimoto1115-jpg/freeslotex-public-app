import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCompileQuotaForEmail } from "@/lib/freeslotex/compileQuota";

export const runtime = "nodejs";

export async function GET() {
  const currentUser = await getCurrentUser();

  if (!currentUser?.email) {
    return NextResponse.json(
      { ok: false, error: "login_required" },
      { status: 401 },
    );
  }

  const quota = await getCompileQuotaForEmail(currentUser.email);

  return NextResponse.json(quota);
}
