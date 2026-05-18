import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await query<{
      current_database: string;
      current_user: string;
      now: string;
    }>(`
      select
        current_database() as current_database,
        current_user as current_user,
        now()::text as now
    `);

    return NextResponse.json({
      ok: true,
      database: result.rows[0]?.current_database ?? null,
      user: result.rows[0]?.current_user ?? null,
      now: result.rows[0]?.now ?? null,
    });
  } catch (error) {
    console.error("/api/health/db failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "unknown database error",
      },
      { status: 500 }
    );
  }
}
