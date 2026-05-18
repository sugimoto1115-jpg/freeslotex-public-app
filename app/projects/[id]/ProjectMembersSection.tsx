import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import ProjectMembersFlash from "./ProjectMembersFlash";

type Props = {
  projectId: string;
};

type CurrentUserRow = {
  id: number;
};

type AccessRow = {
  owner_user_id: number;
  my_role: string | null;
};

type MemberRow = {
  id: number;
  email: string;
  display_name: string | null;
  role: string;
  joined_at: string | Date | null;
};

function formatDate(value: string | Date | null): string {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function roleLabel(role: string): string {
  switch (role) {
    case "owner":
      return "owner";
    case "editor":
      return "editor";
    case "viewer":
      return "viewer";
    default:
      return role;
  }
}

export default async function ProjectMembersSection({ projectId }: Props) {
  const projectIdNum = Number(projectId);
  if (!Number.isInteger(projectIdNum) || projectIdNum <= 0) {
    return null;
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return null;
  }

  const currentUserResult = await query<CurrentUserRow>(
    `
      select id
      from users
      where lower(email) = lower($1)
      limit 1
    `,
    [currentUser.email],
  );

  if (currentUserResult.rows.length === 0) {
    return null;
  }

  const currentUserId = Number(currentUserResult.rows[0].id);

  const accessResult = await query<AccessRow>(
    `
      select
        p.owner_user_id,
        case
          when p.owner_user_id = $2 then 'owner'
          else pm.role
        end as my_role
      from projects p
      left join project_members pm
        on pm.project_id = p.id
       and pm.user_id = $2
      where p.id = $1
      limit 1
    `,
    [projectIdNum, currentUserId],
  );

  if (accessResult.rows.length === 0) {
    return null;
  }

  const access = accessResult.rows[0];
  if (!access.my_role) {
    return null;
  }

  const canManage = access.my_role === "owner";

  const membersResult = await query<MemberRow>(
    `
      with member_rows as (
        select
          u.id,
          u.email,
          u.display_name,
          pm.role,
          pm.joined_at
        from project_members pm
        join users u
          on u.id = pm.user_id
        where pm.project_id = $1
      ),
      owner_row as (
        select
          u.id,
          u.email,
          u.display_name,
          'owner'::varchar as role,
          p.created_at as joined_at
        from projects p
        join users u
          on u.id = p.owner_user_id
        where p.id = $1
      ),
      merged as (
        select * from owner_row
        union all
        select * from member_rows
      ),
      dedup as (
        select distinct on (id)
          id,
          email,
          display_name,
          role,
          joined_at
        from merged
        order by
          id,
          case when role = 'owner' then 0 else 1 end,
          joined_at
      )
      select
        id,
        email,
        display_name,
        role,
        joined_at
      from dedup
      order by
        case when role = 'owner' then 0 else 1 end,
        joined_at nulls last,
        email
    `,
    [projectIdNum],
  );

  const members = membersResult.rows;

  return (
    <section className="fsx-panel">
      <div className="fsx-panel-head">
        <div>
          <h2 className="fsx-panel-title">Members</h2>
          <p className="fsx-panel-note">
            Manage users who can access this project.
          </p>
        </div>
      </div>

      <ProjectMembersFlash />

      <div className="fsx-table-wrap">
        <div className="fsx-table-scroll">
          <table className="fsx-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>
                    {member.display_name && member.display_name.trim().length > 0
                      ? member.display_name
                      : "-"}
                  </td>
                  <td>{member.email}</td>
                  <td>{roleLabel(member.role)}</td>
                  <td>{formatDate(member.joined_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canManage ? (
        <form
          action={`/api/projects/${projectId}/members`}
          method="post"
          className="fsx-form-card"
        >
          <h3 className="fsx-panel-title" style={{ fontSize: 18 }}>
            Add member
          </h3>
          <p className="fsx-panel-note">
            Add an existing user to this project by email address.
          </p>

          <div className="fsx-form-grid" style={{ marginTop: 14 }}>
            <label>
              <span className="fsx-label">Email</span>
              <input
                name="email"
                type="email"
                required
                placeholder="member@example.com"
                className="fsx-input"
              />
            </label>

            <label>
              <span className="fsx-label">Role</span>
              <select name="role" defaultValue="editor" className="fsx-select">
                <option value="editor">editor</option>
                <option value="viewer">viewer</option>
              </select>
            </label>

            <button type="submit" className="fsx-button fsx-button-primary">
              Add
            </button>
          </div>
        </form>
      ) : (
        <p className="fsx-panel-note">Only the owner can add members.</p>
      )}
    </section>
  );
}
