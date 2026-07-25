import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getEffectiveFsPlanForEmail } from "@/lib/freeslotex/serverPlan";

export const runtime = "nodejs";

type TargetUserRow = {
  id: number;
  email: string;
  status: string;
};

function makeUrl(request: NextRequest, pathname: string) {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "labtex.freeslot-schedule.com";

  const proto =
    request.headers.get("x-forwarded-proto") ??
    "https";

  return new URL(pathname, `${proto}://${host}`);
}

function redirectToAdmin(
  request: NextRequest,
  params: Record<string, string>,
) {
  const url = makeUrl(request, "/admin/freeslotex");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();

  if (!currentUser?.email) {
    return redirectToAdmin(request, {
      error: "login_required",
    });
  }

  const currentPlan =
    await getEffectiveFsPlanForEmail(currentUser.email);

  if (currentPlan !== "admin") {
    return redirectToAdmin(request, {
      error: "admin_required",
    });
  }

  const formData = await request.formData();
  const targetUserId = Number(formData.get("userId"));
  const requestedStatus = String(
    formData.get("status") ?? "",
  )
    .trim()
    .toLowerCase();

  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return redirectToAdmin(request, {
      error: "invalid_user_id",
    });
  }

  if (
    requestedStatus !== "active" &&
    requestedStatus !== "suspended"
  ) {
    return redirectToAdmin(request, {
      error: "invalid_account_status",
    });
  }

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const targetResult = await client.query<TargetUserRow>(
      `
        select id, email, status
        from users
        where id = $1
        for update
      `,
      [targetUserId],
    );

    if (targetResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return redirectToAdmin(request, {
        error: "target_user_not_found",
      });
    }

    const target = targetResult.rows[0];

    if (
      target.email.trim().toLowerCase() ===
      currentUser.email.trim().toLowerCase()
    ) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return redirectToAdmin(request, {
        error: "cannot_change_current_account",
      });
    }

    const targetPlan =
      await getEffectiveFsPlanForEmail(target.email);

    if (targetPlan === "admin") {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return redirectToAdmin(request, {
        error: "cannot_change_admin",
      });
    }

    await client.query(
      `
        update users
        set status = $1,
            updated_at = now()
        where id = $2
      `,
      [requestedStatus, targetUserId],
    );

    /*
     * Always remove existing sessions. This prevents an old session
     * from becoming valid again when a suspended account is enabled.
     */
    await client.query(
      `
        delete from user_sessions
        where lower(user_email) = lower($1)
      `,
      [target.email],
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return redirectToAdmin(request, {
      status_updated: target.email,
      status_value: requestedStatus,
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("Admin account status update failed", {
      targetUserId,
      requestedStatus,
      error,
    });

    return redirectToAdmin(request, {
      error: "account_status_update_failed",
    });
  } finally {
    client.release();
  }
}
