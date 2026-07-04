import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { readFile, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getCompileQuotaForEmail, recordCompileUsageForEmail } from "@/lib/freeslotex/compileQuota";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

type Params = {
  params: Promise<{ id: string }>;
};

type UserRow = {
  id: number;
};

type ProjectAccessRow = {
  id: number;
  storage_path: string;
  owner_user_id: number;
  my_role: "owner" | "editor" | "viewer" | null;
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

function redirectToEdit(request: NextRequest, projectId: string, search: Record<string, string>) {
  const url = makeUrl(request, `/projects/${projectId}/edit`);
  for (const [key, value] of Object.entries(search)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url, 303);
}

function shellQuote(value: string) {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function normalizeRootFile(value: unknown) {
  const raw = String(value ?? "main.tex").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = raw.split("/");

  if (
    !raw ||
    !raw.endsWith(".tex") ||
    raw.includes("\\0") ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("invalid_root_file");
  }

  return raw;
}

function detectCompileScript(tex: string, rootFile = "main.tex") {
  const qRootFile = shellQuote(rootFile);
  const cls = tex.match(/\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/)?.[1] ?? "";

  const hasJapaneseOrFullwidth =
    /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(tex);

  if (/^ltjs(article|book|report)$/.test(cls) || tex.includes("\\usepackage{luatexja}")) {
    return {
      engine: "lualatex",
      script: `latexmk -C || true; latexmk -lualatex -interaction=nonstopmode -halt-on-error ${qRootFile}`,
    };
  }

  if (/^(u)?p?js(article|book|report)$/.test(cls) || /^(jarticle|jbook|jreport)$/.test(cls)) {
    return {
      engine: "uplatex+dvipdfmx",
      script:
        `latexmk -C || true; latexmk -pdfdvi -latex='uplatex -interaction=nonstopmode -halt-on-error %O %S' -dvipdf='dvipdfmx %O -o %D %S' ${qRootFile}`,
    };
  }

  if (hasJapaneseOrFullwidth) {
    return {
      engine: "lualatex-auto-unicode",
      script: `latexmk -C || true; latexmk -lualatex -interaction=nonstopmode -halt-on-error ${qRootFile}`,
    };
  }

  return {
    engine: "pdflatex",
    script: `latexmk -C || true; latexmk -pdf -interaction=nonstopmode -halt-on-error ${qRootFile}`,
  };
}



function extractLatexErrorSummary(text: string, rootFile = "main.tex") {
  const lines = text.split(/\r\n|\r|\n/);

  function excerpt(index: number, before = 8, after = 24) {
    const start = Math.max(0, index - before);
    const end = Math.min(lines.length, index + after);
    return lines.slice(start, end);
  }

  function findLineNumberAfter(index: number) {
    for (let i = index; i < Math.min(lines.length, index + 12); i++) {
      const match = lines[i].match(/^l\.(\d+)\s*(.*)$/);
      if (match) {
        const continuation = lines[i + 1] ?? "";
        const offending = `${match[2] ?? ""} ${continuation}`.trim();
        return {
          index: i,
          lineNumber: match[1],
          offending,
        };
      }
    }

    return null;
  }

  function firstCommand(text: string) {
    return text.match(/\\[A-Za-z@]+|\\./)?.[0] ?? text.trim();
  }

    function makeLikelyMissingBackslashHint(
      errorLine: string,
      lineInfo: { lineNumber: string; offending: string } | null
    ): string[] {
      if (!errorLine.includes("Missing \\begin{document}")) return [];

      const raw = lineInfo?.offending?.trim() ?? "";
      const compact = raw.replace(/\s+/g, "");

      if (!compact || compact.startsWith("\\")) return [];

      const commandMatch = compact.match(
        /^(?:documentclass|usepackage|newtheorem|theoremstyle|begin|end|section|subsection|subsubsection|paragraph|chapter|part|title|author|date|maketitle|label|ref|cite|includegraphics|bibliography|bibliographystyle|input|include)(?:\[[^\]]*\])?(?:\{[^}\r\n]*\}){0,3}/
      );

      if (!commandMatch?.[0]) return [];

      const suspect = commandMatch[0];
      const fixed = `\\${suspect}`;
      const lineLabel = lineInfo?.lineNumber ? `${lineInfo.lineNumber}行目付近の` : "該当行付近の";

      return [
        "FreeSloTeX Hint:",
        `${lineLabel} \`${suspect}\` は、`,
        "LaTeX コマンドの先頭の `\\` が抜けている可能性があります。",
        "",
        "最小修正:",
        fixed,
        "",
      ];
    }


  const undefinedIndex = lines.findIndex((line) =>
    line.includes("Undefined control sequence")
  );

  if (undefinedIndex >= 0) {
    const lineInfo = findLineNumberAfter(undefinedIndex);
    const command = lineInfo ? firstCommand(lineInfo.offending) : "";

    return [
      "FreeSloTeX compile error summary",
      "",
      "原因: 未定義コマンド (Undefined control sequence)",
      `場所: ${rootFile} ${lineInfo?.lineNumber ? `${lineInfo.lineNumber}行目付近` : "行番号不明"}`,
      `問題: ${command || "TeXが知らない命令があります。"}`,
      "",
      "対処:",
      "・コマンド名の誤字を直す",
      "・必要なパッケージを \\usepackage{...} で追加する",
      "・不要なテスト用コマンドなら削除またはコメントアウトする",
      "・自作コマンドなら \\newcommand などで定義する",
      "",
      "該当ログ:",
      "",
      ...excerpt(lineInfo?.index ?? undefinedIndex),
    ].join("\n").slice(0, 16000);
  }

  const fileNotFoundIndex = lines.findIndex((line) =>
    /File .* not found/.test(line) || /LaTeX Error: File .* not found/.test(line)
  );

  if (fileNotFoundIndex >= 0) {
    return [
      "FreeSloTeX compile error summary",
      "",
      "原因: ファイルが見つかりません (File not found)",
      "",
      "対処:",
      "・\\usepackage{...} のパッケージ名が正しいか確認する",
      "・\\includegraphics{...} の画像ファイル名・拡張子・置き場所を確認する",
      "・参照している .bib, .sty, .cls, 画像ファイルなどがプロジェクト内にあるか確認する",
      "",
      "該当ログ:",
      "",
      ...excerpt(fileNotFoundIndex),
    ].join("\n").slice(0, 16000);
  }

  const latexErrorIndex = lines.findIndex((line) =>
    /^! LaTeX Error:/.test(line) || /LaTeX Error:/.test(line) || /Package .* Error:/.test(line)
  );

  if (latexErrorIndex >= 0) {
    const lineInfo = findLineNumberAfter(latexErrorIndex);
    const hint = makeLikelyMissingBackslashHint(lines[latexErrorIndex] ?? "", lineInfo);

    return [
      "FreeSloTeX compile error summary",
      "",
      "原因: LaTeX エラー",
      `場所: ${rootFile} ${lineInfo?.lineNumber ? `${lineInfo.lineNumber}行目付近` : "行番号不明"}`,
      "",
      ...hint,
      "対処:",
      "・最初の `! LaTeX Error:` または `! Package ... Error:` の行を確認する",
      "・近くの `l.<number>` が，TeX が止まった行番号である",
      "",
      "該当ログ:",
      "",
      ...excerpt(lineInfo?.index ?? latexErrorIndex),
    ].join("\n").slice(0, 16000);
  }

  const patterns = [
    /^! /,
    /Emergency stop/,
    /Fatal error occurred/,
    /Missing .* inserted/,
    /Runaway argument/,
    /No pages of output/,
    /Command .* returned with error/,
  ];

  const hit = lines.findIndex((line) => patterns.some((pattern) => pattern.test(line)));

  if (hit >= 0) {
    return [
      "FreeSloTeX compile error summary",
      "",
      "原因: TeX コンパイルエラー",
      "",
      "対処:",
      "・最初に出ている `!` で始まる行を確認する",
      "・近くの `l.<number>` が止まった位置である",
      "",
      "該当ログ:",
      "",
      ...excerpt(hit),
    ].join("\n").slice(0, 16000);
  }

  return [
    "FreeSloTeX compile error summary",
    "",
    "原因: 標準的な LaTeX エラーパターンを検出できませんでした。",
    "最後のコンパイル出力を表示します。",
    "",
    ...lines.slice(-120),
  ].join("\n").slice(0, 16000);
}


async function getProjectForEdit(projectId: number, currentUserId: number) {
  const projectResult = await query<ProjectAccessRow>(
    `
      select
        p.id,
        p.storage_path,
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
        and p.status = 'active'
        and (
          p.owner_user_id = $2
          or pm.user_id is not null
        )
      limit 1
    `,
    [projectId, currentUserId]
  );

  return projectResult.rows[0] ?? null;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const projectId = Number(id);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return redirectToEdit(request, id, { compile_error: "bad_project" });
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
  const project = await getProjectForEdit(projectId, currentUserId);

  if (!project) {
    return redirectToEdit(request, id, { compile_error: "forbidden" });
  }

  const canCompile = project.my_role === "owner" || project.my_role === "editor";
  if (!canCompile) {
    return redirectToEdit(request, id, { compile_error: "readonly" });
  }

    const compileQuota = await getCompileQuotaForEmail(currentUser.email).catch((quotaError) => {
      console.error("getCompileQuotaForEmail failed:", quotaError);
      return null;
    });

    if (compileQuota?.ok && compileQuota.canCompile === false) {
      return redirectToEdit(request, id, { compile_error: "quota_exceeded" });
    }

    const projectDir = resolveProjectDir(project.storage_path);

    let rootFile = "main.tex";
    try {
      const formData = await request.formData().catch(() => null);
      rootFile = normalizeRootFile(
        formData?.get("rootFile") ?? formData?.get("relativePath") ?? "main.tex"
      );
    } catch {
      return redirectToEdit(request, id, { compile_error: "invalid_root_file" });
    }

    const rootTexPath = path.join(projectDir, rootFile);
    const rootPdfFile = rootFile.replace(/\.tex$/i, ".pdf");
    const rootLogFile = rootFile.replace(/\.tex$/i, ".log");

    let tex = "";
    try {
      tex = await readFile(rootTexPath, "utf8");
    } catch {
      return redirectToEdit(request, id, { compile_error: "missing_main", rootFile });
    }

    const { engine, script } = detectCompileScript(tex, rootFile);

  // Remove stale PDF before compile so a failed compile never leaves an old PDF visible.
  await rm(path.join(projectDir, rootPdfFile), { force: true }).catch(() => {});

  const uid = typeof process.getuid === "function" ? process.getuid() : 1000;
  const gid = typeof process.getgid === "function" ? process.getgid() : 1000;

  const args = [
    "run",
    "--rm",
    "--network",
    "none",
    "--user",
    `${uid}:${gid}`,
    "--entrypoint",
    "/bin/bash",
    "-v",
    `${projectDir}:/work`,
    "-w",
    "/work",
    "texcode-texlive:1",
    "-lc",
    script,
  ];

  const startedAt = new Date();

  try {
    const result = await execFileAsync("docker", args, {
      timeout: 120_000,
      maxBuffer: 3 * 1024 * 1024,
    });

    const log = [
      `FreeSloTeX compile`,
      `started_at: ${startedAt.toISOString()}`,
      `finished_at: ${new Date().toISOString()}`,
      `engine: ${engine}`,
      `command: ${script}`,
      ``,
      `===== stdout =====`,
      result.stdout ?? "",
      ``,
      `===== stderr =====`,
      result.stderr ?? "",
      ``,
    ].join("\n");

    await writeFile(path.join(projectDir, "freeslotex-compile.log"), log, "utf8");
    await rm(path.join(projectDir, "freeslotex-error-summary.txt"), { force: true }).catch(() => {});

    await query(
      `
        update projects
        set updated_at = now()
        where id = $1
      `,
      [projectId]
    );

      await recordCompileUsageForEmail(currentUser.email).catch((quotaError) => {
        console.error("recordCompileUsageForEmail failed:", quotaError);
      });

    return redirectToEdit(request, id, { compiled: "1", engine });
  } catch (error: any) {
    const log = [
      `FreeSloTeX compile failed`,
      `started_at: ${startedAt.toISOString()}`,
      `finished_at: ${new Date().toISOString()}`,
      `engine: ${engine}`,
      `command: ${script}`,
      `message: ${String(error?.message ?? error)}`,
      ``,
      `===== stdout =====`,
      String(error?.stdout ?? ""),
      ``,
      `===== stderr =====`,
      String(error?.stderr ?? ""),
      ``,
    ].join("\n");

    await writeFile(path.join(projectDir, "freeslotex-compile.log"), log, "utf8").catch(() => {});

    const texLogAfterFailure = await readFile(path.join(projectDir, rootLogFile), "utf8").catch(() => "");
    const errorSummary = extractLatexErrorSummary(
      [
        String(error?.stdout ?? ""),
        String(error?.stderr ?? ""),
        texLogAfterFailure,
      ].join("\n")
    );

    await writeFile(
      path.join(projectDir, "freeslotex-error-summary.txt"),
      errorSummary,
      "utf8"
    ).catch(() => {});

    // Ensure stale PDF is not downloadable after failed compile.
    await rm(path.join(projectDir, rootPdfFile), { force: true }).catch(() => {});

    if (String(error?.message ?? "").includes("timed out")) {
      return redirectToEdit(request, id, { compile_error: "timeout" });
    }

    return redirectToEdit(request, id, { compile_error: "failed" });
  }
}
