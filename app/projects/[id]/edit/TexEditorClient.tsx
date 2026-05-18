"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PdfPreviewClient from "./PdfPreviewClient";

type OutlineItem = {
  level: string;
  title: string;
  line: number;
};

type WorkspaceEntry = {
  relativePath: string;
  name: string;
  kind: "dir" | "file";
  size: number | null;
  updatedAt: string | null;
  depth: number;
};

type Props = {
  projectId: number;
  projectName: string;
  roleLabel: string;
  canEdit: boolean;
  mainTex: string;
  fileMessage: string | null;
  outline: OutlineItem[];
  files: WorkspaceEntry[];
  pdfExists: boolean;
  saved: boolean;
  compiled: boolean;
  engine?: string;
  saveError?: string | null;
  compileError?: string | null;
  compileErrorSummary: string;
  fsxLogTail: string;
  texLogTail: string;
};

type LiveCompileResponse = {
  ok: boolean;
  engine?: string;
  compileError?: string | null;
  compileErrorSummary?: string;
  fsxLogTail?: string;
  texLogTail?: string;
  pdfExists?: boolean;
  message?: string;
};

function formatBytes(value: number | null) {
  if (value === null) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(entry: WorkspaceEntry) {
  if (entry.kind === "dir") return "▸";
  if (entry.name.endsWith(".tex")) return "TEX";
  if (entry.name.endsWith(".pdf")) return "PDF";
  if (entry.name.endsWith(".log")) return "LOG";
  return "FILE";
}

function outlineIcon(level: string) {
  if (level === "part") return "◆";
  if (level === "chapter") return "▣";
  if (level === "section") return "§";
  if (level === "subsection") return "¶";
  if (level === "subsubsection") return "•";
  return "–";
}

function outlineIndent(level: string) {
  if (level === "part") return 0;
  if (level === "chapter") return 0;
  if (level === "section") return 4;
  if (level === "subsection") return 20;
  if (level === "subsubsection") return 36;
  return 4;
}

function isTextOpenablePath(relativePath: string) {
  const name = relativePath.split("/").pop() ?? relativePath;
  const lower = relativePath.toLowerCase();

  if (name === ".gitignore") return true;
  if (lower.endsWith(".fdb_latexmk")) return true;
  if (lower.endsWith(".code-workspace")) return true;

  return /\.(tex|bib|sty|cls|md|txt|log|aux|out|fls|json|csv|tsv|ya?ml)$/i.test(relativePath);
}

function isEditableTextPath(relativePath: string) {
  const name = relativePath.split("/").pop() ?? relativePath;
  const lower = relativePath.toLowerCase();

  if (name === ".gitignore") return true;
  if (lower.endsWith(".code-workspace")) return true;

  return /\.(tex|bib|sty|cls|md|txt|json|csv|tsv|ya?ml)$/i.test(relativePath);
}

function parseLiveOutline(tex: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const re = /\\(part|chapter|section|subsection|subsubsection)\*?\{([^}]*)\}/g;

  for (const match of tex.matchAll(re)) {
    const index = match.index ?? 0;
    const before = tex.slice(0, index);
    const line = before.length === 0 ? 1 : before.split(/\r\n|\r|\n/).length;

    items.push({
      level: match[1],
      title: match[2],
      line,
    });
  }

  return items;
}

function saveErrorMessage(code: string | null | undefined) {
  if (!code) return null;
  if (code === "bad_project") return "Project ID is invalid.";
  if (code === "forbidden") return "You do not have access to this project.";
  if (code === "readonly") return "Viewer role cannot save this file.";
  if (code === "too_large") return "The file is too large to save.";
  return "Save failed.";
}

function compileErrorMessage(code: string | null | undefined) {
  if (!code) return null;
  if (code === "bad_project") return "Project ID is invalid.";
  if (code === "forbidden") return "You do not have access to this project.";
  if (code === "readonly") return "Viewer role cannot compile this project.";
  if (code === "missing_main") return "main.tex was not found.";
  if (code === "timeout") return "Compile timed out.";
  if (code === "failed") return "Compile failed. Please check the terminal below.";
  return "Compile failed.";
}

function detectTexAdvice(tex: string) {
  const cls = tex.match(/\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/)?.[1] ?? "";
  const hasJapaneseOrFullwidth =
    /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(tex);
  const lualatexReady =
    /^ltjs(article|book|report)$/.test(cls) || tex.includes("\\usepackage{luatexja}");
  const ptexReady =
    /^(u)?p?js(article|book|report)$/.test(cls) || /^(jarticle|jbook|jreport)$/.test(cls);

  if (hasJapaneseOrFullwidth && !lualatexReady && !ptexReady) {
    return "Japanese or full-width characters were detected. For reliable compilation, use \\\\documentclass[a4paper,11pt]{ltjsarticle}.";
  }

  return null;
}

type SnippetItem = {
  label: string;
  snippet?: string;
  action?: "ltjsarticle";
};

type SnippetGroup = {
  label: string;
  items: SnippetItem[];
};

const snippetGroups: SnippetGroup[] = [
  {
    label: "TeX Insert",
    items: [
      { label: "ltjsarticle", action: "ltjsarticle" },
      { label: "section", snippet: "\\section{%%CURSOR%%}\n" },
      { label: "subsection", snippet: "\\subsection{%%CURSOR%%}\n" },
      { label: "subsubsection", snippet: "\\subsubsection{%%CURSOR%%}\n" },
      { label: "paragraph", snippet: "\\paragraph{%%CURSOR%%}\n" },
      { label: "footnote", snippet: "\\footnote{%%CURSOR%%}" },
    ],
  },
  {
    label: "Text Style",
    items: [
      { label: "textbf", snippet: "\\textbf{%%CURSOR%%}" },
      { label: "emph", snippet: "\\emph{%%CURSOR%%}" },
      { label: "textit", snippet: "\\textit{%%CURSOR%%}" },
      { label: "underline", snippet: "\\underline{%%CURSOR%%}" },
      { label: "center", snippet: "\\begin{center}\n%%CURSOR%%\n\\end{center}\n" },
      { label: "quote", snippet: "\\begin{quote}\n%%CURSOR%%\n\\end{quote}\n" },
    ],
  },
  {
    label: "Math",
    items: [
      { label: "Inline math", snippet: "$%%CURSOR%%$" },
      { label: "Display math", snippet: "\\[\n%%CURSOR%%\n\\]\n" },
      { label: "equation", snippet: "\\begin{equation}\n%%CURSOR%%\n\\end{equation}\n" },
      { label: "align", snippet: "\\begin{align}\n%%CURSOR%%\n\\end{align}\n" },
      { label: "cases", snippet: "\\begin{cases}\n%%CURSOR%%\n\\end{cases}\n" },
      { label: "matrix", snippet: "\\begin{pmatrix}\n%%CURSOR%%\n\\end{pmatrix}\n" },
    ],
  },
  {
    label: "Environments",
    items: [
      { label: "itemize", snippet: "\\begin{itemize}\n  \\item %%CURSOR%%\n\\end{itemize}\n" },
      { label: "enumerate", snippet: "\\begin{enumerate}\n  \\item %%CURSOR%%\n\\end{enumerate}\n" },
      { label: "description", snippet: "\\begin{description}\n  \\item[%%CURSOR%%] \n\\end{description}\n" },
      { label: "theorem", snippet: "\\begin{theorem}\n%%CURSOR%%\n\\end{theorem}\n" },
      { label: "proof", snippet: "\\begin{proof}\n%%CURSOR%%\n\\end{proof}\n" },
      { label: "definition", snippet: "\\begin{definition}\n%%CURSOR%%\n\\end{definition}\n" },
    ],
  },
  {
    label: "Table & Figure",
    items: [
      {
        label: "table",
        snippet: "\\begin{table}[htbp]\n  \\centering\n  \\caption{%%CURSOR%%}\n  \\label{tab:example}\n  \\begin{tabular}{ccc}\n    \\hline\n    A & B & C \\\\\n    \\hline\n    1 & 2 & 3 \\\\\n    \\hline\n  \\end{tabular}\n\\end{table}\n",
      },
      {
        label: "booktabs table",
        snippet: "\\begin{table}[htbp]\n  \\centering\n  \\caption{%%CURSOR%%}\n  \\label{tab:example}\n  \\begin{tabular}{ccc}\n    \\toprule\n    A & B & C \\\\\n    \\midrule\n    1 & 2 & 3 \\\\\n    \\bottomrule\n  \\end{tabular}\n\\end{table}\n",
      },
      {
        label: "figure",
        snippet: "\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{%%CURSOR%%}\n  \\caption{Figure title}\n  \\label{fig:example}\n\\end{figure}\n",
      },
      { label: "includegraphics", snippet: "\\includegraphics[width=0.8\\linewidth]{%%CURSOR%%}" },
    ],
  },
  {
    label: "References",
    items: [
      { label: "label", snippet: "\\label{%%CURSOR%%}" },
      { label: "ref", snippet: "\\ref{%%CURSOR%%}" },
      { label: "eqref", snippet: "\\eqref{%%CURSOR%%}" },
      { label: "cite", snippet: "\\cite{%%CURSOR%%}" },
      { label: "bibliography", snippet: "\\begin{thebibliography}{99}\n\\bibitem{%%CURSOR%%}\n\\end{thebibliography}\n" },
    ],
  },
];

export default function TexEditorClient(props: Props) {
  const [tex, setTex] = useState(props.mainTex);
  const [currentFilePath, setCurrentFilePath] = useState("main.tex");
  const [fileActionMessage, setFileActionMessage] = useState("");
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [activeSnippetGroup, setActiveSnippetGroup] = useState("TeX Insert");
  const [editorFontSize, setEditorFontSize] = useState(14);
  const [softWrap, setSoftWrap] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lineGutterRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(430);
  const [editorHeight, setEditorHeight] = useState(620);
  const [terminalHeight, setTerminalHeight] = useState(320);
  const [copySummaryStatus, setCopySummaryStatus] = useState("");
  const [isCompiling, setIsCompiling] = useState(false);
  const [liveCompileError, setLiveCompileError] = useState<string | null>(props.compileError ?? null);
  const [liveCompileErrorSummary, setLiveCompileErrorSummary] = useState(props.compileErrorSummary);
  const [liveFsxLogTail, setLiveFsxLogTail] = useState(props.fsxLogTail);
  const [liveTexLogTail, setLiveTexLogTail] = useState(props.texLogTail);
  const [livePdfExists, setLivePdfExists] = useState(props.pdfExists);
  const [liveCompiled, setLiveCompiled] = useState(props.compiled);
  const [liveEngine, setLiveEngine] = useState(props.engine ?? "");
  const [compileStatusMessage, setCompileStatusMessage] = useState("");
  const [pdfRefreshKey, setPdfRefreshKey] = useState(0);
  const [editorPreferencesLoaded, setEditorPreferencesLoaded] = useState(false);

  const MIN_LEFT_WIDTH = 180;
  const MIN_EDITOR_WIDTH = 360;
  const MIN_RIGHT_WIDTH = 260;
  const SPLITTER_TOTAL_WIDTH = 24;

  function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function getGridWidth() {
    return gridRef.current?.getBoundingClientRect().width ?? window.innerWidth;
  }

  function getMaxLeftWidth(currentRightWidth = rightWidth) {
    return getGridWidth() - currentRightWidth - MIN_EDITOR_WIDTH - SPLITTER_TOTAL_WIDTH;
  }

  function getMaxRightWidth(currentLeftWidth = leftWidth) {
    return getGridWidth() - currentLeftWidth - MIN_EDITOR_WIDTH - SPLITTER_TOTAL_WIDTH;
  }

  useEffect(() => {
    const onResize = () => {
      const gridWidth = getGridWidth();

      setLeftWidth((value) =>
        clamp(value, MIN_LEFT_WIDTH, gridWidth - rightWidth - MIN_EDITOR_WIDTH - SPLITTER_TOTAL_WIDTH)
      );

      setRightWidth((value) =>
        clamp(value, MIN_RIGHT_WIDTH, gridWidth - leftWidth - MIN_EDITOR_WIDTH - SPLITTER_TOTAL_WIDTH)
      );
    };

    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [leftWidth, rightWidth]);

  function startResizePane(
    which: "left" | "right",
    event: import("react").MouseEvent<HTMLDivElement>
  ) {
    event.preventDefault();

    const startX = event.clientX;
    const startLeft = leftWidth;
    const startRight = rightWidth;

    const onMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;

      if (which === "left") {
        const maxLeft = getMaxLeftWidth(startRight);
        setLeftWidth(clamp(startLeft + dx, MIN_LEFT_WIDTH, maxLeft));
      } else {
        const maxRight = getMaxRightWidth(startLeft);
        setRightWidth(clamp(startRight - dx, MIN_RIGHT_WIDTH, maxRight));
      }
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const saveError = saveErrorMessage(props.saveError);
  const compileError = compileErrorMessage(liveCompileError);
  const texAdvice = useMemo(() => detectTexAdvice(tex), [tex]);
  const currentSnippetGroup = useMemo(
    () => snippetGroups.find((group) => group.label === activeSnippetGroup) ?? snippetGroups[0],
    [activeSnippetGroup]
  );
  const editorBodyWidth = "100%";
  const lineNumberFontSize = Math.max(10, editorFontSize - 3);

  useEffect(() => {
    try {
      const rawFontSize = window.localStorage.getItem("freeslotex.editorFontSize");
      const parsedFontSize = Number(rawFontSize);

      if ([12, 14, 16, 18, 20].includes(parsedFontSize)) {
        setEditorFontSize(parsedFontSize);
      }

      const rawSoftWrap = window.localStorage.getItem("freeslotex.softWrap");
      if (rawSoftWrap === "1") setSoftWrap(true);
      if (rawSoftWrap === "0") setSoftWrap(false);
    } catch {
      // Ignore storage errors. The editor still works with default settings.
    } finally {
      setEditorPreferencesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!editorPreferencesLoaded) return;

    try {
      window.localStorage.setItem("freeslotex.editorFontSize", String(editorFontSize));
    } catch {
      // Ignore storage errors.
    }
  }, [editorPreferencesLoaded, editorFontSize]);

  useEffect(() => {
    if (!editorPreferencesLoaded) return;

    try {
      window.localStorage.setItem("freeslotex.softWrap", softWrap ? "1" : "0");
    } catch {
      // Ignore storage errors.
    }
  }, [editorPreferencesLoaded, softWrap]);

  const lineNumberText = useMemo(() => {
    const lineCount = Math.max(1, tex.split(/\r\n|\r|\n/).length);
    return Array.from({ length: lineCount }, (_, index) => String(index + 1)).join("\n");
  }, [tex]);

  const liveOutline = useMemo(() => parseLiveOutline(tex), [tex]);
  const currentFileDisplayName = currentFilePath || "main.tex";
  const currentFileCanBeSaved = props.canEdit && isEditableTextPath(currentFilePath);

  function syncLineNumberScroll(event: import("react").UIEvent<HTMLTextAreaElement>) {
    if (lineGutterRef.current) {
      lineGutterRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  }

  async function copyCompileErrorSummary() {
    const text = liveCompileErrorSummary;
    if (!text) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("Clipboard API is unavailable");
      }

      setCopySummaryStatus("Copied");
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        textarea.remove();

        setCopySummaryStatus("Copied");
      } catch {
        setCopySummaryStatus("Copy failed");
      }
    }

    window.setTimeout(() => setCopySummaryStatus(""), 1800);
  }

  async function runSaveCurrentFile(options: { silent?: boolean } = {}) {
    if (!props.canEdit) return false;

    if (!isEditableTextPath(currentFilePath)) {
      if (!options.silent) {
        setFileActionMessage(`${currentFilePath} is read-only in this editor.`);
      }
      return true;
    }

    setIsSavingFile(true);
    if (!options.silent) {
      setFileActionMessage(`Saving ${currentFilePath}...`);
    }

    try {
      const response = await fetch(`/api/projects/${props.projectId}/files/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          relativePath: currentFilePath,
          content: tex,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error ?? `Save failed with HTTP ${response.status}`);
      }

      if (!options.silent) {
        setFileActionMessage(data.message ?? `Saved ${currentFilePath}.`);
      }

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFileActionMessage(`Save failed: ${message}`);
      return false;
    } finally {
      setIsSavingFile(false);
    }
  }

  async function openExplorerFile(entry: WorkspaceEntry) {
    if (entry.kind !== "file") return;

    if (!isTextOpenablePath(entry.relativePath)) {
      setFileActionMessage(`${entry.name} is not opened as text. Use PDF Preview or Download when appropriate.`);
      return;
    }

    setIsFileLoading(true);
    setFileActionMessage(`Opening ${entry.relativePath}...`);

    try {
      const response = await fetch(
        `/api/projects/${props.projectId}/files/read?path=${encodeURIComponent(entry.relativePath)}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          cache: "no-store",
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok || typeof data.content !== "string") {
        throw new Error(data?.message ?? data?.error ?? `Open failed with HTTP ${response.status}`);
      }

      setTex(data.content);
      setCurrentFilePath(data.relativePath ?? entry.relativePath);
      setFileActionMessage(`Opened ${data.relativePath ?? entry.relativePath}.`);

      window.requestAnimationFrame(() => {
        textareaRef.current?.focus({ preventScroll: true });
        if (textareaRef.current) {
          textareaRef.current.scrollTop = 0;
          textareaRef.current.setSelectionRange(0, 0);
        }
        if (lineGutterRef.current) {
          lineGutterRef.current.scrollTop = 0;
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFileActionMessage(`Open failed: ${message}`);
    } finally {
      setIsFileLoading(false);
    }
  }

  async function runSmartCompile() {
    if (!props.canEdit || isCompiling) return;

    const saved = await runSaveCurrentFile({ silent: true });
    if (!saved) return;

    setIsCompiling(true);
    setCompileStatusMessage("Compiling...");
    setLiveCompileError(null);
    setLiveCompileErrorSummary("");
    setCopySummaryStatus("");

    try {
      const response = await fetch(`/api/projects/${props.projectId}/compile/live`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({}),
      });

      const data = (await response.json().catch(() => null)) as LiveCompileResponse | null;

      if (!data) {
        throw new Error(`Compile API returned ${response.status}`);
      }

      setLiveCompiled(Boolean(data.ok));
      setLiveEngine(data.engine ?? "");
      setLiveCompileError(data.ok ? null : data.compileError ?? "failed");
      setLiveCompileErrorSummary(data.compileErrorSummary ?? "");
      setLiveFsxLogTail(data.fsxLogTail ?? "");
      setLiveTexLogTail(data.texLogTail ?? "");
      setLivePdfExists(Boolean(data.pdfExists));
      setPdfRefreshKey((value) => value + 1);
      setCompileStatusMessage(
        data.message ??
          (data.ok ? "Compiled successfully." : "Compile failed. Check the terminal below.")
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      setLiveCompiled(false);
      setLiveEngine("");
      setLiveCompileError("failed");
      setLiveCompileErrorSummary(
        [
          "FreeSloTeX compile error summary",
          "",
          "Compile request failed before TeX started.",
          "",
          message,
        ].join("\n")
      );
      setLiveFsxLogTail("");
      setLiveTexLogTail("");
      setLivePdfExists(false);
      setCompileStatusMessage("Compile request failed.");
    } finally {
      setIsCompiling(false);
    }
  }

  function startResizeVertical(event: import("react").MouseEvent<HTMLDivElement>) {
    event.preventDefault();

    const startY = event.clientY;
    const startEditorHeight = editorHeight;
    const startTerminalHeight = terminalHeight;

    const onMove = (moveEvent: MouseEvent) => {
      const dy = moveEvent.clientY - startY;

      setEditorHeight(clamp(startEditorHeight + dy, 260, Math.max(360, window.innerHeight - 220)));
      setTerminalHeight(clamp(startTerminalHeight - dy, 160, Math.max(220, window.innerHeight - 260)));
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function insertSnippet(snippet: string) {
    if (!props.canEdit) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = tex.slice(0, start);
    const selected = tex.slice(start, end);
    const after = tex.slice(end);

    const marker = "%%CURSOR%%";
    let body = snippet;
    let cursorOffset = snippet.indexOf(marker);

    if (cursorOffset >= 0) {
      body = snippet.replace(marker, selected);
    } else {
      cursorOffset = body.length;
    }

    const next = before + body + after;
    const cursor = start + cursorOffset + selected.length;

    setTex(next);

    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  function replaceDocumentClassWithLtjsarticle() {
    if (!props.canEdit) return;

    const line = "\\documentclass[a4paper,11pt]{ltjsarticle}";
    const re = /\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/;

    if (re.test(tex)) {
      setTex(tex.replace(re, line));
    } else {
      setTex(line + "\n" + tex);
    }
  }

  function applySnippetItem(item: SnippetItem) {
    if (item.action === "ltjsarticle") {
      replaceDocumentClassWithLtjsarticle();
      return;
    }

    if (item.snippet) {
      insertSnippet(item.snippet);
    }
  }

  function goToLine(line: number) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const lines = tex.split(/\r\n|\r|\n/);
    const safeLine = Math.min(Math.max(1, line), lines.length);
    const pos =
      lines.slice(0, Math.max(0, safeLine - 1)).join("\n").length +
      (safeLine > 1 ? 1 : 0);

    const lineHeightPx = editorFontSize * 1.55;
    const targetScrollTop = Math.max(
      0,
      (safeLine - 1) * lineHeightPx - editorHeight * 0.35
    );

    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(pos, pos);
    textarea.scrollTop = targetScrollTop;

    if (lineGutterRef.current) {
      lineGutterRef.current.scrollTop = targetScrollTop;
    }

    window.requestAnimationFrame(() => {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(pos, pos);
      textarea.scrollTop = targetScrollTop;

      if (lineGutterRef.current) {
        lineGutterRef.current.scrollTop = targetScrollTop;
      }
    });
  }

  return (
    <main className="fsx-main" style={{ maxWidth: "none", width: "calc(100vw - 32px)", margin: "0 auto" }}>
      <section className="fsx-hero">
        <div>
          <div className="fsx-eyebrow">FreeSloTeX built-in editor</div>
          <h1 className="fsx-title">{props.projectName}</h1>
          <p className="fsx-subtitle">
            VSCode-like layout: Explorer, Outline, TeX helper buttons, editor, compile terminal, and PDF download.
          </p>
        </div>

        <div className="fsx-actions">
          <a href={`/projects/${props.projectId}`} className="fsx-button">
            Back to Project
          </a>
          <a href="/workspace" className="fsx-button">
            My workspace
          </a>
          {livePdfExists ? (
            <a href={`/api/projects/${props.projectId}/pdf`} className="fsx-button fsx-button-primary">
              Download PDF
            </a>
          ) : null}
        </div>
      </section>

      {props.saved ? (
        <section className="fsx-card" style={{ borderColor: "#16a34a", marginBottom: 16 }}>
          <strong>Saved.</strong> main.tex has been updated.
        </section>
      ) : null}

      {liveCompiled ? (
        <section className="fsx-card" style={{ borderColor: "#16a34a", marginBottom: 16 }}>
          <strong>Compiled.</strong> PDF was generated successfully{liveEngine ? ` by ${liveEngine}` : ""}.
        </section>
      ) : null}

      {texAdvice ? (
        <section className="fsx-card" style={{ borderColor: "#f59e0b", marginBottom: 16 }}>
          <strong>TeX advice.</strong> {texAdvice}
        </section>
      ) : null}

      {saveError ? (
        <section className="fsx-card" style={{ borderColor: "#dc2626", marginBottom: 16 }}>
          <strong>Save error.</strong> {saveError}
        </section>
      ) : null}

      {compileError ? (
        <section className="fsx-card" style={{ borderColor: "#dc2626", marginBottom: 16 }}>
          <strong>Compile error.</strong> {compileError}
        </section>
      ) : null}

      <section
        className="fsx-card"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          marginBottom: 16,
          padding: 8,
          display: "flex",
          alignItems: "center",
          gap: 8,
          overflowX: "auto",
          whiteSpace: "nowrap",
          backdropFilter: "blur(10px)",
          background: "rgba(255, 255, 255, 0.96)",
        }}
      >
        <span
          className="fsx-muted"
          style={{
            fontWeight: 700,
            padding: "0 8px",
          }}
        >
          TeX
        </span>

        <div
          role="tablist"
          aria-label="TeX command categories"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flex: "0 0 auto",
          }}
        >
          {snippetGroups.map((group) => {
            const active = group.label === activeSnippetGroup;
            return (
              <button
                key={group.label}
                type="button"
                role="tab"
                aria-selected={active}
                className={active ? "fsx-button fsx-button-primary" : "fsx-button"}
                onClick={() => setActiveSnippetGroup(group.label)}
                style={{
                  padding: "7px 11px",
                  fontSize: 13,
                }}
              >
                {group.label}
              </button>
            );
          })}
        </div>

        <span
          aria-hidden="true"
          style={{
            width: 1,
            height: 28,
            background: "#cbd5e1",
            flex: "0 0 auto",
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flex: "0 0 auto",
          }}
        >
          {currentSnippetGroup?.items.map((item) => (
            <button
              key={`${currentSnippetGroup.label}-${item.label}`}
              type="button"
              className="fsx-button"
              onClick={() => applySnippetItem(item)}
              style={{
                padding: "7px 10px",
                fontSize: 13,
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <div
        ref={gridRef}
        style={{
          display: "grid",
          gridTemplateColumns: `${leftWidth}px 12px minmax(0, 1fr) 12px ${rightWidth}px`,
          gap: 10,
          alignItems: "stretch",
          width: "100%",
          minWidth: 0,
        }}
      >
        <aside style={{ display: "grid", gap: 16 }}>
          <section className="fsx-panel fsx-explorer-panel" style={{ padding: 12, order: 2 }}>
            <div className="fsx-panel-head" style={{ marginBottom: 6 }}>
              <div>
                <h2 className="fsx-panel-title">Explorer</h2>
                <p className="fsx-panel-note">Project files / click text files to open</p>
              </div>
            </div>

            {props.files.length === 0 ? (
              <div className="fsx-empty-box">No files found.</div>
            ) : (
              <div className="fsx-explorer-tree" role="tree" aria-label="Project files">
                {props.files.map((entry) => {
                  const openable = entry.kind === "file" && isTextOpenablePath(entry.relativePath);
                  const active = entry.relativePath === currentFilePath;

                  return (
                    <button
                      key={entry.relativePath}
                      type="button"
                      className={active ? "fsx-explorer-row fsx-explorer-row-active" : "fsx-explorer-row"}
                      onClick={() => openExplorerFile(entry)}
                      disabled={!openable || isFileLoading}
                      style={{ paddingLeft: 6 + entry.depth * 14 }}
                      title={
                        openable
                          ? `Open ${entry.relativePath}`
                          : `${entry.relativePath} cannot be opened as text`
                      }
                    >
                      <span className="fsx-explorer-icon" aria-hidden="true">
                        {fileIcon(entry)}
                      </span>
                      <span className="fsx-explorer-name">{entry.name}</span>
                      <span className="fsx-explorer-meta">
                        {entry.kind === "file" && entry.size !== null ? formatBytes(entry.size) : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {fileActionMessage ? (
              <div className="fsx-explorer-message" role="status">
                {fileActionMessage}
              </div>
            ) : null}
          </section>

          <section className="fsx-panel fsx-outline-panel" style={{ padding: 12, order: 1 }}>
            <div className="fsx-panel-head" style={{ marginBottom: 6 }}>
              <div>
                <h2 className="fsx-panel-title">Outline</h2>
                <p className="fsx-panel-note">Explorer style / click to jump</p>
              </div>
            </div>

            {liveOutline.length === 0 ? (
              <div className="fsx-empty-box">No outline items.</div>
            ) : (
              <div className="fsx-outline-tree" role="tree" aria-label="Document outline">
                {liveOutline.map((item, index) => (
                  <button
                    key={`${item.level}-${item.line}-${index}`}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => goToLine(item.line)}
                    className="fsx-outline-row"
                    style={{ paddingLeft: 6 + outlineIndent(item.level) }}
                    title={`line ${item.line}: ${item.title}`}
                  >
                    <span className="fsx-outline-icon" aria-hidden="true">
                      {outlineIcon(item.level)}
                    </span>
                    <span className="fsx-outline-title">{item.title}</span>
                    <span className="fsx-outline-line">{item.line}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </aside>

        <div
          role="separator"
          aria-label="Resize left sidebar"
          title="Drag to resize Explorer / Outline"
          onMouseDown={(event) => startResizePane("left", event)}
          style={{
            cursor: "col-resize",
            alignSelf: "stretch",
            borderRadius: 999,
            background: "linear-gradient(90deg, transparent, #cbd5e1, transparent)",
            minHeight: 400,
          }}
        />

        <section style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <section className="fsx-panel">
            <div className="fsx-panel-head">
              <div>
                <h2 className="fsx-panel-title">{currentFileDisplayName}</h2>
                <p className="fsx-panel-note">
                  Role: <strong>{props.roleLabel}</strong>
                  {" / "}
                  Mode: <strong>{props.canEdit ? "editable" : "viewer only"}</strong>
                  {" / "}
                  File: <strong>{currentFileCanBeSaved ? "editable" : "read-only"}</strong>
                </p>
              </div>
            </div>

            {props.fileMessage ? (
              <div className="fsx-empty-box">{props.fileMessage}</div>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    alignItems: "center",
                    marginTop: 10,
                    marginBottom: 10,
                    padding: 8,
                    border: "1px solid #e5e7eb",
                    borderRadius: 14,
                    background: "#f8fafc",
                  }}
                >
                  <span className="fsx-muted" style={{ fontWeight: 700 }}>
                    Font size
                  </span>

                  {([12, 14, 16, 18, 20] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={editorFontSize === value ? "fsx-button fsx-button-primary" : "fsx-button"}
                      onClick={() => setEditorFontSize(value)}
                      style={{ padding: "6px 9px", fontSize: 12 }}
                    >
                      {value}px
                    </button>
                  ))}

                  <span
                    aria-hidden="true"
                    style={{
                      width: 1,
                      height: 24,
                      background: "#cbd5e1",
                      margin: "0 4px",
                    }}
                  />

                  <span className="fsx-muted" style={{ fontWeight: 700 }}>
                    Wrap
                  </span>

                  <button
                    type="button"
                    className={!softWrap ? "fsx-button fsx-button-primary" : "fsx-button"}
                    onClick={() => setSoftWrap(false)}
                    style={{ padding: "6px 9px", fontSize: 12 }}
                  >
                    Off
                  </button>

                  <button
                    type="button"
                    className={softWrap ? "fsx-button fsx-button-primary" : "fsx-button"}
                    onClick={() => setSoftWrap(true)}
                    style={{ padding: "6px 9px", fontSize: 12 }}
                  >
                    On
                  </button>
                </div>

                <div className="fsx-actions" style={{ marginTop: 12, marginBottom: 12 }}>
                  {currentFileCanBeSaved ? (
                    <button
                      type="button"
                      onClick={() => runSaveCurrentFile()}
                      disabled={isSavingFile}
                      className="fsx-button fsx-button-primary"
                    >
                      {isSavingFile ? "Saving..." : `Save ${currentFileDisplayName}`}
                    </button>
                  ) : (
                    <span className="fsx-button" aria-disabled="true">
                      {props.canEdit ? "Read-only file" : "Viewer cannot save"}
                    </span>
                  )}

                  {props.canEdit ? (
                    <button
                      type="button"
                      onClick={runSmartCompile}
                      disabled={isCompiling}
                      className="fsx-button fsx-button-primary"
                    >
                      {isCompiling ? "Compiling..." : "Smart Compile"}
                    </button>
                  ) : (
                    <span className="fsx-button" aria-disabled="true">
                      Viewer cannot compile
                    </span>
                  )}

                  {livePdfExists ? (
                    <a href={`/api/projects/${props.projectId}/pdf`} className="fsx-button">
                      Download PDF
                    </a>
                  ) : (
                    <span className="fsx-button" aria-disabled="true">
                      PDF not generated yet
                    </span>
                  )}

                  {isCompiling ? (
                    <span className="fsx-compile-progress" role="status" aria-live="polite">
                      <span className="fsx-compile-spinner" aria-hidden="true">
                        ⏳
                      </span>
                      <span>Compiling...</span>
                    </span>
                  ) : compileStatusMessage ? (
                    <span className="fsx-compile-status" role="status" aria-live="polite">
                      {compileStatusMessage}
                    </span>
                  ) : null}
                </div>

                <form id={`save-form-${props.projectId}`} action={`/api/projects/${props.projectId}/files/save`} method="post">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "44px minmax(0, 1fr)",
                      width: editorBodyWidth,
                      maxWidth: "100%",
                      height: `${editorHeight}px`,
                      minHeight: 260,
                      resize: "none",
                      overflow: "hidden",
                      borderRadius: 16,
                      border: "1px solid #d1d5db",
                      background: props.canEdit ? "#ffffff" : "#f9fafb",
                    }}
                  >
                    <div
                      ref={lineGutterRef}
                      aria-hidden="true"
                      style={{
                        padding: "16px 8px 16px 6px",
                        borderRight: "1px solid #e5e7eb",
                        background: "#f8fafc",
                        color: "#94a3b8",
                        textAlign: "right",
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                        fontSize: lineNumberFontSize,
                        lineHeight: 1.55,
                        whiteSpace: "pre",
                        overflow: "hidden",
                        userSelect: "none",
                      }}
                    >
                      {lineNumberText}
                    </div>

                    <input type="hidden" name="relativePath" value={currentFilePath} />

                    <textarea
                      ref={textareaRef}
                      name="content"
                      readOnly={!props.canEdit}
                      value={tex}
                      onChange={(event) => setTex(event.target.value)}
                      onScroll={syncLineNumberScroll}
                      spellCheck={false}
                      style={{
                        width: "100%",
                        height: "100%",
                        minHeight: 0,
                        minWidth: 0,
                        resize: "none",
                        padding: 16,
                        border: "none",
                        outline: "none",
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                        fontSize: editorFontSize,
                        lineHeight: 1.55,
                        whiteSpace: softWrap ? "pre-wrap" : "pre",
                        overflowX: softWrap ? "hidden" : "auto",
                        overflowY: "auto",
                        boxSizing: "border-box",
                        background: "transparent",
                      }}
                    />
                  </div>

                </form>

                <form
                  id={`compile-form-${props.projectId}`}
                  action={`/api/projects/${props.projectId}/compile`}
                  method="post"
                  style={{ display: "none" }}
                />
              </>
            )}
          </section>

          <div
            role="separator"
            aria-label="Resize editor and compile terminal"
            title="Drag to resize TeX editor and Compile Terminal"
            onMouseDown={startResizeVertical}
            style={{
              cursor: "row-resize",
              height: 12,
              borderRadius: 999,
              background: "linear-gradient(180deg, transparent, #cbd5e1, transparent)",
              margin: "-2px 8px",
            }}
          />

          <section className="fsx-panel">
            <div className="fsx-panel-head">
              <div>
                <h2 className="fsx-panel-title">Compile Terminal</h2>
                <p className="fsx-panel-note">
                  Read-only compile output. FreeSloTeX does not expose arbitrary shell commands.
                </p>
              </div>

              {liveCompileErrorSummary ? (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    justifyContent: "flex-end",
                    flexWrap: "wrap",
                  }}
                >
                  {copySummaryStatus ? (
                    <span className="fsx-muted" style={{ fontSize: 12, fontWeight: 700 }}>
                      {copySummaryStatus}
                    </span>
                  ) : null}

                  <button
                    type="button"
                    className="fsx-button fsx-button-primary"
                    onClick={copyCompileErrorSummary}
                    style={{ padding: "6px 10px", fontSize: 12 }}
                  >
                    Copy error summary
                  </button>
                </div>
              ) : null}
            </div>

            {liveCompileErrorSummary ? (
              <div
                style={{
                  marginTop: 12,
                  marginBottom: 12,
                  border: "1px solid #fca5a5",
                  background: "#fff7ed",
                  color: "#7f1d1d",
                  borderRadius: 16,
                  padding: 14,
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 8 }}>
                  Compile Error Summary
                </div>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    margin: 0,
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    fontSize: 12,
                    lineHeight: 1.5,
                    overflow: "auto",
                    maxHeight: 260,
                  }}
                >
                  {liveCompileErrorSummary}
                </pre>
              </div>
            ) : null}

            {liveFsxLogTail || liveTexLogTail ? (
              <div
                style={{
                  marginTop: 12,
                  background: "#0f172a",
                  color: "#e5e7eb",
                  borderRadius: 16,
                  padding: 14,
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  fontSize: 12,
                  lineHeight: 1.5,
                  height: `${terminalHeight}px`,
                  minHeight: 160,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {liveFsxLogTail ? `===== FreeSloTeX compile log =====\n${liveFsxLogTail}\n\n` : ""}
                {liveTexLogTail ? `===== TeX log tail =====\n${liveTexLogTail}` : ""}
              </div>
            ) : (
              <div className="fsx-empty-box">No compile log yet.</div>
            )}
          </section>
        </section>

        <div
          role="separator"
          aria-label="Resize PDF preview"
          title="Drag to resize PDF preview"
          onMouseDown={(event) => startResizePane("right", event)}
          style={{
            cursor: "col-resize",
            alignSelf: "stretch",
            borderRadius: 999,
            background: "linear-gradient(90deg, transparent, #cbd5e1, transparent)",
            minHeight: 400,
          }}
        />

        <aside style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <section className="fsx-panel" style={{ padding: 16, position: "sticky", top: 16 }}>
            <div className="fsx-panel-head">
              <div>
                <h2 className="fsx-panel-title">PDF Preview</h2>
                <p className="fsx-panel-note">
                  Preview of the latest compiled PDF.
                </p>
              </div>
            </div>

            <PdfPreviewClient projectId={props.projectId} pdfExists={livePdfExists} refreshKey={pdfRefreshKey} />
          </section>
        </aside>

      </div>
    </main>
  );
}
