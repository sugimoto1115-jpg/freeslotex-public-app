import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, hashPassword, validateEmail } from "@/lib/auth";
import { query } from "@/lib/db";
import { getEffectiveFsPlanForEmail } from "@/lib/freeslotex/serverPlan";

export const runtime = "nodejs";

function generateTemporaryPassword(): string {
  return randomBytes(18).toString("base64url");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function htmlResponse(body: string, status = 200): NextResponse {
  return new NextResponse(
    `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="robots" content="noindex,nofollow" />
  <title>FreeSloTeX Reset password</title>
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      margin: 40px;
      line-height: 1.6;
      color: #111827;
      background: #f8fafc;
    }
    main {
      max-width: 760px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 16px;
      padding: 28px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
    }
    code {
      display: inline-block;
      padding: 10px 12px;
      border-radius: 10px;
      background: #f3f4f6;
      font-size: 1.05rem;
      word-break: break-all;
    }
    .warn {
      color: #b45309;
      font-weight: 600;
    }
    a {
      color: #2563eb;
    }
  </style>
</head>
<body>
  <main>
    ${body}
  </main>
</body>
</html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const currentUser = await getCurrentUser();

  if (!currentUser?.email) {
    return htmlResponse(
      `<h1>Login is required</h1>
<p><a href="/login">Login</a></p>`,
      401,
    );
  }

  const currentPlan = await getEffectiveFsPlanForEmail(currentUser.email);

  if (currentPlan !== "admin") {
    return htmlResponse(
      `<h1>Forbidden</h1>
<p>This operation is available only for FreeSloTeX administrators.</p>
<p><a href="/workspace">Back to workspace</a></p>`,
      403,
    );
  }

  const formData = await request.formData();
  const targetEmail = validateEmail(String(formData.get("email") ?? ""));

  if (!targetEmail) {
    return htmlResponse(
      `<h1>Invalid email</h1>
<p>The submitted email address is invalid.</p>
<p><a href="/admin/freeslotex">Back to admin</a></p>`,
      400,
    );
  }

  const userResult = await query<{ email: string }>(
    `
    SELECT email
    FROM users
    WHERE lower(email) = lower($1)
    LIMIT 1
    `,
    [targetEmail],
  );

  if (userResult.rows.length === 0) {
    return htmlResponse(
      `<h1>User not found</h1>
<p>No user was found for ${escapeHtml(targetEmail)}.</p>
<p><a href="/admin/freeslotex">Back to admin</a></p>`,
      404,
    );
  }

  const canonicalEmail = userResult.rows[0].email;
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = hashPassword(temporaryPassword);

  await query(
    `
    UPDATE users
    SET password_hash = $1,
        updated_at = now()
    WHERE lower(email) = lower($2)
    `,
    [passwordHash, canonicalEmail],
  );

  await query(
    `
    DELETE FROM user_sessions
    WHERE lower(user_email) = lower($1)
    `,
    [canonicalEmail],
  );

  return htmlResponse(
    `<h1>Password reset completed</h1>
<p>User: <strong>${escapeHtml(canonicalEmail)}</strong></p>
<p class="warn">Temporary password is shown only on this page. Copy it now.</p>
<p><code>${escapeHtml(temporaryPassword)}</code></p>
<p>Existing sessions for this user have been deleted.</p>
<p><a href="/admin/freeslotex">Back to admin</a></p>`,
  );
}
