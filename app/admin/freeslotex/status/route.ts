import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getEffectiveFsPlanForEmail } from "@/lib/freeslotex/serverPlan";
import { sendGraphMail } from "@/lib/graphMail";

export const runtime = "nodejs";

type TargetUserRow = {
  id: number;
  email: string;
  display_name: string | null;
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

function getAppOrigin(request: NextRequest) {
  return process.env.APP_ORIGIN || makeUrl(request, "/").origin;
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
        select id, email, display_name, status
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

    const currentStatus = target.status.trim().toLowerCase();
    const validTransition =
      (currentStatus === "pending" && requestedStatus === "active") ||
      (currentStatus === "active" && requestedStatus === "suspended") ||
      (currentStatus === "suspended" && requestedStatus === "active");

    if (!validTransition) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return redirectToAdmin(request, {
        error: "invalid_account_status_transition",
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

    const responseParams: Record<string, string> = {
      status_updated: target.email,
      status_value: requestedStatus,
    };

    if (
      target.status.trim().toLowerCase() === "pending" &&
      requestedStatus === "active"
    ) {
      try {
        const loginUrl = `${getAppOrigin(request)}/login`;
        const displayName = target.display_name || target.email;

        await sendGraphMail({
          to: target.email,
          subject: "Your FreeSloTeX account has been approved",
          text: [
            `Hello ${displayName},`,
            "",
            "Your FreeSloTeX account has been approved.",
            "",
            "You can sign in using the email address and password you entered during registration:",
            loginUrl,
            "",
            "FreeSloTeX Support",
          ].join("\n"),
        });
      } catch (mailError) {
        console.error("Approval notification email failed:", mailError);
        responseParams.error = "approval_email_failed_after_approval";
      }
    }

    return redirectToAdmin(request, responseParams);
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
