import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { fsPlanLabel } from "@/lib/freeslotex/entitlements";
import { getEffectiveFsPlanForEmail } from "@/lib/freeslotex/serverPlan";

export const runtime = "nodejs";

type UserJsonRow = {
  user_json: Record<string, unknown>;
  project_count: number | string | null;
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

export default async function FreeSloTeXAdminPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
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

  const currentPlan = await getEffectiveFsPlanForEmail(currentUser.email);

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

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const updated = resolvedSearchParams.updated;
  const error = resolvedSearchParams.error;

  const usersResult = await query<UserJsonRow>(`
    select
      to_jsonb(u) as user_json,
      coalesce(pc.project_count, 0)::int as project_count
    from users u
    left join (
      select owner_user_id, count(*)::int as project_count
      from projects
      where owner_user_id is not null
      group by owner_user_id
    ) pc on pc.owner_user_id = u.id
    order by u.id desc
    limit 200
  `);

  const users = await Promise.all(
    usersResult.rows.map(async (row) => {
      const user = row.user_json ?? {};
      const email = textField(user, "email");
      const plan = await getEffectiveFsPlanForEmail(email);

      const projectCountRaw = Number(row.project_count ?? 0);

      return {
        id: textField(user, "id"),
        email,
        status: textField(user, "status") || "-",
        displayName: textField(user, "display_name"),
        createdAt: textField(user, "created_at"),
        updatedAt: textField(user, "updated_at"),
        plan,
        planText: fsPlanLabel(plan),
        projectCount: Number.isFinite(projectCountRaw) ? projectCountRaw : 0,
      };
    }),
  );

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

        {updated ? (
          <div className="fsx-admin-flash fsx-admin-flash-ok">
            Plan updated: {Array.isArray(updated) ? updated[0] : updated}
          </div>
        ) : null}

        {error ? (
          <div className="fsx-admin-flash fsx-admin-flash-error">
            Error: {Array.isArray(error) ? error[0] : error}
          </div>
        ) : null}

        <div className="fsx-admin-note">
          Plan can now be changed from this page. Emails listed in{" "}
          <code>FREESLOTEX_ADMIN_EMAILS</code> still remain Admin for safety.
        </div>

        <div className="fsx-admin-table-wrap">
          <table className="fsx-admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Email</th>
                <th>Plan</th>
                <th>Projects</th>
                <th>Change plan</th>
                  <th>Reset password</th>
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
                  <td>{user.projectCount}</td>
                  <td>
                    <form
                      className="fsx-plan-form"
                      method="post"
                      action="/admin/freeslotex/plans"
                    >
                      <input type="hidden" name="email" value={user.email} />
                      <select
                        className="fsx-plan-select"
                        name="plan"
                        defaultValue={user.plan}
                        aria-label={`Plan for ${user.email}`}
                      >
                        <option value="free">Free</option>
                        <option value="student">Student</option>
                        <option value="paid">Paid</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button className="fsx-plan-save" type="submit">
                        Save
                      </button>
                    </form>
                  </td>
                    <td>
                      <form
                        className="fsx-plan-form"
                        method="post"
                        action="/admin/freeslotex/reset-password"
                      >
                        <input type="hidden" name="email" value={user.email} />
                        <button className="fsx-plan-save" type="submit">
                          Reset
                        </button>
                      </form>
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
