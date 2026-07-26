import { NextRequest, NextResponse } from "next/server";
import {
  hashPassword,
  validateEmail,
  validatePassword,
} from "@/lib/auth";
import { query } from "@/lib/db";
import { sendGraphMail } from "@/lib/graphMail";

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

function redirectToPending(
  request: NextRequest,
  notification: "sent" | "failed",
) {
  const url = makeUrl(request, "/register");
  url.searchParams.set("pending", "1");
  url.searchParams.set("notification", notification);
  return NextResponse.redirect(url, 303);
}

function getAppOrigin(request: NextRequest) {
  return process.env.APP_ORIGIN || makeUrl(request, "/").origin;
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
      VALUES ($1, $2, $3, 'pending', now(), now())
      `,
      [email, passwordHash, displayName]
    );

    let notification: "sent" | "failed" = "sent";

    try {
      const adminEmail = validateEmail(
        process.env.FREESLOTEX_REGISTRATION_ADMIN_EMAIL ?? "",
      );

      if (!adminEmail) {
        throw new Error(
          "FREESLOTEX_REGISTRATION_ADMIN_EMAIL is not configured.",
        );
      }

      const adminUrl = `${getAppOrigin(request)}/admin/freeslotex`;

      await sendGraphMail({
        to: adminEmail,
        subject: "New FreeSloTeX account approval request",
        text: [
          "A new FreeSloTeX account approval request was submitted.",
          "",
          `Display name: ${displayName || "-"}`,
          `Email: ${email}`,
          `Submitted at: ${new Date().toISOString()}`,
          "",
          "Review the request in the FreeSloTeX admin page:",
          adminUrl,
          "",
          "FreeSloTeX Support",
        ].join("\n"),
      });
    } catch (mailError) {
      notification = "failed";
      console.error(
        "Registration approval notification failed:",
        mailError,
      );
    }

    return redirectToPending(request, notification);
  } catch (error) {
    console.error("POST /api/register failed:", error);
    return redirectWithError(request, "登録処理に失敗しました。");
  }
}
