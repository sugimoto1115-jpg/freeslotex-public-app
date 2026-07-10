import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { readFile, writeFile, rm, stat } from "node:fs/promises";
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

function tail(text: string, lines = 140) {
  const xs = text.split(/\r\n|\r|\n/);
  return xs.slice(Math.max(0, xs.length - lines)).join("\n");
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

type CompileMode = "fast" | "clean" | "rebuild";

function normalizeCompileMode(value: unknown): CompileMode {
  if (value === "fast" || value === "clean" || value === "rebuild") return value;
  return "clean";
}

function getCompilePrefix(mode: CompileMode) {
  if (mode === "fast") return "";

  if (mode === "rebuild") {
    return "latexmk -C || true; rm -f *.aux *.bbl *.bcf *.blg *.fls *.fdb_latexmk *.idx *.ilg *.ind *.log *.out *.run.xml *.synctex.gz *.toc || true; ";
  }

  return "latexmk -C || true; ";
}


function getExtractBbPrefix(mode: CompileMode) {
  const condition = mode === "rebuild" ? "true" : '[ ! -f "$bb" ]';

  return `find . -type f \\( -iname '*.pdf' -o -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' \\) -exec sh -c 'for img do bb="\${img%.*}.bb"; if ${condition}; then extractbb -O "$img" > "$bb" || exit 1; fi; done' sh {} +; `;
}

function getDvipdfmxCompilePrefix(mode: CompileMode) {
  const extractBbPrefix = getExtractBbPrefix(mode);

  if (mode === "fast") {
    return extractBbPrefix;
  }

  return `${getCompilePrefix(mode)}${extractBbPrefix}`;
}

function detectCompileScript(tex: string, rootFile = "main.tex", compileMode: CompileMode = "clean") {
  const qRootFile = shellQuote(rootFile);
  const compilePrefix = getCompilePrefix(compileMode);
  const dvipdfmxCompilePrefix = getDvipdfmxCompilePrefix(compileMode);
  const cls = tex.match(/\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/)?.[1] ?? "";

  const hasJapaneseOrFullwidth =
    /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(tex);

  if (/^ltjs(article|book|report)$/.test(cls) || tex.includes("\\usepackage{luatexja}")) {
    return {
      engine: "lualatex",
      script: `${compilePrefix}latexmk -lualatex -interaction=nonstopmode -halt-on-error ${qRootFile}`,
    };
  }

  if (/^(u)?p?js(article|book|report)$/.test(cls)) {
    return {
      engine: "uplatex+dvipdfmx",
      script:
        `${dvipdfmxCompilePrefix}latexmk -pdfdvi -latex='uplatex -interaction=nonstopmode -halt-on-error %O %S' -e '$dvipdf="dvipdfmx %O -o %D %S";' ${qRootFile}`,
    };
  }

  if (/^(jarticle|jreport|jbook|tarticle|treport|tbook|gjisbook)$/.test(cls)) {
    return {
      engine: "platex+dvipdfmx",
      script:
        `${dvipdfmxCompilePrefix}latexmk -pdfdvi -latex='platex -kanji=utf8 -interaction=nonstopmode -halt-on-error %O %S' -e '$dvipdf="dvipdfmx %O -o %D %S";' ${qRootFile}`,
    };
  }

  if (hasJapaneseOrFullwidth) {
    return {
      engine: "lualatex-auto-unicode",
      script: `${compilePrefix}latexmk -lualatex -interaction=nonstopmode -halt-on-error ${qRootFile}`,
    };
  }

  return {
    engine: "pdflatex",
    script: `${compilePrefix}latexmk -pdf -interaction=nonstopmode -halt-on-error ${qRootFile}`,
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

    function makeUndefinedCommandHint(command: string): string[] {
      const trimmed = command.trim();

      if (!trimmed) {
        return [
          "FreeSloTeX Hint:",
          "未定義コマンド名をログから特定できませんでした。",
          "該当行付近のコマンド名と必要パッケージを確認してください。",
          "",
        ];
      }

      const name = trimmed.replace(/^\\+/, "");
      const lower = name.toLowerCase();

      if (lower === "includegraphics") {
        return [
          "FreeSloTeX Hint:",
          `\`${trimmed}\` は通常 graphicx パッケージで定義されます。`,
          "",
          "最小修正:",
          "\\usepackage{graphicx}",
          "",
        ];
      }

      if (lower === "mathbb" || lower === "mathfrak") {
        return [
          "FreeSloTeX Hint:",
          `\`${trimmed}\` は amssymb または amsfonts が必要なことがあります。`,
          "",
          "最小修正:",
          "\\usepackage{amssymb}",
          "",
        ];
      }

      if (lower === "bm") {
        return [
          "FreeSloTeX Hint:",
          `\`${trimmed}\` は bm パッケージで定義されます。`,
          "",
          "最小修正:",
          "\\usepackage{bm}",
          "",
        ];
      }

      if (["toprule", "midrule", "bottomrule", "cmidrule"].includes(lower)) {
        return [
          "FreeSloTeX Hint:",
          `\`${trimmed}\` は booktabs パッケージの表罫線コマンドです。`,
          "",
          "最小修正:",
          "\\usepackage{booktabs}",
          "",
        ];
      }

      if (["citep", "citet", "citealt", "citealp"].includes(lower)) {
        return [
          "FreeSloTeX Hint:",
          `\`${trimmed}\` は natbib パッケージで使われる引用コマンドです。`,
          "",
          "最小修正:",
          "\\usepackage[numbers]{natbib}",
          "",
        ];
      }

      if (lower === "autoref" || lower === "href" || lower === "url") {
        return [
          "FreeSloTeX Hint:",
          `\`${trimmed}\` は hyperref パッケージで定義されることがあります。`,
          "",
          "最小修正:",
          "\\usepackage{hyperref}",
          "",
        ];
      }

      if (["cref", "crefrange", "cpageref", "namecref", "labelcref"].includes(lower)) {
        return [
          "FreeSloTeX Hint:",
          `\`${trimmed}\` は cleveref パッケージで定義されることがあります。`,
          "",
          "最小修正:",
          "\\usepackage{cleveref}",
          "",
        ];
      }

      if (["kwdata", "kwresult", "kwin", "kwout", "kwto", "kwret", "fn"].includes(lower)) {
        return [
          "FreeSloTeX Hint:",
          `\`${trimmed}\` は algorithm2e 系のコマンドである可能性があります。`,
          "",
          "最小確認:",
          "・algorithm2e を使うなら `\\usepackage{algorithm2e}` を確認する",
          "・algpseudocode と algorithm2e の記法を混在させていないか確認する",
          "",
        ];
      }

      if (["state", "procedure", "endprocedure", "require", "ensure"].includes(lower)) {
        return [
          "FreeSloTeX Hint:",
          `\`${trimmed}\` は algpseudocode / algorithmicx 系のコマンドである可能性があります。`,
          "",
          "最小修正:",
          "\\usepackage{algpseudocode}",
          "",
        ];
      }

      if (lower === "si" || lower === "num" || lower === "qty") {
        return [
          "FreeSloTeX Hint:",
          `\`${trimmed}\` は siunitx パッケージで使われることがあります。`,
          "",
          "最小修正:",
          "\\usepackage{siunitx}",
          "",
        ];
      }

      if (lower === "textcolor" || lower === "colorbox" || lower === "definecolor") {
        return [
          "FreeSloTeX Hint:",
          `\`${trimmed}\` は xcolor パッケージで定義されることがあります。`,
          "",
          "最小修正:",
          "\\usepackage{xcolor}",
          "",
        ];
      }

      return [
        "FreeSloTeX Hint:",
        `未定義コマンド \`${trimmed}\` が使われています。`,
        "コマンド名の誤字、または必要パッケージの読み込み不足の可能性があります。",
        "",
      ];
    }

    function makeUndefinedEnvironmentHint(
      errorLine: string,
      lineInfo: { lineNumber: string; offending: string } | null
    ): string[] {
      const match = errorLine.match(/Environment\s+(.+?)\s+undefined/i);
      const environment = match?.[1]?.trim() ?? "";

      if (!environment) return [];

      const lower = environment.toLowerCase();
      const base = lower.replace(/\*$/, "");
      const lineLabel = lineInfo?.lineNumber ? `${lineInfo.lineNumber}行目付近` : "該当行付近";

      if (base === "algorithm") {
        return [
          "FreeSloTeX Hint:",
          `${lineLabel}で \`${environment}\` 環境が未定義です。`,
          "algorithm 環境を使うためのパッケージが読み込まれていない可能性があります。",
          "",
          "最小確認:",
          "・algorithm パッケージを使うなら `\\usepackage{algorithm}` を確認する",
          "・algorithm2e を使うなら `\\usepackage{algorithm2e}` を確認する",
          "・algpseudocode の本文と algorithm の浮動環境を混同していないか確認する",
          "",
        ];
      }

      if (base === "algorithmic") {
        return [
          "FreeSloTeX Hint:",
          `${lineLabel}で \`${environment}\` 環境が未定義です。`,
          "algorithmic / algpseudocode 系のパッケージが読み込まれていない可能性があります。",
          "",
          "最小修正:",
          "\\usepackage{algpseudocode}",
          "",
        ];
      }

      if (["theorem", "lemma", "definition", "remark", "proposition", "corollary", "assumption"].includes(base)) {
        return [
          "FreeSloTeX Hint:",
          `${lineLabel}で \`${environment}\` 環境が未定義です。`,
          "amsthm の読み込み、または theorem 環境の定義が不足している可能性があります。",
          "",
          "最小確認:",
          "・`\\usepackage{amsthm}` を確認する",
          `・preamble に \`\\newtheorem{${base}}{...}\` があるか確認する`,
          "",
        ];
      }

      if (base === "proof") {
        return [
          "FreeSloTeX Hint:",
          `${lineLabel}で \`${environment}\` 環境が未定義です。`,
          "proof 環境は通常 amsthm パッケージで定義されます。",
          "",
          "最小修正:",
          "\\usepackage{amsthm}",
          "",
        ];
      }

      if (["align", "alignat", "gather", "multline", "split", "cases"].includes(base)) {
        return [
          "FreeSloTeX Hint:",
          `${lineLabel}で \`${environment}\` 環境が未定義です。`,
          "この数式環境は amsmath パッケージが必要なことがあります。",
          "",
          "最小修正:",
          "\\usepackage{amsmath}",
          "",
        ];
      }

      if (base === "tikzpicture") {
        return [
          "FreeSloTeX Hint:",
          `${lineLabel}で \`${environment}\` 環境が未定義です。`,
          "TikZ 図を使うには tikz パッケージが必要です。",
          "",
          "最小修正:",
          "\\usepackage{tikz}",
          "",
        ];
      }

      if (base === "tabularx") {
        return [
          "FreeSloTeX Hint:",
          `${lineLabel}で \`${environment}\` 環境が未定義です。`,
          "tabularx 環境を使うには tabularx パッケージが必要です。",
          "",
          "最小修正:",
          "\\usepackage{tabularx}",
          "",
        ];
      }

      if (base === "longtable") {
        return [
          "FreeSloTeX Hint:",
          `${lineLabel}で \`${environment}\` 環境が未定義です。`,
          "longtable 環境を使うには longtable パッケージが必要です。",
          "",
          "最小修正:",
          "\\usepackage{longtable}",
          "",
        ];
      }

      if (base === "landscape") {
        return [
          "FreeSloTeX Hint:",
          `${lineLabel}で \`${environment}\` 環境が未定義です。`,
          "landscape 環境を使うには pdflscape または lscape パッケージが必要です。",
          "",
          "最小修正:",
          "\\usepackage{pdflscape}",
          "",
        ];
      }

      if (base === "comment") {
        return [
          "FreeSloTeX Hint:",
          `${lineLabel}で \`${environment}\` 環境が未定義です。`,
          "comment 環境を使うには comment パッケージが必要です。",
          "",
          "最小修正:",
          "\\usepackage{comment}",
          "",
        ];
      }

      if (base === "subfigure" || base === "subtable") {
        return [
          "FreeSloTeX Hint:",
          `${lineLabel}で \`${environment}\` 環境が未定義です。`,
          "subfigure / subtable 環境を使うには subcaption パッケージが必要なことがあります。",
          "",
          "最小修正:",
          "\\usepackage{subcaption}",
          "",
        ];
      }

      return [
        "FreeSloTeX Hint:",
        `${lineLabel}で \`${environment}\` 環境が未定義です。`,
        "環境名の誤字、必要パッケージの読み込み不足、または独自環境の定義不足の可能性があります。",
        "",
      ];
    }

    function makeEnvironmentMismatchHint(
      errorLine: string,
      lineInfo: { lineNumber: string; offending: string } | null
    ): string[] {
      const match = errorLine.match(/\\begin\{([^}]+)\}(?: on input line (\d+))? ended by \\end\{([^}]+)\}/i);
      const beginEnv = match?.[1]?.trim() ?? "";
      const beginLine = match?.[2]?.trim() ?? "";
      const endEnv = match?.[3]?.trim() ?? "";

      if (!beginEnv || !endEnv) return [];

      const lineLabel = lineInfo?.lineNumber ? `${lineInfo.lineNumber}行目付近` : "該当行付近";
      const beginLineText = beginLine ? `開始は${beginLine}行目付近です。` : "";

      return [
        "FreeSloTeX Hint:",
        `${lineLabel}で \`${beginEnv}\` 環境を開始していますが、\`${endEnv}\` 環境で閉じています。`,
        beginLineText,
        "\\begin{...} と \\end{...} の環境名を一致させてください。",
        "",
        "最小確認:",
        `\\begin{${beginEnv}} ... \\end{${beginEnv}}`,
        "",
      ].filter(Boolean);
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


    function makeBadMathDelimiterHint(
      errorLine: string,
      lineInfo: { lineNumber: string; offending: string } | null
    ): string[] {
      if (!errorLine.includes("Bad math environment delimiter")) return [];

      const raw = lineInfo?.offending?.trim() ?? "";
      const shortened = raw.length > 160 ? `${raw.slice(0, 157)}...` : raw;
      const shown = shortened ? `\`${shortened}\`` : "該当行";
      const lineLabel = lineInfo?.lineNumber ? `${lineInfo.lineNumber}行目付近` : "該当行付近";

      return [
        "FreeSloTeX Hint:",
        `${lineLabel}の ${shown} で、数式環境の区切りが不正になっています。`,
        "直前に `$` や `\\(` の閉じ忘れがある状態で `\\[` を始めた、または数式環境を入れ子にした可能性があります。",
        "",
        "最小確認:",
        "・直前の行で `$...$` の `$` が片方だけになっていないか確認する",
        "・`\\[` ... `\\]` の外側を `$...$`, `\\(...\\)`, equation, align などで囲んでいないか確認する",
        "・display math は `\\[` と `\\]` をペアで使う",
        "",
      ];
    }

    function makeLikelyMissingDollarHint(
      lineInfo: { lineNumber: string; offending: string } | null
    ): string[] {
      const raw = lineInfo?.offending?.trim() ?? "";
      const shown = raw.length > 160 ? `${raw.slice(0, 157)}...` : raw;
      const escapedUnderscore = shown.replace(/_/g, "\\_");
      const lineLabel = lineInfo?.lineNumber ? `${lineInfo.lineNumber}行目付近` : "該当行付近";

      if (shown && (shown.includes("_") || shown.includes("^"))) {
        return [
          "FreeSloTeX Hint:",
          `${lineLabel}の \`${shown}\` に \`_\` または \`^\` が含まれています。`,
          "本文中で使う場合は `\\_` のようにエスケープし、数式なら `$...$` で囲んでください。",
          "",
          "例:",
          shown.includes("_") ? `${shown} → ${escapedUnderscore}` : "`x_i` → `$x_i$`",
          "",
        ];
      }

      return [
        "FreeSloTeX Hint:",
        "数式モード外で `_` や `^` を使ったか、数式の開始・終了記号が不足している可能性があります。",
        "",
        "最小確認:",
        "・本文中の `_` は `\\_` にする",
        "・数式なら `$...$` または `\\(...\\)` で囲む",
        "",
      ];
    }

  function extractFileNotFoundName(errorLine: string) {
    const match = errorLine.match(/File\s+(.+?)\s+not found/i);
    return match?.[1]?.replace(/^[`\'"]+|[`\'".]+$/g, "").trim() ?? "";
  }

  function makeFileNotFoundHint(errorLine: string): string[] {
    const fileName = extractFileNotFoundName(errorLine);

    if (!fileName) {
      return [
        "FreeSloTeX Hint:",
        "読み込もうとしたファイル名をログから特定できませんでした。",
        "パッケージ、画像、.bib、.tex などの参照先がプロジェクト内にあるか確認してください。",
        "",
      ];
    }

    const lower = fileName.toLowerCase();

    if (/\.(png|jpe?g|pdf|eps|svg)$/i.test(lower)) {
      return [
        "FreeSloTeX Hint:",
        `画像ファイル \`${fileName}\` が見つかりません。`,
        "ファイル名の大文字・小文字、拡張子、フォルダ位置が本文中の画像指定と一致しているか確認してください。",
        "",
        "最小確認:",
        "・画像ファイルがプロジェクト内にあるか確認する",
        "・拡張子 .png / .jpg / .pdf などが本文の指定と一致しているか確認する",
        "・サブフォルダ内の画像なら `figures/name.png` のように相対パスで指定する",
        "",
      ];
    }

    if (lower.endsWith(".sty")) {
      return [
        "FreeSloTeX Hint:",
        `LaTeX パッケージファイル \`${fileName}\` が見つかりません。`,
        "パッケージ名の誤字、または TeX 環境に未導入のパッケージである可能性があります。",
        "",
        "最小確認:",
        "・`\\usepackage{...}` の名前を確認する",
        "・特殊な .sty ファイルならプロジェクト内にアップロードする",
        "",
      ];
    }

    if (lower.endsWith(".cls")) {
      return [
        "FreeSloTeX Hint:",
        `文書クラスファイル \`${fileName}\` が見つかりません。`,
        "`\\documentclass{...}` のクラス名、または独自 .cls ファイルの有無を確認してください。",
        "",
      ];
    }

    if (lower.endsWith(".bib")) {
      return [
        "FreeSloTeX Hint:",
        `BibTeX ファイル \`${fileName}\` が見つかりません。`,
        "`\\bibliography{...}` や bib ファイル名、置き場所を確認してください。",
        "",
      ];
    }

    if (lower.endsWith(".tex")) {
      return [
        "FreeSloTeX Hint:",
        `TeX ファイル \`${fileName}\` が見つかりません。`,
        "`\\input{...}` や `\\include{...}` のファイル名・相対パスを確認してください。",
        "",
      ];
    }

    return [
      "FreeSloTeX Hint:",
      `\`${fileName}\` が見つかりません。`,
      "ファイル名、拡張子、大文字・小文字、フォルダ位置を確認してください。",
      "",
    ];
  }

  function makeRunawayArgumentHint(
    index: number,
    lineInfo: { lineNumber: string; offending: string } | null
  ): string[] {
    const fragment = excerpt(index, 0, 12)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 6)
      .join(" ");
    const shown = fragment.length > 240 ? `${fragment.slice(0, 237)}...` : fragment;
    const lineLabel = lineInfo?.lineNumber ? `${lineInfo.lineNumber}行目付近` : "エラー発生箇所付近";

    const hint = [
      "FreeSloTeX Hint:",
      `${lineLabel}またはその直前で、LaTeX コマンドの引数が閉じられていない可能性があります。`,
      "特に `\\section{...}`, `\\caption{...}`, `\\title{...}`, `\\footnote{...}`, `\\textbf{...}` などの `{` と `}` の対応を確認してください。",
      "",
      "最小確認:",
      "・エラー行の直前にある `{` と `}` の数を確認する",
      "・長い `\\caption{...}` や `\\section{...}` を一度短くして切り分ける",
      "・閉じ忘れが疑われる行の末尾に `}` が必要か確認する",
      "",
    ];

    if (shown) {
      hint.push("ログ断片:", shown, "");
    }

    return hint;
  }

  function extractOptionClashPackageName(errorLine: string) {
    const match = errorLine.match(/Option clash for package\s+[`'"]?([^`'".\s]+)[`'"]?\.?/i);
    return match?.[1]?.trim() ?? "";
  }

  function makePackageOptionClashHint(errorLine: string): string[] {
    const packageName = extractOptionClashPackageName(errorLine);

    return [
      "FreeSloTeX Hint:",
      packageName
        ? `パッケージ \`${packageName}\` が、異なるオプションで複数回読み込まれている可能性があります。`
        : "同じパッケージが、異なるオプションで複数回読み込まれている可能性があります。",
      "\\usepackage{...} は同じパッケージについて1回だけにまとめてください。",
      "",
      "最小確認:",
      packageName
        ? `・\`\\usepackage{${packageName}}\` が複数箇所にないか確認する`
        : "・同じパッケージを複数箇所で読み込んでいないか確認する",
      "・必要な option を1つの \\usepackage にまとめる",
      packageName
        ? `・例: \`\\usepackage[...]{${packageName}}\` のように1回だけ書く`
        : "・例: `\\usepackage[...]{package}` のように1回だけ書く",
      "",
    ];
  }

  const undefinedIndex = lines.findIndex((line) =>
    line.includes("Undefined control sequence")
  );

  if (undefinedIndex >= 0) {
    const lineInfo = findLineNumberAfter(undefinedIndex);
    const command = lineInfo ? firstCommand(lineInfo.offending) : "";
    const hint = makeUndefinedCommandHint(command);

    return [
      "FreeSloTeX compile error summary",
      "",
      "原因: 未定義コマンド (Undefined control sequence)",
      `場所: ${rootFile} ${lineInfo?.lineNumber ? `${lineInfo.lineNumber}行目付近` : "行番号不明"}`,
      `問題: ${command || "TeXが知らない命令があります。"}`,
      "",
      ...hint,
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
    const hint = makeFileNotFoundHint(lines[fileNotFoundIndex] ?? "");
    return [
      "FreeSloTeX compile error summary",
      "",
      "原因: ファイルが見つかりません (File not found)",
      "",
      ...hint,
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

    const missingDollarIndex = lines.findIndex((line) => line.includes("Missing $ inserted"));

    if (missingDollarIndex >= 0) {
      const lineInfo = findLineNumberAfter(missingDollarIndex);
      const hint = makeLikelyMissingDollarHint(lineInfo);

      return [
        "FreeSloTeX compile error summary",
        "",
        "原因: 数式モードに関するエラー (Missing $ inserted)",
        `場所: ${rootFile} ${lineInfo?.lineNumber ? `${lineInfo.lineNumber}行目付近` : "行番号不明"}`,
        "",
        ...hint,
        "対処:",
        "・本文中の `_` や `^` は `\\_` や `\\^{}` のようにエスケープする",
        "・数式として書く場合は `$...$` や `\\(...\\)` で囲む",
        "・数式環境の開始・終了記号の抜けも確認する",
        "",
        "該当ログ:",
        "",
        ...excerpt(lineInfo?.index ?? missingDollarIndex),
      ].join("\n").slice(0, 16000);
    }

  const optionClashIndex = lines.findIndex((line) =>
    /Option clash for package/i.test(line)
  );

  if (optionClashIndex >= 0) {
    const hint = makePackageOptionClashHint(lines[optionClashIndex] ?? "");

    return [
      "FreeSloTeX compile error summary",
      "",
      "原因: パッケージオプションの衝突 (Option clash)",
      "",
      ...hint,
      "対処:",
      "・同じパッケージを複数回 \\usepackage していないか確認する",
      "・異なる option を指定している場合は、1つの \\usepackage にまとめる",
      "・クラスファイルやテンプレートが先に読み込んでいるパッケージも確認する",
      "",
      "該当ログ:",
      "",
      ...excerpt(optionClashIndex),
    ].join("\n").slice(0, 16000);
  }

  const latexErrorIndex = lines.findIndex((line) =>
    /^! LaTeX Error:/.test(line) || /LaTeX Error:/.test(line) || /Package .* Error:/.test(line)
  );

  if (latexErrorIndex >= 0) {
    const lineInfo = findLineNumberAfter(latexErrorIndex);
    const hint = [
      ...makeLikelyMissingBackslashHint(lines[latexErrorIndex] ?? "", lineInfo),
      ...makeBadMathDelimiterHint(lines[latexErrorIndex] ?? "", lineInfo),
      ...makeUndefinedEnvironmentHint(lines[latexErrorIndex] ?? "", lineInfo),
      ...makeEnvironmentMismatchHint(lines[latexErrorIndex] ?? "", lineInfo),
    ];

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

  function makeBraceMismatchHint(
    errorLine: string,
    lineInfo: { lineNumber: string; offending: string } | null
  ): string[] {
    const raw = lineInfo?.offending?.trim() ?? "";
    const shownRaw = raw.replace(/`/g, "'");
    const shown = shownRaw.length > 180 ? `${shownRaw.slice(0, 177)}...` : shownRaw;
    const lineLabel = lineInfo?.lineNumber ? `${lineInfo.lineNumber}行目付近` : "該当行付近";
    const isMissing = errorLine.includes("Missing } inserted");
    const isExtra = errorLine.includes("Extra }") || errorLine.includes("Too many }");

    const hint = [
      "FreeSloTeX Hint:",
      isMissing
        ? `${lineLabel}またはその直前で、閉じ波括弧 \`}\` が不足している可能性があります。`
        : isExtra
          ? `${lineLabel}またはその直前で、閉じ波括弧 \`}\` が多すぎる可能性があります。`
          : `${lineLabel}またはその直前で、波括弧 \`{\` と \`}\` の対応が崩れている可能性があります。`,
      "",
      "最小確認:",
      "・該当行とその直前の `{` と `}` の数を確認する",
      "・`\\textbf{...}`, `\\emph{...}`, `\\frac{...}{...}`, `\\section{...}` などの閉じ括弧を確認する",
      "・余分な `}` がある場合は削除し、不足している場合は対応する位置に `}` を追加する",
      "",
    ];

    if (shown) {
      hint.push("該当行:", shown, "");
    }

    return hint;
  }

  function makeMisplacedAlignmentTabHint(
    lineInfo: { lineNumber: string; offending: string } | null
  ): string[] {
    const raw = lineInfo?.offending?.trim() ?? "";
    const shownRaw = raw.replace(/`/g, "'");
    const shown = shownRaw.length > 180 ? `${shownRaw.slice(0, 177)}...` : shownRaw;
    const escaped = shown.replace(/&/g, "\\&");
    const lineLabel = lineInfo?.lineNumber ? `${lineInfo.lineNumber}行目付近` : "該当行付近";

    const hint = [
      "FreeSloTeX Hint:",
      `${lineLabel}で \`&\` が不適切な位置にあります。`,
      "`&` は tabular, array, align などの整列用記号です。本文中で文字として使う場合は `\\&` と書いてください。",
      "",
      "最小確認:",
      "・本文中の `&` は `\\&` にする",
      "・表なら `tabular` 環境の中で使う",
      "・数式の整列なら `align` など適切な数式環境の中で使う",
      "",
    ];

    if (shown) {
      hint.push("該当行:", shown, "");
      if (shown.includes("&")) {
        hint.push("本文中で文字として使う場合の例:", escaped, "");
      }
    }

    return hint;
  }

  const misplacedAlignmentTabIndex = lines.findIndex((line) =>
    line.includes("Misplaced alignment tab character &")
  );

  if (misplacedAlignmentTabIndex >= 0) {
    const lineInfo = findLineNumberAfter(misplacedAlignmentTabIndex);
    const hint = makeMisplacedAlignmentTabHint(lineInfo);

    return [
      "FreeSloTeX compile error summary",
      "",
      "原因: & の位置が不正です (Misplaced alignment tab character &)",
      `場所: ${rootFile} ${lineInfo?.lineNumber ? `${lineInfo.lineNumber}行目付近` : "行番号不明"}`,
      "",
      ...hint,
      "対処:",
      "・本文中で & を文字として使う場合は `\\&` にする",
      "・表の列区切りなら tabular 環境の中に入れる",
      "・数式の整列なら align などの環境を使う",
      "",
      "該当ログ:",
      "",
      ...excerpt(lineInfo?.index ?? misplacedAlignmentTabIndex),
    ].join("\n").slice(0, 16000);
  }

  const braceMismatchIndex = lines.findIndex((line) =>
    line.includes("Missing } inserted") ||
    line.includes("Extra }") ||
    line.includes("Too many }")
  );

  if (braceMismatchIndex >= 0) {
    const lineInfo = findLineNumberAfter(braceMismatchIndex);
    const hint = makeBraceMismatchHint(lines[braceMismatchIndex] ?? "", lineInfo);

    return [
      "FreeSloTeX compile error summary",
      "",
      "原因: 波括弧の対応エラー (Missing / Extra })",
      `場所: ${rootFile} ${lineInfo?.lineNumber ? `${lineInfo.lineNumber}行目付近` : "行番号不明"}`,
      "",
      ...hint,
      "対処:",
      "・該当行とその直前で `{` と `}` の対応を確認する",
      "・コマンド引数や数式の中で閉じ括弧が不足または過剰になっていないか確認する",
      "・原因箇所が分かりにくい場合は、直前の段落や数式を一時的にコメントアウトして切り分ける",
      "",
      "該当ログ:",
      "",
      ...excerpt(lineInfo?.index ?? braceMismatchIndex),
    ].join("\n").slice(0, 16000);
  }

  const runawayArgumentIndex = lines.findIndex((line) => line.includes("Runaway argument"));

  if (runawayArgumentIndex >= 0) {
    const lineInfo = findLineNumberAfter(runawayArgumentIndex);
    const hint = makeRunawayArgumentHint(runawayArgumentIndex, lineInfo);

    return [
      "FreeSloTeX compile error summary",
      "",
      "原因: 引数の閉じ忘れの可能性 (Runaway argument)",
      `場所: ${rootFile} ${lineInfo?.lineNumber ? `${lineInfo.lineNumber}行目付近` : "行番号不明"}`,
      "",
      ...hint,
      "対処:",
      "・直前の `\\section{...}`, `\\caption{...}`, `\\title{...}` などの閉じ括弧 `}` を確認する",
      "・長い引数を一度短くして、どこで閉じ忘れているか確認する",
      "・コメントアウトで原因範囲を狭める",
      "",
      "該当ログ:",
      "",
      ...excerpt(lineInfo?.index ?? runawayArgumentIndex),
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

async function readArtifacts(projectDir: string, pdfFile = "main.pdf", logFile = "main.log") {
  const fsxLog = await readFile(path.join(projectDir, "freeslotex-compile.log"), "utf8").catch(() => "");
  const texLog = await readFile(path.join(projectDir, logFile), "utf8").catch(() => "");
  const pdfExists = await stat(path.join(projectDir, pdfFile)).then(() => true).catch(() => false);

  return {
    fsxLogTail: tail(fsxLog),
    texLogTail: tail(texLog),
    pdfExists,
    pdfFile,
  };
}

async function readPostedContent(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null);
    if (body && typeof body.content === "string") return body.content;
    return null;
  }

  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    const formData = await request.formData().catch(() => null);
    if (!formData) return null;
    const value = formData.get("content");
    return typeof value === "string" ? value : null;
  }

  return null;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const projectId = Number(id);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return NextResponse.json(
      { ok: false, compileError: "bad_project", message: "Project ID is invalid." },
      { status: 400 }
    );
  }

  const currentUser = await getCurrentUser();
  if (!currentUser?.email) {
    return NextResponse.json(
      { ok: false, compileError: "login_required", message: "Login is required." },
      { status: 401 }
    );
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
    return NextResponse.json(
      { ok: false, compileError: "login_required", message: "Login is required." },
      { status: 401 }
    );
  }

  const currentUserId = Number(userResult.rows[0].id);
  const project = await getProjectForEdit(projectId, currentUserId);

  if (!project) {
    return NextResponse.json(
      { ok: false, compileError: "forbidden", message: "You do not have access to this project." },
      { status: 403 }
    );
  }

  const canCompile = project.my_role === "owner" || project.my_role === "editor";
  if (!canCompile) {
    return NextResponse.json(
      { ok: false, compileError: "readonly", message: "Viewer role cannot compile this project." },
      { status: 403 }
    );
  }

    const compileQuota = await getCompileQuotaForEmail(currentUser.email).catch((quotaError) => {
      console.error("getCompileQuotaForEmail failed:", quotaError);
      return null;
    });

    if (compileQuota?.ok && compileQuota.canCompile === false) {
      return NextResponse.json(
        {
          ok: false,
          compileError: "quota_exceeded",
          message: "Free plan daily compile limit reached. Please try again tomorrow.",
          usedToday: compileQuota.usedToday,
          freeDailyLimit: compileQuota.freeDailyLimit,
          remainingToday: compileQuota.remainingToday,
        },
        { status: 429 }
      );
    }

  const projectDir = resolveProjectDir(project.storage_path);

  let rootFile = "main.tex";
  let compileMode: CompileMode = "clean";
  try {
    const url = new URL(request.url);
    rootFile = normalizeRootFile(url.searchParams.get("rootFile") ?? "main.tex");
    compileMode = normalizeCompileMode(url.searchParams.get("compileMode") ?? url.searchParams.get("mode"));
  } catch {
    return NextResponse.json(
      { ok: false, compileError: "invalid_root_file", message: "Invalid root TeX file." },
      { status: 400 }
    );
  }

  const rootTexPath = path.join(projectDir, rootFile);
  const rootPdfFile = rootFile.replace(/\.tex$/i, ".pdf");
  const rootLogFile = rootFile.replace(/\.tex$/i, ".log");

  let tex = await readPostedContent(request);

  if (tex !== null) {
    if (tex.length > 2_000_000) {
      return NextResponse.json(
        { ok: false, compileError: "too_large", message: "The file is too large to compile." },
        { status: 413 }
      );
    }

    await writeFile(rootTexPath, tex, "utf8");
  } else {
    try {
      tex = await readFile(rootTexPath, "utf8");
    } catch {
      return NextResponse.json(
        { ok: false, compileError: "missing_main", message: `${rootFile} was not found.` },
        { status: 404 }
      );
    }
  }

  await query(
    `
      update projects
      set updated_at = now()
      where id = $1
    `,
    [projectId]
  );

  const { engine, script } = detectCompileScript(tex, rootFile, compileMode);

  await rm(path.join(projectDir, rootPdfFile), { force: true }).catch(() => {});
  await rm(path.join(projectDir, "freeslotex-error-summary.txt"), { force: true }).catch(() => {});

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

      await recordCompileUsageForEmail(currentUser.email).catch((quotaError) => {
        console.error("recordCompileUsageForEmail failed:", quotaError);
      });

    const artifacts = await readArtifacts(projectDir, rootPdfFile, rootLogFile);

    return NextResponse.json({
      ok: true,
      engine,
      compileError: null,
      compileErrorSummary: "",
      message: `Compiled successfully with ${engine}.`,
      ...artifacts,
    });
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

    await rm(path.join(projectDir, rootPdfFile), { force: true }).catch(() => {});

    const artifacts = await readArtifacts(projectDir, rootPdfFile, rootLogFile);
    const compileError = String(error?.message ?? "").includes("timed out") ? "timeout" : "failed";

    return NextResponse.json({
      ok: false,
      engine,
      compileError,
      compileErrorSummary: errorSummary,
      message:
        compileError === "timeout"
          ? "Compile timed out. Check the terminal below."
          : "Compile failed. Check the terminal below.",
      ...artifacts,
      pdfExists: false,
    });
  }
}
