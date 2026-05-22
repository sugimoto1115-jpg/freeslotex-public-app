import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, validateEmail } from "@/lib/auth";
import { query } from "@/lib/db";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

type UserRow = {
  id: number;
};

type ProjectAccessRow = {
  id: number;
  owner_user_id: number;
  my_role: string | null;
};

function makeUrl(request: NextRequest, pathname: string) {
  const rawHost =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "labtex.freeslot-schedule.com";

  const host =
    rawHost.includes("localhost") || rawHost.includes("127.0.0.1")
      ? "labtex.freeslot-schedule.com"
      : rawHost;

  const proto =
    request.headers.get("x-forwarded-proto") ??
    (host.includes("freeslot-schedule.com") ? "https" : "http");

  return new URL(pathname, `${proto}://${host}`);
}

function redirectToProject(
  request: NextRequest,
  projectId: string,
  search: Record<string, string>,
) {
  const url = makeUrl(request, `/projects/${projectId}`);
  for (const [key, value] of Object.entries(search)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const projectId = Number(id);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return redirectToProject(request, id, { members_error: "bad_project" });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.redirect(makeUrl(request, "/login"), 303);
  }

  const currentUserResult = await query<UserRow>(
    `
      select id
      from users
      where lower(email) = lower($1)
      limit 1
    `,
    [currentUser.email],
  );

  if (currentUserResult.rows.length === 0) {
    return redirectToProject(request, id, { members_error: "forbidden" });
  }

  const currentUserId = Number(currentUserResult.rows[0].id);

  const accessResult = await query<ProjectAccessRow>(
    `
      select
        p.id,
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
    [projectId, currentUserId],
  );

  if (accessResult.rows.length === 0) {
    return redirectToProject(request, id, { members_error: "forbidden" });
  }

  const access = accessResult.rows[0];
  const canManage = access.owner_user_id === currentUserId || access.my_role === "owner";

  if (!canManage) {
    return redirectToProject(request, id, { members_error: "forbidden" });
  }

  const formData = await request.formData();
  const emailRaw = String(formData.get("email") ?? "");
  const roleRaw = String(formData.get("role") ?? "editor").trim().toLowerCase();

  const email = validateEmail(emailRaw);
  if (!email) {
    return redirectToProject(request, id, { members_error: "invalid_email" });
  }

  if (!["editor", "viewer"].includes(roleRaw)) {
    return redirectToProject(request, id, { members_error: "invalid_role" });
  }

  const targetUserResult = await query<UserRow>(
    `
      select id
      from users
      where lower(email) = lower($1)
      limit 1
    `,
    [email],
  );

  if (targetUserResult.rows.length === 0) {
    return redirectToProject(request, id, { members_error: "no_user" });
  }

  const targetUserId = Number(targetUserResult.rows[0].id);

  await query(
    `
      insert into project_members (
        project_id,
        user_id,
        role,
        invited_by_user_id,
        joined_at,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, now(), now(), now())
      on conflict (project_id, user_id)
      do update
      set
        role = excluded.role,
        invited_by_user_id = excluded.invited_by_user_id,
        updated_at = now()
    `,
    [projectId, targetUserId, roleRaw, currentUserId],
  );

  await query(
    `
      update projects
      set updated_at = now()
      where id = $1
    `,
    [projectId],
  );

  return redirectToProject(request, id, { members: "saved" });
}
