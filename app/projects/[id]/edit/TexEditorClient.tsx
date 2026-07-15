"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PdfPreviewClient from "./PdfPreviewClient";
import ProjectUploadClient from "../ProjectUploadClient";

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

type RightPaneTab = "pdf" | "terminal";
type CompileMode = "fast" | "clean" | "rebuild";

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
  if (level === "paragraph") return "◦";
  return "–";
}

function outlineIndent(level: string) {
  if (level === "part") return 0;
  if (level === "chapter") return 0;
  if (level === "section") return 1;
  if (level === "subsection") return 7;
  if (level === "subsubsection") return 12;
  if (level === "paragraph") return 17;
  return 1;
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
  const re = /\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\{([^}]*)\}/g;

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
  if (code === "quota_exceeded") {
    return "Free plan allows 50 compiles per day. Please try again tomorrow.";
  }
  if (code === "failed") return "Compile failed. Please check the terminal below.";
  return "Compile failed.";
}

function stripTexComments(tex: string) {
  return tex
    .split(/\r\n|\r|\n/)
    .map((line) => {
      let escaped = false;

      for (let i = 0; i < line.length; i++) {
        const ch = line[i];

        if (ch === "\\" && !escaped) {
          escaped = true;
          continue;
        }

        if (ch === "%" && !escaped) {
          return line.slice(0, i);
        }

        escaped = false;
      }

      return line;
    })
    .join("\n");
}

function detectTexAdvice(tex: string) {
  const uncommented = tex.replace(/(^|[^\\])%.*$/gm, "$1");
  const cls = uncommented.match(/\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/)?.[1] ?? "";
  const hasJapaneseOrFullwidth =
    /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(uncommented);

  function hasPackage(name: string) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      String.raw`\\usepackage(?:\[[^\]]*\])?\{[^}]*\b${escaped}\b[^}]*\}`
    );
    return re.test(uncommented);
  }

  const lualatexReady =
    /^ltjs(article|book|report)$/.test(cls) ||
    hasPackage("luatexja") ||
    hasPackage("luatexja-preset") ||
    hasPackage("luatexja-fontspec");

  const ptexReady =
    /^(u)?p?js(article|book|report)$/.test(cls) ||
    /^(jarticle|jbook|jreport|tarticle|tbook|treport|gjisbook|jjssj|jjssj_20220603)$/.test(cls);

  if (hasJapaneseOrFullwidth && !lualatexReady && !ptexReady) {
    return "Japanese or full-width characters were detected. Use a Japanese TeX class such as \\\\documentclass[a4paper,11pt]{ltjsarticle}, jsarticle, or jarticle.";
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
  const [showTexHelpers, setShowTexHelpers] = useState(false);
  const [editorFontSize, setEditorFontSize] = useState(14);
  const [showFontSizePicker, setShowFontSizePicker] = useState(false);


  const [softWrap, setSoftWrap] = useState(false);
  const [editorColorMode, setEditorColorMode] =
    useState<"auto" | "light" | "dark">("auto");
  const [prefersDarkColorScheme, setPrefersDarkColorScheme] = useState(false);
  const [showParagraphInOutline, setShowParagraphInOutline] = useState(true);
  const [outlinePreferencesLoaded, setOutlinePreferencesLoaded] = useState(false);
  const [leftOutlineHeight, setLeftOutlineHeight] = useState(300);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lineGutterRef = useRef<HTMLDivElement | null>(null);
  const compileTerminalPanelRef = useRef<HTMLElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(640);
  const [editorHeight, setEditorHeight] = useState(680);
  const [terminalHeight, setTerminalHeight] = useState(320);
  const [rightPaneTab, setRightPaneTab] = useState<RightPaneTab>("pdf");
  const [copySummaryStatus, setCopySummaryStatus] = useState("");
  const [isCompiling, setIsCompiling] = useState(false);
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("freeslotex:compile-state", {
        detail: { isCompiling },
      }),
    );
  }, [isCompiling]);

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
  const [layoutPreferencesLoaded, setLayoutPreferencesLoaded] = useState(false);

  const MIN_LEFT_WIDTH = 180;
  const MIN_EDITOR_WIDTH = 360;
  const MIN_RIGHT_WIDTH = 160;
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
    try {
      const rawLayout = window.localStorage.getItem("freeslotex.editorLayout");
      const saved = rawLayout ? JSON.parse(rawLayout) : null;

      if (saved && typeof saved === "object") {
        const savedLeftWidth = Number(saved.leftWidth);
        const savedRightWidth = Number(saved.rightWidth);
        const savedEditorHeight = Number(saved.editorHeight);
        const savedTerminalHeight = Number(saved.terminalHeight);

        if (Number.isFinite(savedLeftWidth)) {
          setLeftWidth(clamp(savedLeftWidth, MIN_LEFT_WIDTH, 620));
        }

        if (Number.isFinite(savedRightWidth)) {
          setRightWidth(clamp(savedRightWidth, MIN_RIGHT_WIDTH, 1800));
        }

        if (Number.isFinite(savedEditorHeight)) {
          setEditorHeight(
            clamp(savedEditorHeight, 240, Math.max(1200, window.innerHeight * 1.6))
          );
        }

        if (Number.isFinite(savedTerminalHeight)) {
          setTerminalHeight(clamp(savedTerminalHeight, 160, 900));
        }
      }
    } catch {
      // Ignore storage errors. The editor still works with default layout.
    } finally {
      setLayoutPreferencesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!layoutPreferencesLoaded) return;

    try {
      window.localStorage.setItem(
        "freeslotex.editorLayout",
        JSON.stringify({
          leftWidth,
          rightWidth,
          editorHeight,
          terminalHeight,
        })
      );
    } catch {
      // Ignore storage errors.
    }
  }, [layoutPreferencesLoaded, leftWidth, rightWidth, editorHeight, terminalHeight]);

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
    event: import("react").PointerEvent<HTMLDivElement>
  ) {
    event.preventDefault();

    const startX = event.clientX;
    const startLeft = leftWidth;
    const startRight = rightWidth;

    const onMove = (moveEvent: PointerEvent) => {
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
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function startResizePdfPreview(
    event: import("react").PointerEvent<HTMLDivElement>
  ) {
    event.preventDefault();

    const startX = event.clientX;
    const startLeft = leftWidth;
    const startRight = rightWidth;
    const pointerId = event.pointerId;
    const target = event.currentTarget;

    try {
      target.setPointerCapture(pointerId);
    } catch {
      // Ignore if pointer capture is unavailable.
    }

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const maxRight = getMaxRightWidth(startLeft);
      setRightWidth(clamp(startRight - dx, MIN_RIGHT_WIDTH, maxRight));
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);

      try {
        target.releasePointerCapture(pointerId);
      } catch {
        // Ignore if capture was not active.
      }

      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  const saveError = saveErrorMessage(props.saveError);
  const compileError = compileErrorMessage(liveCompileError);
  const compileErrorTitle =
    liveCompileError === "quota_exceeded" ? "Compile limit reached." : "Compile error.";
  const texAdvice = useMemo(() => detectTexAdvice(tex), [tex]);
  const currentSnippetGroup = useMemo(
    () => snippetGroups.find((group) => group.label === activeSnippetGroup) ?? snippetGroups[0],
    [activeSnippetGroup]
  );
  const editorBodyWidth = "100%";
  const editorLineHeightPx = editorFontSize * 1.55;
  const lineNumberFontSize = Math.max(10, editorFontSize - 3);
  const editorUsesDarkColors =
    editorColorMode === "dark" ||
    (editorColorMode === "auto" && prefersDarkColorScheme);
  const editorTextareaBackgroundColor = editorUsesDarkColors
    ? "#111827"
    : props.canEdit
      ? "#ffffff"
      : "#f9fafb";
  const editorTextColor = editorUsesDarkColors ? "#f8fafc" : "#0f172a";
  const editorCaretColor = editorUsesDarkColors ? "#ffffff" : "#0f172a";

  useEffect(() => {
    try {
      const rawFontSize = window.localStorage.getItem("freeslotex.editorFontSize");
      const parsedFontSize = Number(rawFontSize);

      if ([12, 14, 16, 18, 20, 22, 24].includes(parsedFontSize)) {
        setEditorFontSize(parsedFontSize);
      }

      const rawSoftWrap = window.localStorage.getItem("freeslotex.softWrap");
      if (rawSoftWrap === "1") setSoftWrap(true);
      if (rawSoftWrap === "0") setSoftWrap(false);

      const rawEditorColorMode = window.localStorage.getItem(
        "freeslotex.editorColorMode",
      );

      if (rawEditorColorMode === "light" || rawEditorColorMode === "dark") {
        setEditorColorMode(rawEditorColorMode);
      } else {
        setEditorColorMode("auto");
      }
    } catch {
      // Ignore storage errors. The editor still works with default settings.
    } finally {
      setEditorPreferencesLoaded(true);
    }
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function handleColorSchemeChange() {
      setPrefersDarkColorScheme(mediaQuery.matches);
    }

    handleColorSchemeChange();
    mediaQuery.addEventListener("change", handleColorSchemeChange);

    return () => {
      mediaQuery.removeEventListener("change", handleColorSchemeChange);
    };
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

  useEffect(() => {
    if (!editorPreferencesLoaded) return;

    try {
      window.localStorage.setItem(
        "freeslotex.editorColorMode",
        editorColorMode,
      );
    } catch {
      // Ignore storage errors.
    }
  }, [editorColorMode, editorPreferencesLoaded]);

  useEffect(() => {
    function handleSetEditorFontSize(event: Event) {
      const customEvent = event as CustomEvent<{ fontSize?: number }>;
      const fontSize = Number(customEvent.detail?.fontSize);

      if ([12, 14, 16, 18, 20, 22, 24].includes(fontSize)) {
        setEditorFontSize(fontSize);
        setShowFontSizePicker(false);
      }
    }

    function handleSetSoftWrap(event: Event) {
      const customEvent = event as CustomEvent<{ softWrap?: boolean }>;

      if (typeof customEvent.detail?.softWrap === "boolean") {
        setSoftWrap(customEvent.detail.softWrap);
      }
    }

    function handleSetEditorColorMode(event: Event) {
      const customEvent = event as CustomEvent<{
        colorMode?: "auto" | "light" | "dark";
      }>;
      const colorMode = customEvent.detail?.colorMode;

      if (
        colorMode === "auto" ||
        colorMode === "light" ||
        colorMode === "dark"
      ) {
        setEditorColorMode(colorMode);
      }
    }

    window.addEventListener("freeslotex:set-editor-font-size", handleSetEditorFontSize);
    window.addEventListener("freeslotex:set-soft-wrap", handleSetSoftWrap);
    window.addEventListener(
      "freeslotex:set-editor-color-mode",
      handleSetEditorColorMode,
    );

    return () => {
      window.removeEventListener("freeslotex:set-editor-font-size", handleSetEditorFontSize);
      window.removeEventListener("freeslotex:set-soft-wrap", handleSetSoftWrap);
      window.removeEventListener(
        "freeslotex:set-editor-color-mode",
        handleSetEditorColorMode,
      );
    };
  }, []);

  const lineNumberText = useMemo(() => {
    const lineCount = Math.max(1, tex.split(/\r\n|\r|\n/).length);
    return Array.from({ length: lineCount }, (_, index) => String(index + 1)).join("\n");
  }, [tex]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("freeslotex.showParagraphInOutline");

      if (saved === "0") {
        setShowParagraphInOutline(false);
      } else if (saved === "1") {
        setShowParagraphInOutline(true);
      }
    } catch {
      // Ignore storage errors. Outline still works with the default setting.
    } finally {
      setOutlinePreferencesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!outlinePreferencesLoaded) return;

    try {
      window.localStorage.setItem(
        "freeslotex.showParagraphInOutline",
        showParagraphInOutline ? "1" : "0"
      );
    } catch {
      // Ignore storage errors.
    }
  }, [outlinePreferencesLoaded, showParagraphInOutline]);

  const liveOutline = useMemo(() => parseLiveOutline(tex), [tex]);
  const visibleOutline = useMemo(
    () =>
      showParagraphInOutline
        ? liveOutline
        : liveOutline.filter((item) => item.level !== "paragraph"),
    [liveOutline, showParagraphInOutline]
  );
  const currentFileDisplayName = currentFilePath || "main.tex";
  const saveAsSuggestedPath = currentFilePath.endsWith(".tex")
    ? currentFilePath.replace(/\.tex$/i, "_copy.tex")
    : `${currentFilePath}_copy.tex`;
  const currentPdfFile = currentFilePath.replace(/\.tex$/i, ".pdf");
  const encodedCurrentPdfFile = encodeURIComponent(currentPdfFile);
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

  function makeAiPromptForCompileError() {
    const errorSummary = liveCompileErrorSummary || "エラー要約はありません。";

    return [
      "あなたは LaTeX エラー診断AIです。",
      "以下の FreeSloTeX compile error summary をもとに、原因と最小修正を日本語で説明してください。",
      "",
      "制約:",
      "- 文書全体を書き換えないでください。",
      "- 最小修正だけを提案してください。",
      "- FreeSloTeX Hint がある場合は、それを優先して検討してください。",
      "- 情報が不足している場合は、推測で全文修正せず、必要な追加情報だけを尋ねてください。",
      "",
      "回答形式:",
      "1. 原因",
      "2. 該当箇所",
      "3. 最小修正案",
      "4. 追加で確認すべきこと",
      "",
      "FreeSloTeX compile error summary:",
      "```text",
      errorSummary,
      "```",
    ].join("\n");
  }

  async function copyAiPromptForCompileError() {
    if (!liveCompileErrorSummary) return;

    const text = makeAiPromptForCompileError();

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("Clipboard API is unavailable");
      }

      setCopySummaryStatus("AI prompt copied");
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
        setCopySummaryStatus("AI prompt copied");
      } catch {
        setCopySummaryStatus("AI prompt copy failed");
      }
    }

    window.setTimeout(() => setCopySummaryStatus(""), 2400);
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

  function downloadCurrentFile() {
    const filename = currentFileDisplayName || "main.tex";
    const blob = new Blob([tex], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function runSaveAsCurrentFile() {
    if (!props.canEdit || isSavingFile) return;

    const requestedPath = window.prompt("Save current TeX as:", saveAsSuggestedPath);

    if (requestedPath === null) {
      return;
    }

    const targetPath = requestedPath
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");

    if (!targetPath) {
      setFileActionMessage("Save as failed: file name is empty.");
      return;
    }

    if (!targetPath.endsWith(".tex")) {
      setFileActionMessage("Save as failed: please use a .tex file name.");
      return;
    }

    if (
      targetPath.includes("\\0") ||
      targetPath.split("/").some((part) => !part || part === "." || part === "..")
    ) {
      setFileActionMessage("Save as failed: invalid file path.");
      return;
    }

    const message =
      targetPath === currentFilePath
        ? "This is the current file. Save normally?"
        : `Save current content as ${targetPath}? If the file already exists, it will be overwritten.`;

    if (!window.confirm(message)) {
      return;
    }

    setIsSavingFile(true);
    setFileActionMessage(`Saving as ${targetPath}...`);

    try {
      const response = await fetch(`/api/projects/${props.projectId}/files/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          relativePath: targetPath,
          content: tex,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error ?? `Save as failed with HTTP ${response.status}`);
      }

      setCurrentFilePath(targetPath);
      setLivePdfExists(false);
      setPdfRefreshKey((value) => value + 1);
      setFileActionMessage(data.message ?? `Saved as ${targetPath}.`);
      setCompileStatusMessage(`Saved as ${targetPath}. Compile to generate PDF.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setFileActionMessage(`Save as failed: ${errorMessage}`);
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

  async function runSmartCompile(compileMode: CompileMode = "clean") {
    if (!props.canEdit || isCompiling) return;

    const saved = await runSaveCurrentFile({ silent: true });
    if (!saved) return;

    setIsCompiling(true);
    setCompileStatusMessage("Compiling...");
    setLiveCompileError(null);
    setLiveCompileErrorSummary("");
    setCopySummaryStatus("");

    try {
      const response = await fetch(`/api/projects/${props.projectId}/compile/live?rootFile=${encodeURIComponent(currentFilePath)}&compileMode=${compileMode}`, {
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
      if (data.compileError !== "quota_exceeded") {
        setLivePdfExists(Boolean(data.pdfExists));
        setRightPaneTab(data.ok && Boolean(data.pdfExists) ? "pdf" : "terminal");
        setPdfRefreshKey((value) => value + 1);
      }
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

  function startResizeEditorHeight(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();

    const startY = event.clientY;
    const startEditorHeight = editorHeight;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dy = moveEvent.clientY - startY;
      setEditorHeight(clamp(startEditorHeight + dy, 240, Math.max(1200, window.innerHeight * 1.6)));
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  function startResizeVertical(event: import("react").PointerEvent<HTMLDivElement>) {
    event.preventDefault();

    const startY = event.clientY;
    const startEditorHeight = editorHeight;
    const startTerminalHeight = terminalHeight;

    const onMove = (moveEvent: PointerEvent) => {
      const dy = moveEvent.clientY - startY;

      setEditorHeight(clamp(startEditorHeight + dy, 240, Math.max(1200, window.innerHeight * 1.6)));
      setTerminalHeight(clamp(startTerminalHeight - dy, 160, Math.max(220, window.innerHeight - 260)));
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function startResizeOutlineExplorer(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();

    const startY = event.clientY;
    const startHeight = leftOutlineHeight;

    const onMove = (moveEvent: PointerEvent) => {
      const dy = moveEvent.clientY - startY;
      setLeftOutlineHeight(clamp(startHeight + dy, 120, 700));
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  useEffect(() => {
    function handleCompileMenuAction(event: Event) {
      const customEvent = event as CustomEvent<{ action?: string }>;
      const action = customEvent.detail?.action;
      if (action === "compile-current-file" || action === "compile-clean") {
        void runSmartCompile("clean");
        return;
      }

      if (action === "compile-fast") {
        void runSmartCompile("fast");
        return;
      }

      if (action === "compile-rebuild") {
        void runSmartCompile("rebuild");
        return;
      }

      if (action === "refresh-pdf") {
        setPdfRefreshKey((value) => value + 1);
        return;
      }

      if (action === "download-pdf") {
        if (!livePdfExists) {
          window.alert("No PDF available. Compile first.");
          return;
        }

        const link = document.createElement("a");
        const filename = currentPdfFile.split("/").pop() || "main.pdf";
        link.href = `/api/projects/${props.projectId}/pdf?file=${encodeURIComponent(currentPdfFile)}`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        return;
      }

      if (action === "copy-error-summary") {
        if (!liveCompileErrorSummary) {
          window.alert("No error summary.");
          return;
        }

        void copyCompileErrorSummary();
        return;
      }

      if (action === "copy-ai-prompt") {
        if (!liveCompileErrorSummary) {
          window.alert("No error summary.");
          return;
        }

        void copyAiPromptForCompileError();
        return;
      }

      if (action === "view-tex-log") {
        compileTerminalPanelRef.current?.scrollIntoView({
          block: "start",
          behavior: "smooth",
        });

        if (!liveFsxLogTail && !liveTexLogTail) {
          window.alert("No compile log yet.");
        }
      }
    }

    window.addEventListener("freeslotex:compile-menu-action", handleCompileMenuAction);

    return () => {
      window.removeEventListener("freeslotex:compile-menu-action", handleCompileMenuAction);
    };
  }, [
    copyAiPromptForCompileError,
    copyCompileErrorSummary,
    currentPdfFile,
    liveCompileErrorSummary,
    liveFsxLogTail,
    livePdfExists,
    liveTexLogTail,
    props.projectId,
    runSmartCompile,
  ]);

  function insertSnippet(snippet: string) {
    if (!props.canEdit) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const previousTextareaScrollTop = textarea.scrollTop;
    const previousTextareaScrollLeft = textarea.scrollLeft;
    const previousLineGutterScrollTop = lineGutterRef.current?.scrollTop ?? previousTextareaScrollTop;
    const previousWindowScrollX = window.scrollX;
    const previousWindowScrollY = window.scrollY;
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

    const restoreSelectionAndScroll = () => {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(cursor, cursor);
      textarea.scrollTop = previousTextareaScrollTop;
      textarea.scrollLeft = previousTextareaScrollLeft;
      if (lineGutterRef.current) {
        lineGutterRef.current.scrollTop = previousLineGutterScrollTop;
      }
      window.scrollTo(previousWindowScrollX, previousWindowScrollY);
    };

    window.requestAnimationFrame(() => {
      restoreSelectionAndScroll();
      window.requestAnimationFrame(restoreSelectionAndScroll);
    });
  }

  useEffect(() => {
    function handleTopMenuInsertSnippet(event: Event) {
      const customEvent = event as CustomEvent<{ snippet?: string }>;
      const snippet = customEvent.detail?.snippet;

      if (typeof snippet !== "string" || snippet.length === 0) return;

      insertSnippet(snippet);
    }

    window.addEventListener("freeslotex:insert-snippet", handleTopMenuInsertSnippet);

    return () => {
      window.removeEventListener("freeslotex:insert-snippet", handleTopMenuInsertSnippet);
    };
  }, [tex, props.canEdit]);

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

  function revealEditorRange(start: number, end: number) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const targetTextarea: HTMLTextAreaElement = textarea;
    const value = targetTextarea.value;
    const safeStart = Math.min(Math.max(0, start), value.length);
    const safeEnd = Math.min(Math.max(safeStart, end), value.length);

    function measureTargetScrollTop() {
      const computedStyle = window.getComputedStyle(targetTextarea);
      const mirror = document.createElement("div");
      const marker = document.createElement("span");

      mirror.style.position = "absolute";
      mirror.style.visibility = "hidden";
      mirror.style.pointerEvents = "none";
      mirror.style.left = "-10000px";
      mirror.style.top = "0";
      mirror.style.width = `${targetTextarea.clientWidth}px`;
      mirror.style.boxSizing = "border-box";
      mirror.style.padding = computedStyle.padding;
      mirror.style.border = "0";
      mirror.style.fontFamily = computedStyle.fontFamily;
      mirror.style.fontSize = computedStyle.fontSize;
      mirror.style.fontWeight = computedStyle.fontWeight;
      mirror.style.letterSpacing = computedStyle.letterSpacing;
      mirror.style.lineHeight = computedStyle.lineHeight;
      mirror.style.tabSize = computedStyle.tabSize;
      mirror.style.whiteSpace = softWrap ? "pre-wrap" : "pre";
      mirror.style.overflowWrap = softWrap ? "break-word" : "normal";
      mirror.style.wordBreak = computedStyle.wordBreak;

      mirror.textContent = value.slice(0, safeStart) || "\u200b";
      marker.textContent = "\u200b";
      mirror.appendChild(marker);
      document.body.appendChild(mirror);

      const measuredTop = marker.offsetTop;
      mirror.remove();

      return Math.max(0, measuredTop - targetTextarea.clientHeight / 2);
    }

    const targetScrollTop = measureTargetScrollTop();

    const applyScroll = () => {
      targetTextarea.scrollTop = targetScrollTop;

      if (lineGutterRef.current) {
        lineGutterRef.current.scrollTop = targetScrollTop;
      }
    };

    targetTextarea.focus({ preventScroll: true });
    targetTextarea.setSelectionRange(safeStart, safeEnd);
    applyScroll();

    window.requestAnimationFrame(() => {
      applyScroll();
      targetTextarea.setSelectionRange(safeStart, safeEnd);
      window.setTimeout(applyScroll, 0);
      window.setTimeout(applyScroll, 50);
      window.setTimeout(applyScroll, 120);
      window.setTimeout(applyScroll, 250);
    });
  }

  useEffect(() => {
    function handleRevealEditorRange(event: Event) {
      const customEvent = event as CustomEvent<{ start?: number; end?: number }>;
      const start = customEvent.detail?.start;
      const end = customEvent.detail?.end;

      if (typeof start !== "number" || typeof end !== "number") return;
      if (!Number.isFinite(start) || !Number.isFinite(end)) return;

      revealEditorRange(start, end);
    }

    window.addEventListener("freeslotex:reveal-editor-range", handleRevealEditorRange);

    return () => {
      window.removeEventListener("freeslotex:reveal-editor-range", handleRevealEditorRange);
    };
  }, [softWrap]);

  function goToLine(line: number) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const targetTextarea: HTMLTextAreaElement = textarea;
    const lines = tex.split(/\r\n|\r|\n/);
    const safeLine = Math.min(Math.max(1, line), lines.length);
    const pos =
      lines.slice(0, Math.max(0, safeLine - 1)).join("\n").length +
      (safeLine > 1 ? 1 : 0);

    function measureTargetScrollTop() {
      const computedStyle = window.getComputedStyle(targetTextarea);
      const mirror = document.createElement("div");
      const marker = document.createElement("span");

      mirror.style.position = "absolute";
      mirror.style.visibility = "hidden";
      mirror.style.pointerEvents = "none";
      mirror.style.left = "-10000px";
      mirror.style.top = "0";
      mirror.style.width = `${targetTextarea.clientWidth}px`;
      mirror.style.boxSizing = "border-box";
      mirror.style.padding = computedStyle.padding;
      mirror.style.border = "0";
      mirror.style.fontFamily = computedStyle.fontFamily;
      mirror.style.fontSize = computedStyle.fontSize;
      mirror.style.fontWeight = computedStyle.fontWeight;
      mirror.style.letterSpacing = computedStyle.letterSpacing;
      mirror.style.lineHeight = computedStyle.lineHeight;
      mirror.style.tabSize = computedStyle.tabSize;
      mirror.style.whiteSpace = softWrap ? "pre-wrap" : "pre";
      mirror.style.overflowWrap = softWrap ? "break-word" : "normal";
      mirror.style.wordBreak = computedStyle.wordBreak;

      mirror.textContent = tex.slice(0, pos) || "\u200b";
      marker.textContent = "\u200b";
      mirror.appendChild(marker);
      document.body.appendChild(mirror);

      const measuredTop = marker.offsetTop;
      mirror.remove();

      return Math.max(0, measuredTop - 2);
    }

    const targetScrollTop = measureTargetScrollTop();

    const applyScroll = () => {
      targetTextarea.scrollTop = targetScrollTop;

      if (lineGutterRef.current) {
        lineGutterRef.current.scrollTop = targetScrollTop;
      }
    };

    targetTextarea.focus({ preventScroll: true });
    targetTextarea.setSelectionRange(pos, pos);
    applyScroll();

    window.requestAnimationFrame(() => {
      applyScroll();
      window.setTimeout(applyScroll, 0);
      window.setTimeout(applyScroll, 50);
      window.setTimeout(applyScroll, 120);
      window.setTimeout(applyScroll, 250);
    });
  }

  return (
    <main className="fsx-main fsx-editor-main" style={{ maxWidth: "none", width: "calc(100vw - 4px)", margin: "0 auto", padding: "1px 2px 0" }}>
      <section className="fsx-hero">
        <div>
          <div className="fsx-eyebrow">FreeSloTeX built-in editor</div>
          <h1 className="fsx-title">{props.projectName}</h1>
          <button
            type="button"
            className="fsx-button fsx-button-primary fsx-save-current-inline"
            onClick={() => runSaveCurrentFile()}
            disabled={isSavingFile || !currentFileCanBeSaved}
            title={`Save ${currentFileDisplayName}`}
            style={{ display: "none", padding: "1px 7px", fontSize: 12, width: "fit-content" }}
          >
            {isSavingFile ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            className="fsx-button fsx-save-as-inline"
            onClick={runSaveAsCurrentFile}
            disabled={isSavingFile || !props.canEdit}
            title={`Save current content as another TeX file, e.g. ${saveAsSuggestedPath}`}
            style={{ display: "none", padding: "1px 7px", fontSize: 12, width: "fit-content" }}
          >
            Save as...
          </button>

        </div>

        <div className="fsx-editor-header-tools">
          <div
            className="fsx-actions fsx-editor-navigation-actions-top"
            aria-label="Editor preferences and navigation"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <div className="fsx-editor-pref-actions" aria-label="Editor preferences" style={{ display: "none" }}>
              <button
                type="button"
                className="fsx-button"
                onClick={() => setShowFontSizePicker((value) => !value)}
                aria-expanded={showFontSizePicker}
                title="Show font size options"
                style={{ padding: "6px 9px", fontSize: 12 }}
              >
                Font {editorFontSize}px {showFontSizePicker ? "▾" : "▸"}
              </button>

              {showFontSizePicker ? (
                <>
                  {([12, 14, 16, 18, 20, 22, 24] as const).map((value) => (
                    <button
                      key={`top-font-${value}`}
                      type="button"
                      className={editorFontSize === value ? "fsx-button fsx-button-primary" : "fsx-button"}
                      onClick={() => {
                        setEditorFontSize(value);
                        setShowFontSizePicker(false);
                      }}
                      style={{ padding: "6px 9px", fontSize: 12 }}
                    >
                      {value}px
                    </button>
                  ))}
                </>
              ) : null}

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

            <a href={`/projects/${props.projectId}`} className="fsx-button" style={{ display: "none" }}>
              Back to Project
            </a>

            <a href="/workspace" className="fsx-button" style={{ display: "none" }}>
              My workspace
            </a>
          </div>

        <div
          style={{ display: "none" }}
          className={
            showTexHelpers
              ? "fsx-editor-command-bar fsx-editor-command-bar-open"
              : "fsx-editor-command-bar fsx-editor-command-bar-collapsed"
          }
        >
          <button
            type="button"
            className="fsx-button fsx-helper-toggle"
            onClick={() => setShowTexHelpers((value) => !value)}
            aria-expanded={showTexHelpers}
          >
            {showTexHelpers ? "TeX helpers ▾" : "TeX helpers ▸"}
          </button>

          {showTexHelpers ? (
            <>
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
                        padding: "6px 9px",
                        fontSize: 12,
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
                  height: 24,
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
                      padding: "6px 8px",
                      fontSize: 12,
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>

        <div className="fsx-actions fsx-editor-global-actions">
          <div className="fsx-editor-pref-actions" aria-label="Editor preferences">
            <button
              type="button"
              className="fsx-button"
              onClick={() => setShowFontSizePicker((value) => !value)}
              aria-expanded={showFontSizePicker}
              title="Show font size options"
              style={{ padding: "6px 9px", fontSize: 12 }}
            >
              Font {editorFontSize}px {showFontSizePicker ? "▾" : "▸"}
            </button>

            {showFontSizePicker ? (
              <>
                {([12, 14, 16, 18, 20, 22, 24] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={editorFontSize === value ? "fsx-button fsx-button-primary" : "fsx-button"}
                    onClick={() => {
                      setEditorFontSize(value);
                      setShowFontSizePicker(false);
                    }}
                    style={{ padding: "6px 9px", fontSize: 12 }}
                  >
                    {value}px
                  </button>
                ))}
              </>
            ) : null}

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

          <button
            type="button"
            onClick={downloadCurrentFile}
            className="fsx-button"
            title={`Download ${currentFileDisplayName}`}
            style={{ display: "none" }}
          >
            Download TeX
          </button>

          {props.canEdit ? (
            <button
              type="button"
              onClick={() => runSmartCompile("clean")}
              disabled={isCompiling}
              className="fsx-button fsx-button-primary"
              style={{ display: "none" }}
            >
              {isCompiling ? "Compiling..." : "Smart Compile"}
            </button>
          ) : (
            <span className="fsx-button" aria-disabled="true" style={{ display: "none" }}>
              Viewer cannot compile
            </span>
          )}

          {livePdfExists ? (
            <a href={`/api/projects/${props.projectId}/pdf?file=${encodedCurrentPdfFile}`} className="fsx-button fsx-button-primary" style={{ display: "none" }}>
              Download PDF
            </a>
          ) : null}

          {isCompiling ? (
            <span className="fsx-compile-progress" role="status" aria-live="polite" style={{ display: "none" }}>
              <span className="fsx-compile-spinner" aria-hidden="true">
                ⏳
              </span>
              <span>Compiling...</span>
            </span>
          ) : compileStatusMessage ? (
            <span className="fsx-compile-status" role="status" aria-live="polite" style={{ display: "none" }}>
              {compileStatusMessage}
            </span>
          ) : null}

          <a href={`/projects/${props.projectId}`} className="fsx-button">
            Back to Project
          </a>

          <a href="/workspace" className="fsx-button">
            My workspace
          </a>
        </div>
        </div>
      </section>

      {props.saved ? (
        <section className="fsx-card" style={{ borderColor: "#16a34a", marginBottom: 4 }}>
          <strong>Saved.</strong> main.tex has been updated.
        </section>
      ) : null}

      {texAdvice ? (
        <section className="fsx-card" style={{ borderColor: "#f59e0b", marginBottom: 4 }}>
          <strong>TeX advice.</strong> {texAdvice}
        </section>
      ) : null}

      {saveError ? (
        <section className="fsx-card" style={{ borderColor: "#dc2626", marginBottom: 4 }}>
          <strong>Save error.</strong> {saveError}
        </section>
      ) : null}

      {compileError ? (
        <section className="fsx-card" style={{ borderColor: "#dc2626", marginBottom: 4 }}>
          <strong>{compileErrorTitle}</strong> {compileError}
        </section>
      ) : null}

      <div
        ref={gridRef}
        style={{
          display: "grid",
          gridTemplateColumns: `${leftWidth}px 2px minmax(0, 1fr) 2px ${rightWidth}px`,
          gap: 1,
          alignItems: "stretch",
          width: "100%",
          minWidth: 0,
        }}
      >
        <aside
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 1,
              minHeight: 0,
              alignSelf: "stretch",
            }}
          >
          <section
              className="fsx-panel fsx-explorer-panel"
              style={{
                padding: 6,
                order: 3,
                flex: "1 1 0",
                minHeight: 120,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
            <div className="fsx-panel-head" style={{ marginBottom: 6 }}>
              <div>
                <h2 className="fsx-panel-title">Explorer</h2>
                <p className="fsx-panel-note">Project files / click text files to open</p>
              </div>
            </div>

              {props.canEdit ? (
                <div style={{ marginBottom: 6 }}>
                  <ProjectUploadClient projectId={String(props.projectId)} />
                </div>
              ) : null}


            {props.files.length === 0 ? (
              <div className="fsx-empty-box">No files found.</div>
            ) : (
              <div className="fsx-explorer-tree" role="tree" aria-label="Project files"
                  style={{
                    flex: "1 1 auto",
                    minHeight: 0,
                    overflowY: "auto",
                    overflowX: "hidden",
                    maxHeight: "none",
                  }}>
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

          <div
              role="separator"
              aria-label="Resize Outline and Explorer"
              title="Drag to resize Outline / Explorer"
              onPointerDown={startResizeOutlineExplorer}
              style={{
                order: 2,
                flex: "0 0 12px",
                height: 12,
                cursor: "row-resize",
                touchAction: "none",
                borderRadius: 999,
                background: "#64748b",
              }}
            />

            <section
              className="fsx-panel fsx-outline-panel"
              style={{
                padding: 6,
                order: 1,
                flex: `0 0 ${leftOutlineHeight}px`,
                minHeight: 120,
                maxHeight: 700,
                overflow: "auto",
              }}
            >
            <div className="fsx-panel-head" style={{ marginBottom: 6 }}>
              <div>
                <h2 className="fsx-panel-title">Outline</h2>
                <button
                  type="button"
                  className={showParagraphInOutline ? "fsx-button fsx-button-primary" : "fsx-button"}
                  onClick={() => setShowParagraphInOutline((value) => !value)}
                  title="Show or hide paragraph entries in the outline."
                  style={{
                    padding: "2px 7px",
                    fontSize: 11,
                    lineHeight: 1,
                    marginTop: 4,
                    whiteSpace: "nowrap",
                  }}
                >
                  Paragraph {showParagraphInOutline ? "On" : "Off"}
                </button>
              </div>
            </div>

            {visibleOutline.length === 0 ? (
              <div className="fsx-empty-box">No outline items.</div>
            ) : (
              <div className="fsx-outline-tree" role="tree" aria-label="Document outline">
                {visibleOutline.map((item, index) => (
                  <button
                    key={`${item.level}-${item.line}-${index}`}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => goToLine(item.line)}
                    className={
                      item.level === "paragraph"
                        ? "fsx-outline-row fsx-outline-row-paragraph"
                        : item.level === "subsubsection"
                          ? "fsx-outline-row fsx-outline-row-subsubsection"
                          : item.level === "subsection"
                            ? "fsx-outline-row fsx-outline-row-subsection"
                            : "fsx-outline-row"
                    }
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
          onPointerDown={(event) => startResizePane("left", event)}
          style={{
            cursor: "col-resize",
            touchAction: "none",
            width: 22,
            marginLeft: -8,
            marginRight: -8,
            justifySelf: "center",
            position: "relative",
            zIndex: 5,
            alignSelf: "stretch",
            borderRadius: 999,
            background: "linear-gradient(90deg, transparent, #cbd5e1, transparent)",
            minHeight: 400,
          }}
        />

        <section style={{ display: "grid", gap: 1, minWidth: 0, overflow: "hidden" }}>
          <section className="fsx-panel" style={{ padding: "2px 6px" }}>
            <div className="fsx-panel-head" style={{ marginBottom: 1 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 6,
                  flexWrap: "wrap",
                }}
              >
                <h2 className="fsx-panel-title" style={{ margin: 0, lineHeight: 1.05 }}>
                  {currentFileDisplayName}
                </h2>
                <p className="fsx-panel-note" style={{ margin: 0, lineHeight: 1.05 }}>
                  Role: <strong>{props.roleLabel}</strong>
                  {" / "}
                  Mode: <strong>{props.canEdit ? "editable" : "viewer only"}</strong>
                  {" / "}
                  File: <strong>{currentFileCanBeSaved ? "editable" : "read-only"}</strong>
                </p>

                {liveCompiled ? (
                  <span className="fsx-inline-compile-ok">
                    Compiled. PDF was generated successfully{liveEngine ? ` by ${liveEngine}` : ""}.
                  </span>
                ) : null}
              </div>
            </div>

            {props.fileMessage ? (
              <div className="fsx-empty-box">{props.fileMessage}</div>
            ) : (
              <>
                <form id={`save-form-${props.projectId}`} action={`/api/projects/${props.projectId}/files/save`} method="post" style={{ margin: 0 }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "30px minmax(0, 1fr)",
                      width: editorBodyWidth,
                      maxWidth: "100%",
                      height: `${editorHeight}px`,
                      minHeight: 120,
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
                        padding: "4px 3px 4px 2px",
                        borderRight: "1px solid #e5e7eb",
                        background: "#f8fafc",
                        color: "#94a3b8",
                        textAlign: "right",
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                        fontSize: lineNumberFontSize,
                        lineHeight: `${editorLineHeightPx}px`,
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
                        padding: 4,
                        border: "none",
                        outline: "none",
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                        fontSize: editorFontSize,
                        lineHeight: `${editorLineHeightPx}px`,
                        whiteSpace: softWrap ? "pre-wrap" : "pre",
                        overflowX: softWrap ? "hidden" : "auto",
                        overflowY: "auto",
                        boxSizing: "border-box",
                        background: editorTextareaBackgroundColor,
                        color: editorTextColor,
                        caretColor: editorCaretColor,
                      }}
                    />
                  </div>

                </form>

                <form
                  id={`compile-form-${props.projectId}`}
                  action={`/api/projects/${props.projectId}/compile`}
                  method="post"
                  style={{ display: "none" }}
                >
                  <input type="hidden" name="rootFile" value={currentFilePath} />
                </form>
              </>
            )}
          </section>

          <div
            role="separator"
            aria-label="Resize TeX editor"
            title="Drag to resize TeX editor"
            onPointerDown={startResizeEditorHeight}
            style={{
              cursor: "row-resize",
              touchAction: "none",
              position: "relative",
              zIndex: 5,
              height: 22,
              borderRadius: 999,
              background: "linear-gradient(180deg, transparent, #cbd5e1, transparent)",
              margin: "-10px 1px",
            }}
          />

        </section>

        <div
          role="separator"
          aria-label="Resize PDF preview"
          title="Drag to resize PDF preview"
          onPointerDown={startResizePdfPreview}
          style={{
            cursor: "col-resize",
            touchAction: "none",
            width: 22,
            marginLeft: -8,
            marginRight: -8,
            justifySelf: "center",
            position: "relative",
            zIndex: 5,
            alignSelf: "stretch",
            borderRadius: 999,
            background: "linear-gradient(90deg, transparent, #cbd5e1, transparent)",
            minHeight: 400,
          }}
        />

        <aside style={{ display: "grid", gap: 1, minWidth: 0 }}>
            <section className="fsx-panel" style={{ padding: 1, position: "sticky", top: 1 }}>

              {rightPaneTab === "pdf" ? (
                <PdfPreviewClient
                  toolbarPrefix={
                    <div
                      role="tablist"
                      aria-label="Right pane tabs"
                      style={{ display: "flex", alignItems: "center", gap: 4 }}
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={true}
                        className="fsx-button fsx-button-primary"
                        onClick={() => setRightPaneTab("pdf")}
                        style={{ padding: "5px 10px", fontSize: 12 }}
                      >
                        PDF
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={false}
                        className="fsx-button"
                        onClick={() => setRightPaneTab("terminal")}
                        style={{ padding: "5px 10px", fontSize: 12 }}
                      >
                        Terminal
                      </button>
                    </div>
                  }
                  projectId={props.projectId}
                  pdfExists={livePdfExists}
                  refreshKey={pdfRefreshKey}
                  pdfFile={currentPdfFile}
                />
              ) : (
          <section ref={compileTerminalPanelRef} className="fsx-panel" style={{ padding: 6 }}>
            <div className="fsx-panel-head" style={{ marginBottom: 4 }}>
              <div
                role="tablist"
                aria-label="Right pane tabs terminal"
                style={{ display: "flex", alignItems: "center", gap: 4, marginRight: 6 }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={false}
                  className="fsx-button"
                  onClick={() => setRightPaneTab("pdf")}
                  style={{ padding: "5px 10px", fontSize: 12 }}
                >
                  PDF
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={true}
                  className="fsx-button fsx-button-primary"
                  onClick={() => setRightPaneTab("terminal")}
                  style={{ padding: "5px 10px", fontSize: 12 }}
                >
                  Terminal
                </button>
              </div>
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
                  <button
                    type="button"
                    className="fsx-button"
                    onClick={copyAiPromptForCompileError}
                    style={{ padding: "6px 10px", fontSize: 12 }}
                  >
                    Copy AI prompt
                  </button>
                </div>
              ) : null}
            </div>

            {liveCompileErrorSummary ? (
              <div
                style={{
                  marginTop: 4,
                  marginBottom: 4,
                  border: "1px solid #fca5a5",
                  background: "#fff7ed",
                  color: "#7f1d1d",
                  borderRadius: 16,
                  padding: 6,
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
                  marginTop: 4,
                  background: "#0f172a",
                  color: "#e5e7eb",
                  borderRadius: 16,
                  padding: 6,
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
              )}
            </section>
        </aside>

      </div>
    </main>
  );
}
