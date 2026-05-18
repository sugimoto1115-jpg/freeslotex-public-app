import { NextRequest, NextResponse } from "next/server";
import {
  createSession,
  makeSessionCookieOptions,
  validateEmail,
  verifyPassword,
} from "@/lib/auth";
import { query } from "@/lib/db";

function redirectWithError(request: NextRequest, message: string) {
  const url = new URL("/login", "http://labtex.freeslot-schedule.com");
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const emailRaw = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const email = validateEmail(emailRaw);
    if (!email) {
      return redirectWithError(
        request,
        "メールアドレスまたはパスワードが正しくありません。"
      );
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
      [email]
    );

    if (result.rows.length === 0) {
      return redirectWithError(
        request,
        "メールアドレスまたはパスワードが正しくありません。"
      );
    }

    const user = result.rows[0];

    if (user.status !== "active") {
      return redirectWithError(request, "このアカウントは現在利用できません。");
    }

    if (!verifyPassword(password, user.password_hash)) {
      return redirectWithError(
        request,
        "メールアドレスまたはパスワードが正しくありません。"
      );
    }

    await query(
      `
      UPDATE users
      SET last_login_at = now(),
          updated_at = now()
      WHERE lower(email) = lower($1)
      `,
      [email]
    );

    const { rawToken, expiresAt } = await createSession(email);

    const response = NextResponse.redirect(new URL("/workspace", "http://labtex.freeslot-schedule.com"), 303);
    response.cookies.set({
      ...makeSessionCookieOptions(expiresAt),
      value: rawToken,
    });

    return response;
  } catch (error) {
    console.error("POST /api/login failed:", error);
    return redirectWithError(request, "ログイン処理に失敗しました。");
  }
}
