import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentUser,
  hashPassword,
  makeSessionCookieOptions,
  validatePassword,
  verifyPassword,
} from "@/lib/auth";
import { query } from "@/lib/db";

export const runtime = "nodejs";

function requestBaseUrl(request: NextRequest): string {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");

  if (host) {
    return `${forwardedProto || "https"}://${host}`;
  }

  return "https://labtex.freeslot-schedule.com";
}

function redirectWithError(request: NextRequest, message: string): NextResponse {
  const url = new URL("/account/password", requestBaseUrl(request));
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, 303);
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
  <title>FreeSloTeX password changed</title>
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      margin: 40px;
      line-height: 1.6;
      color: #111827;
      background: #f8fafc;
    }
    main {
      max-width: 720px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 16px;
      padding: 28px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
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
    const url = new URL("/login", requestBaseUrl(request));
    return NextResponse.redirect(url, 303);
  }

  const formData = await request.formData();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const newPasswordConfirm = String(formData.get("newPasswordConfirm") ?? "");

  if (!currentPassword) {
    return redirectWithError(request, "現在のパスワードを入力してください。");
  }

  if (newPassword !== newPasswordConfirm) {
    return redirectWithError(request, "新しいパスワードが一致しません。");
  }

  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    return redirectWithError(request, passwordError);
  }

  const result = await query<{
    email: string;
    password_hash: string;
    status: string;
  }>(
    `
    SELECT email, password_hash, status
    FROM users
    WHERE lower(email) = lower($1)
    LIMIT 1
    `,
    [currentUser.email],
  );

  if (result.rows.length === 0) {
    return redirectWithError(request, "現在のユーザーが見つかりません。");
  }

  const user = result.rows[0];

  if (user.status !== "active") {
    return redirectWithError(request, "このアカウントは現在利用できません。");
  }

  if (!verifyPassword(currentPassword, user.password_hash)) {
    return redirectWithError(request, "現在のパスワードが正しくありません。");
  }

  if (verifyPassword(newPassword, user.password_hash)) {
    return redirectWithError(
      request,
      "新しいパスワードは現在のパスワードとは別のものにしてください。",
    );
  }

  const newPasswordHash = hashPassword(newPassword);

  await query(
    `
    UPDATE users
    SET password_hash = $1,
        updated_at = now()
    WHERE lower(email) = lower($2)
    `,
    [newPasswordHash, user.email],
  );

  await query(
    `
    DELETE FROM user_sessions
    WHERE lower(user_email) = lower($1)
    `,
    [user.email],
  );

  const response = htmlResponse(
    `<h1>Password changed</h1>
<p>Password was changed for <strong>${escapeHtml(user.email)}</strong>.</p>
<p>All current sessions for this account have been removed.</p>
<p>Please sign in again with the new password.</p>
<p><a href="/login">Go to login</a></p>`,
  );

  response.cookies.set({
    ...makeSessionCookieOptions(new Date(0)),
    value: "",
    expires: new Date(0),
  });

  return response;
}
