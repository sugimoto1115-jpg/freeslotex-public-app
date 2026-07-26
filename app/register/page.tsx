import Link from "next/link";

type PageProps = {
  searchParams?: Promise<{
    error?: string;
    pending?: string;
    notification?: string;
  }>;
};

export default async function RegisterPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const pending = sp.pending === "1";
  const notification =
    typeof sp.notification === "string" ? sp.notification : "";

  return (
    <main className="fsx-shell">
      <div className="fsx-main">
        <section className="fsx-hero">
          <div>
            <div className="fsx-eyebrow">FreeSloTeX</div>
            <h1 className="fsx-title">Create your account</h1>
            <p className="fsx-subtitle">
              Submit an account request to manage private TeX projects and
              shared collaboration projects.
            </p>
          </div>

          <Link href="/login" className="fsx-button">
            Back to sign in
          </Link>
        </section>

        <section className="fsx-panel" style={{ maxWidth: 680 }}>
          <h2 className="fsx-panel-title">Account settings</h2>
          <p className="fsx-panel-note">
            New accounts require administrator approval before sign-in.
          </p>

          {error ? (
            <div className="fsx-alert" style={{ marginTop: 14 }}>
              {error}
            </div>
          ) : null}

          {pending ? (
            <div
              className="fsx-alert"
              style={{
                marginTop: 14,
                borderColor: "#bbf7d0",
                background: "#f0fdf4",
                color: "#166534",
              }}
            >
              Registration request received. Your account is waiting for
              administrator approval. You will receive an email after approval.
            </div>
          ) : null}

          {pending && notification === "failed" ? (
            <div className="fsx-alert" style={{ marginTop: 14 }}>
              Your request was saved, but the automatic administrator
              notification could not be sent. The request is still visible in
              the administrator page.
            </div>
          ) : null}

          {pending ? (
            <div className="fsx-form-card">
              <Link href="/login" className="fsx-button">
                Back to sign in
              </Link>
            </div>
          ) : (
          <form action="/api/register" method="post" className="fsx-form-card">
            <label>
              <span className="fsx-label">Display name</span>
              <input
                name="displayName"
                type="text"
                required
                className="fsx-input"
                placeholder="Your name"
              />
            </label>

            <label style={{ display: "block", marginTop: 14 }}>
              <span className="fsx-label">Email</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="fsx-input"
                placeholder="you@example.com"
              />
            </label>

            <label style={{ display: "block", marginTop: 14 }}>
              <span className="fsx-label">Password</span>
              <input
                name="password"
                type="password"
                required
                autoComplete="new-password"
                className="fsx-input"
                placeholder="Password"
              />
            </label>

            <label style={{ display: "block", marginTop: 14 }}>
              <span className="fsx-label">Confirm password</span>
              <input
                name="confirmPassword"
                type="password"
                required
                autoComplete="new-password"
                className="fsx-input"
                placeholder="Confirm password"
              />
            </label>

            <div className="fsx-actions" style={{ marginTop: 18 }}>
              <button type="submit" className="fsx-button fsx-button-primary">
                Submit registration request
              </button>

              <Link href="/login" className="fsx-button">
                Cancel
              </Link>
            </div>
          </form>
          )}
        </section>
      </div>
    </main>
  );
}
