import { NextRequest, NextResponse } from "next/server";
import { validateEmail } from "@/lib/auth";
import { query } from "@/lib/db";
import { sendGraphMail } from "@/lib/graphMail";
import { createPasswordResetToken } from "@/lib/passwordReset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserRow = {
  email: string;
  display_name: string | null;
};

function redirectToDone() {
  const url = new URL("/account/forgot-password", getAppOrigin());
  url.searchParams.set("sent", "1");
  return NextResponse.redirect(url, 303);
}

function getAppOrigin() {
  return process.env.APP_ORIGIN || "https://labtex.freeslot-schedule.com";
}

async function findUserByEmail(email: string) {
  const result = await query<UserRow>(
    `
    select email, display_name
    from users
    where lower(email) = lower($1)
    limit 1
    `,
    [email],
  );

  return result.rows[0] ?? null;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = validateEmail(String(formData.get("email") ?? ""));

  if (!email) {
    return redirectToDone();
  }

  const user = await findUserByEmail(email);

  if (!user) {
    return redirectToDone();
  }

  try {
    const resetToken = await createPasswordResetToken(user.email);
    const resetUrl = `${getAppOrigin()}/account/reset-password?token=${encodeURIComponent(
      resetToken.rawToken,
    )}`;

    const displayName = user.display_name || user.email;

    await sendGraphMail({
      to: user.email,
      subject: "Reset your FreeSloTeX password",
      text: [
        `Hello ${displayName},`,
        "",
        "We received a request to reset your FreeSloTeX password.",
        "",
        "Please open the following link to set a new password:",
        resetUrl,
        "",
        `This link is valid for ${resetToken.ttlMinutes} minutes and can be used only once.`,
        "",
        "If you did not request this, you can ignore this email.",
        "",
        "FreeSloTeX Support",
      ].join("\n"),
    });
  } catch (error) {
    console.error("forgot password mail failed:", error);
  }

  return redirectToDone();
}
