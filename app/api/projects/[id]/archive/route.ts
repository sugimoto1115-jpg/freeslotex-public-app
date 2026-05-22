import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

type UserRow = {
  id: number;
};

type ProjectRow = {
  id: number;
  owner_user_id: number;
  status: string;
};

function makeUrl(request: NextRequest, pathname: string) {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "labtex.freeslot-schedule.com";

  const proto =
    request.headers.get("x-forwarded-proto") ??
    (host.includes("freeslot-schedule.com") ? "https" : "http");

  return new URL(pathname, `${proto}://${host}`);
}

function redirectWorkspace(request: NextRequest, search: Record<string, string>) {
  const url = makeUrl(request, "/workspace");
  for (const [key, value] of Object.entries(search)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const projectId = Number(id);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return redirectWorkspace(request, { archive_error: "bad_project" });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser?.email) {
    return NextResponse.redirect(makeUrl(request, "/login"), 303);
  }

  const userResult = await query<UserRow>(
    `
      select id
      from users
      where lower(email) = lower($1)
      limit 1
    `,
    [currentUser.email]
  );

  if (userResult.rows.length === 0) {
    return NextResponse.redirect(makeUrl(request, "/login"), 303);
  }

  const currentUserId = Number(userResult.rows[0].id);

  const projectResult = await query<ProjectRow>(
    `
      select id, owner_user_id, status
      from projects
      where id = $1
      limit 1
    `,
    [projectId]
  );

  if (projectResult.rows.length === 0) {
    return redirectWorkspace(request, { archive_error: "not_found" });
  }

  const project = projectResult.rows[0];

  if (Number(project.owner_user_id) !== currentUserId) {
    return redirectWorkspace(request, { archive_error: "not_owner" });
  }

  if (project.status !== "active") {
    return redirectWorkspace(request, { archive_error: "not_active" });
  }

  await query(
    `
      update projects
      set status = 'archived',
          updated_at = now()
      where id = $1
        and owner_user_id = $2
        and status = 'active'
    `,
    [projectId, currentUserId]
  );

  return redirectWorkspace(request, { archived: "1" });
}
