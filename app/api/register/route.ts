import { NextRequest, NextResponse } from "next/server";
import {
  createSession,
  hashPassword,
  makeSessionCookieOptions,
  validateEmail,
  validatePassword,
} from "@/lib/auth";
import { query } from "@/lib/db";

function makeUrl(request: NextRequest, path: string) {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "labtex.freeslot-schedule.com";

  const proto =
    request.headers.get("x-forwarded-proto") ??
    "http";

  return new URL(path, `${proto}://${host}`);
}

function redirectWithError(request: NextRequest, message: string) {
  const url = makeUrl(request, "/register");
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const displayNameRaw = String(formData.get("displayName") ?? "").trim();
    const emailRaw = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    const displayName = displayNameRaw ? displayNameRaw.slice(0, 100) : null;

    const email = validateEmail(emailRaw);
    if (!email) {
      return redirectWithError(request, "メールアドレスの形式が不正です。");
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return redirectWithError(request, passwordError);
    }

    if (password !== confirmPassword) {
      return redirectWithError(request, "確認用パスワードが一致しません。");
    }

    const existing = await query<{ id: number }>(
      `
      SELECT id
      FROM users
      WHERE lower(email) = lower($1)
      LIMIT 1
      `,
      [email]
    );

    if (existing.rows.length > 0) {
      return redirectWithError(
        request,
        "このメールアドレスはすでに登録されています。"
      );
    }

    const passwordHash = hashPassword(password);

    await query(
      `
      INSERT INTO users (
        email,
        password_hash,
        display_name,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, 'active', now(), now())
      `,
      [email, passwordHash, displayName]
    );

    const { rawToken, expiresAt } = await createSession(email);

    const response = NextResponse.redirect(makeUrl(request, "/projects"), 303);
    response.cookies.set({
      ...makeSessionCookieOptions(expiresAt),
      value: rawToken,
    });

    return response;
  } catch (error) {
    console.error("POST /api/register failed:", error);
    return redirectWithError(request, "登録処理に失敗しました。");
  }
}
