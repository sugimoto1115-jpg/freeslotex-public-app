import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const sent = params.sent === "1";

  return (
    <main className="fsx-main">
      <section className="fsx-panel" style={{ maxWidth: 640 }}>
        <h1 className="fsx-title">Reset your password</h1>

        {sent ? (
          <div className="fsx-card" style={{ marginBottom: 16 }}>
            <p>
              If the email address is registered, a password reset link has been sent.
            </p>
            <p className="fsx-muted">
              The link is valid for 30 minutes. Please also check your spam folder.
            </p>
          </div>
        ) : null}

        <p className="fsx-muted">
          Enter your FreeSloTeX account email address. If the account exists, we will send a reset link.
        </p>

        <form method="post" action="/account/forgot-password/request">
          <label>
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              style={{
                display: "block",
                width: "100%",
                maxWidth: 520,
                marginTop: 6,
                padding: 8,
              }}
            />
          </label>

          <div style={{ marginTop: 16 }}>
            <button className="fsx-button" type="submit">
              Send reset link
            </button>
          </div>
        </form>

        <p style={{ marginTop: 20 }}>
          <Link href="/login">Back to login</Link>
        </p>
      </section>
    </main>
  );
}
