import { NextRequest, NextResponse } from "next/server";
import { hashPassword, validatePassword } from "@/lib/auth";
import { query } from "@/lib/db";
import { consumePasswordResetToken } from "@/lib/passwordReset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAppOrigin() {
  return process.env.APP_ORIGIN || "https://labtex.freeslot-schedule.com";
}

function redirectToResetForm(token: string, error: string) {
  const url = new URL("/account/reset-password", getAppOrigin());
  if (token) url.searchParams.set("token", token);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, 303);
}

function htmlResponse(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderDonePage(email: string) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Password reset completed</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; line-height: 1.6; }
    .card { border: 1px solid #d1d5db; border-radius: 12px; padding: 20px; }
    .ok { color: #166534; font-weight: 700; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Password reset completed</h1>
    <p class="ok">Your FreeSloTeX password has been changed.</p>
    <p>Account: ${escapeHtml(email)}</p>
    <p>Please log in again with your new password.</p>
    <p><a href="/login">Go to login</a></p>
  </div>
</body>
</html>`;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();

  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!token) {
    return redirectToResetForm("", "invalid");
  }

  if (password !== confirmPassword) {
    return redirectToResetForm(token, "password_mismatch");
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return redirectToResetForm(token, "password_invalid");
  }

  const tokenInfo = await consumePasswordResetToken(token);

  if (!tokenInfo) {
    return redirectToResetForm("", "invalid");
  }

  try {
    const passwordHash = hashPassword(password);

    const updateResult = await query(
      `
      update users
      set password_hash = $1
      where lower(email) = lower($2)
      `,
      [passwordHash, tokenInfo.email],
    );

    if (updateResult.rowCount !== 1) {
      return redirectToResetForm("", "failed");
    }

    await query(
      `
      delete from user_sessions
      where lower(user_email) = lower($1)
      `,
      [tokenInfo.email],
    );

    return htmlResponse(renderDonePage(tokenInfo.email));
  } catch (error) {
    console.error("reset password failed:", error);
    return redirectToResetForm("", "failed");
  }
}
