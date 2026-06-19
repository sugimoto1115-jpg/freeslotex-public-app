import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, validateEmail } from "@/lib/auth";
import { getEffectiveFsPlanForEmail } from "@/lib/freeslotex/serverPlan";
import { sendGraphMail } from "@/lib/graphMail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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

async function requireAdminHtml() {
  const currentUser = await getCurrentUser();

  if (!currentUser?.email) {
    return {
      ok: false as const,
      response: htmlResponse(
        `<h1>Login is required</h1>
<p><a href="/login">Login</a></p>`,
        401,
      ),
    };
  }

  const currentPlan = await getEffectiveFsPlanForEmail(currentUser.email);

  if (currentPlan !== "admin") {
    return {
      ok: false as const,
      response: htmlResponse(
        `<h1>Forbidden</h1>
<p>This operation is available only for FreeSloTeX administrators.</p>
<p><a href="/workspace">Back to workspace</a></p>`,
        403,
      ),
    };
  }

  return { ok: true as const, email: currentUser.email };
}

function renderPage(message = "", error = "") {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>FreeSloTeX test mail</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 760px; margin: 40px auto; padding: 0 20px; line-height: 1.6; }
    input { width: 100%; max-width: 520px; padding: 8px; }
    button { padding: 8px 14px; margin-top: 10px; }
    .ok { color: #166534; }
    .error { color: #b91c1c; white-space: pre-wrap; }
    .note { color: #555; }
  </style>
</head>
<body>
  <h1>FreeSloTeX test mail</h1>
  <p class="note">Send one Microsoft Graph Mail test message from the configured support mailbox.</p>
  ${message ? `<p class="ok">${escapeHtml(message)}</p>` : ""}
  ${error ? `<pre class="error">${escapeHtml(error)}</pre>` : ""}
  <form method="post">
    <label>
      To:
      <input name="to" type="email" required placeholder="name@example.com">
    </label>
    <br>
    <button type="submit">Send test mail</button>
  </form>
  <p><a href="/admin/freeslotex">Back to FreeSloTeX admin</a></p>
</body>
</html>`;
}

export async function GET() {
  const admin = await requireAdminHtml();
  if (!admin.ok) return admin.response;

  return htmlResponse(renderPage());
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminHtml();
  if (!admin.ok) return admin.response;

  const formData = await request.formData();
  const to = validateEmail(String(formData.get("to") ?? ""));

  if (!to) {
    return htmlResponse(renderPage("", "Invalid recipient email."), 400);
  }

  try {
    const result = await sendGraphMail({
      to,
      subject: "FreeSloTeX test mail",
      text: [
        "This is a FreeSloTeX Microsoft Graph Mail test.",
        "",
        "If you received this message, the FreeSloTeX mail foundation is working.",
      ].join("\n"),
    });

    return htmlResponse(renderPage(`SEND OK: ${result.from} -> ${result.to}`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return htmlResponse(renderPage("", message), 500);
  }
}
