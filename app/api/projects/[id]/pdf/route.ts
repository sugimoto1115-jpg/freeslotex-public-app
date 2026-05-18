import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { getCurrentUser } from "@/lib/auth";
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
  name: string;
  storage_path: string;
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

function getWorkspacesRoot() {
  return process.env.LABTEX_WORKSPACES_ROOT || "/home/tomoyuki/labtex/workspaces";
}

function resolveProjectDir(storagePath: string) {
  const root = path.resolve(getWorkspacesRoot());
  const full = path.resolve(root, storagePath);

  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("Resolved project path is outside LABTEX_WORKSPACES_ROOT.");
  }

  return full;
}

function safeFilename(name: string) {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "main";
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const projectId = Number(id);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return new NextResponse("Bad project", { status: 400 });
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

  const projectResult = await query<ProjectAccessRow>(
    `
      select
        p.id,
        p.name,
        p.storage_path
      from projects p
      left join project_members pm
        on pm.project_id = p.id
       and pm.user_id = $2
      where p.id = $1
        and p.status = 'active'
        and (
          p.owner_user_id = $2
          or pm.user_id is not null
        )
      limit 1
    `,
    [projectId, currentUserId]
  );

  if (projectResult.rows.length === 0) {
    return new NextResponse("Not found", { status: 404 });
  }

  const project = projectResult.rows[0];
  const pdfPath = path.join(resolveProjectDir(project.storage_path), "main.pdf");

  let pdf: Buffer;
  try {
    pdf = await readFile(pdfPath);
  } catch {
    return new NextResponse("PDF not found. Please compile first.", { status: 404 });
  }

  const inlinePreview = request.nextUrl.searchParams.get("inline") === "1";
  const disposition = inlinePreview ? "inline" : "attachment";

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${disposition}; filename="${safeFilename(project.name)}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
