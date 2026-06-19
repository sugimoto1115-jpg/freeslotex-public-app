import { mkdir, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getEffectiveFsPlanForEmail } from "@/lib/freeslotex/serverPlan";

export const runtime = "nodejs";

const FREE_PROJECT_LIMIT = 10;

function makeUrl(request: NextRequest, path: string) {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "labtex.freeslot-schedule.com";

  const proto =
    request.headers.get("x-forwarded-proto") ??
    "http";

  return new URL(path, `${proto}://${host}`);
}

function redirectWithError(request: NextRequest, message: string) {
  const url = makeUrl(request, "/projects/new");
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, 303);
}

function getWorkspacesRoot() {
  return process.env.LABTEX_WORKSPACES_ROOT || "/home/tomoyuki/labtex/workspaces";
}

async function writeFileIfAbsent(path: string, content: string) {
  try {
    await writeFile(path, content, { flag: "wx" });
  } catch (error: any) {
    if (error?.code !== "EEXIST") {
      throw error;
    }
  }
}

function makeMainTex(projectName: string) {
  const safeTitle = projectName
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");

  return `\\documentclass[a4paper,11pt]{ltjsarticle}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{${safeTitle}}
\\author{}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introduction}

Write here.

\\end{document}
`;
}

function makeReadme(projectName: string) {
  return `# ${projectName}

This project was created automatically by FreeSloTeX.

## Files

- \`main.tex\`
- \`README.md\`
- \`.gitignore\`
`;
}

function makeGitignore() {
  return `# LaTeX intermediate files
*.aux
*.bbl
*.bcf
*.blg
*.fdb_latexmk
*.fls
*.log
*.nav
*.out
*.run.xml
*.snm
*.synctex.gz
*.toc
*.xdv
*.dvi

# Build output
*.pdf

# OS/editor
.DS_Store
Thumbs.db
.vscode/settings.json
`;
}

function makeCodeWorkspace(projectId: number, projectName: string) {
  return JSON.stringify(
    {
      folders: [
        {
          name: `Project ${projectId}: ${projectName}`,
          path: ".",
        },
      ],
      settings: {
        "files.exclude": {
          "**/*.aux": true,
          "**/*.log": true,
          "**/*.fls": true,
          "**/*.fdb_latexmk": true,
          "**/*.synctex.gz": true,
        },
      },
    },
    null,
    2
  ) + "\n";
}

export async function POST(request: NextRequest) {
  const client = await pool.connect();

  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.redirect(makeUrl(request, "/login"), 303);
    }

    const formData = await request.formData();
    const name = String(formData.get("name") ?? "").trim();

    if (!name) {
      return redirectWithError(request, "プロジェクト名を入力してください。");
    }

    if (name.length > 255) {
      return redirectWithError(request, "プロジェクト名が長すぎます。");
    }

    await client.query("BEGIN");

    const userResult = await client.query<{ id: number }>(
      `
      SELECT id
      FROM users
      WHERE lower(email) = lower($1)
      LIMIT 1
      `,
      [currentUser.email]
    );

    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.redirect(makeUrl(request, "/login"), 303);
    }

    const ownerUserId = userResult.rows[0].id;
    const fsPlan = await getEffectiveFsPlanForEmail(currentUser.email);

    if (fsPlan === "free") {
      const quotaResult = await client.query<{ count: string }>(
        `
        SELECT count(*)::text AS count
        FROM projects
        WHERE owner_user_id = $1
          AND coalesce(status, 'active') <> 'archived'
        `,
        [ownerUserId]
      );

      const activeProjectCount = Number(quotaResult.rows[0]?.count ?? "0");

      if (activeProjectCount >= FREE_PROJECT_LIMIT) {
        await client.query("ROLLBACK");
        return redirectWithError(
          request,
          `Freeプランでは作成できるプロジェクト数は${FREE_PROJECT_LIMIT}個までです。現在 ${activeProjectCount} 個あります。`
        );
      }
    }

    const storagePath = `projects/${ownerUserId}/${Date.now()}-${randomUUID()}`;

    const projectResult = await client.query<{ id: number }>(
      `
      INSERT INTO projects (
        owner_user_id,
        name,
        storage_path,
        visibility,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, 'private', 'active', now(), now())
      RETURNING id
      `,
      [ownerUserId, name, storagePath]
    );

    const projectId = projectResult.rows[0].id;

    await client.query(
      `
      INSERT INTO project_members (
        project_id,
        user_id,
        role,
        invited_by_user_id,
        joined_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, 'owner', $2, now(), now(), now())
      ON CONFLICT (project_id, user_id) DO NOTHING
      `,
      [projectId, ownerUserId]
    );

    const projectDir = join(getWorkspacesRoot(), storagePath);
    await mkdir(projectDir, { recursive: true });

    await writeFileIfAbsent(join(projectDir, "main.tex"), makeMainTex(name));
    await writeFileIfAbsent(join(projectDir, "README.md"), makeReadme(name));
    await writeFileIfAbsent(join(projectDir, ".gitignore"), makeGitignore());
    await writeFileIfAbsent(
      join(projectDir, "project.code-workspace"),
      makeCodeWorkspace(projectId, name)
    );

    await client.query("COMMIT");

    return NextResponse.redirect(makeUrl(request, `/projects/${projectId}`), 303);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    console.error("POST /api/projects/new failed:", error);
    return redirectWithError(request, "プロジェクト作成に失敗しました。");
  } finally {
    client.release();
  }
}