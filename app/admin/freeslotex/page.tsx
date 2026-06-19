import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { fsPlanLabel } from "@/lib/freeslotex/entitlements";
import { getFsPlanForEmail } from "@/lib/freeslotex/serverPlan";

export const runtime = "nodejs";

type UserJsonRow = {
  user_json: Record<string, unknown>;
};

function textField(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if (value === null || value === undefined) return "";
  return String(value);
}

function fmtDate(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";

  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function FreeSloTeXAdminPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser?.email) {
    return (
      <main className="fsx-main">
        <section className="fsx-panel">
          <h1 className="fsx-title">FreeSloTeX Admin</h1>
          <p className="fsx-muted">Login is required.</p>
          <Link className="fsx-button" href="/login">
            Login
          </Link>
        </section>
      </main>
    );
  }

  const currentPlan = getFsPlanForEmail(currentUser.email);

  if (currentPlan !== "admin") {
    return (
      <main className="fsx-main">
        <section className="fsx-panel">
          <h1 className="fsx-title">FreeSloTeX Admin</h1>
          <p className="fsx-muted">
            This page is available only for FreeSloTeX administrators.
          </p>
          <p className="fsx-muted">
            Current account: {currentUser.email} / Plan: {fsPlanLabel(currentPlan)}
          </p>
          <Link className="fsx-button" href="/workspace">
            Back to workspace
          </Link>
        </section>
      </main>
    );
  }

  const usersResult = await query<UserJsonRow>(`
    select to_jsonb(u) as user_json
    from users u
    order by u.id desc
    limit 200
  `);

  const users = usersResult.rows.map((row) => {
    const user = row.user_json ?? {};
    const email = textField(user, "email");
    const plan = getFsPlanForEmail(email);

    return {
      id: textField(user, "id"),
      email,
      status: textField(user, "status") || "-",
      displayName: textField(user, "display_name"),
      createdAt: textField(user, "created_at"),
      updatedAt: textField(user, "updated_at"),
      plan,
      planText: fsPlanLabel(plan),
    };
  });

  return (
    <main className="fsx-main">
      <section className="fsx-panel fsx-admin-panel">
        <div className="fsx-admin-header">
          <div>
            <h1 className="fsx-title">FreeSloTeX Admin</h1>
            <p className="fsx-account-line">
              {currentUser.email}{" "}
              <span className={`fsx-plan-badge fsx-plan-${currentPlan}`}>
                {fsPlanLabel(currentPlan)}
              </span>
            </p>
          </div>
          <Link className="fsx-button fsx-secondary-button" href="/workspace">
            Back to workspace
          </Link>
        </div>

        <div className="fsx-admin-note">
          Plan is currently determined by <code>.env.local</code>:{" "}
          <code>FREESLOTEX_ADMIN_EMAILS</code> and{" "}
          <code>FREESLOTEX_PAID_EMAILS</code>.
        </div>

        <div className="fsx-admin-table-wrap">
          <table className="fsx-admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Email</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Display name</th>
                <th>Created</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id || user.email}>
                  <td>{user.id}</td>
                  <td className="fsx-admin-email">{user.email}</td>
                  <td>
                    <span className={`fsx-plan-badge fsx-plan-${user.plan}`}>
                      {user.planText}
                    </span>
                  </td>
                  <td>{user.status}</td>
                  <td>{user.displayName || "-"}</td>
                  <td>{fmtDate(user.createdAt)}</td>
                  <td>{fmtDate(user.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
