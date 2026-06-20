"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

const editorMenuItems = [
  "File",
  "Edit & Search",
  "View",
  "TeX Insert",
  "Math",
  "Compile",
  "Help",
];

const texInsertMenuItems = [
  "数式モード",
  "分数・根号・添字",
  "ギリシャ文字",
  "数学関数",
  "和・積分記号等",
  "cases / matrix",
  "figure / table",
  "theorem / proof",
  "日本語 TeX preamble",
];

const mathModeMenuItems = [
  {
    label: "文中に挿入 / $...$",
    snippet: "$%%CURSOR%%$",
  },
  {
    label: "1行出力 / \\[...\\]",
    snippet: "\\\[\n%%CURSOR%%\n\\\]",
  },
  {
    label: "1行出力番号付き / equation 環境",
    snippet: "\\begin{equation}\n%%CURSOR%%\n\\end{equation}",
  },
  {
    label: "複数行番号なし / align* 環境",
    snippet: "\\begin{align*}\n%%CURSOR%%\n\\end{align*}",
  },
  {
    label: "複数行番号付き / align 環境",
    snippet: "\\begin{align}\n%%CURSOR%%\n\\end{align}",
  },
];

const fracRootSubscriptMenuItems = [
  {
    label: "分数 / \\frac{}{}",
    snippet: "\\frac{%%CURSOR%%}{}",
  },
  {
    label: "平方根 / \\sqrt{}",
    snippet: "\\sqrt{%%CURSOR%%}",
  },
  {
    label: "n 乗根 / \\sqrt[]{}",
    snippet: "\\sqrt[]{%%CURSOR%%}",
  },
  {
    label: "下付き / _{}",
    snippet: "_{%%CURSOR%%}",
  },
  {
    label: "上付き / ^{}",
    snippet: "^{%%CURSOR%%}",
  },
  {
    label: "上下付き / _{}^{}",
    snippet: "_{%%CURSOR%%}^{}",
  },
];

const greekMenuItems = [
  { label: "α  \\alpha", snippet: "\\alpha" },
  { label: "β  \\beta", snippet: "\\beta" },
  { label: "γ  \\gamma", snippet: "\\gamma" },
  { label: "δ  \\delta", snippet: "\\delta" },
  { label: "ε  \\epsilon", snippet: "\\epsilon" },
  { label: "ε  \\varepsilon", snippet: "\\varepsilon" },
  { label: "ζ  \\zeta", snippet: "\\zeta" },
  { label: "η  \\eta", snippet: "\\eta" },
  { label: "θ  \\theta", snippet: "\\theta" },
  { label: "ϑ  \\vartheta", snippet: "\\vartheta" },
  { label: "ι  \\iota", snippet: "\\iota" },
  { label: "κ  \\kappa", snippet: "\\kappa" },
  { label: "λ  \\lambda", snippet: "\\lambda" },
  { label: "μ  \\mu", snippet: "\\mu" },
  { label: "ν  \\nu", snippet: "\\nu" },
  { label: "ξ  \\xi", snippet: "\\xi" },
  { label: "ο  o", snippet: "o" },
  { label: "π  \\pi", snippet: "\\pi" },
  { label: "ϖ  \\varpi", snippet: "\\varpi" },
  { label: "ρ  \\rho", snippet: "\\rho" },
  { label: "ϱ  \\varrho", snippet: "\\varrho" },
  { label: "σ  \\sigma", snippet: "\\sigma" },
  { label: "ς  \\varsigma", snippet: "\\varsigma" },
  { label: "τ  \\tau", snippet: "\\tau" },
  { label: "υ  \\upsilon", snippet: "\\upsilon" },
  { label: "φ  \\phi", snippet: "\\phi" },
  { label: "φ  \\varphi", snippet: "\\varphi" },
  { label: "χ  \\chi", snippet: "\\chi" },
  { label: "ψ  \\psi", snippet: "\\psi" },
  { label: "ω  \\omega", snippet: "\\omega" },
  { label: "Γ  \\Gamma", snippet: "\\Gamma" },
  { label: "Δ  \\Delta", snippet: "\\Delta" },
  { label: "Θ  \\Theta", snippet: "\\Theta" },
  { label: "Λ  \\Lambda", snippet: "\\Lambda" },
  { label: "Ξ  \\Xi", snippet: "\\Xi" },
  { label: "Π  \\Pi", snippet: "\\Pi" },
  { label: "Σ  \\Sigma", snippet: "\\Sigma" },
  { label: "Υ  \\Upsilon", snippet: "\\Upsilon" },
  { label: "Φ  \\Phi", snippet: "\\Phi" },
  { label: "Ψ  \\Psi", snippet: "\\Psi" },
  { label: "Ω  \\Omega", snippet: "\\Omega" },
];

const mathFunctionMenuItems = [
  { label: "arccos  \\arccos", snippet: "\\arccos %%CURSOR%%" },
  { label: "arcsin  \\arcsin", snippet: "\\arcsin %%CURSOR%%" },
  { label: "arctan  \\arctan", snippet: "\\arctan %%CURSOR%%" },
  { label: "arg  \\arg", snippet: "\\arg %%CURSOR%%" },
  { label: "cos  \\cos", snippet: "\\cos %%CURSOR%%" },
  { label: "cosh  \\cosh", snippet: "\\cosh %%CURSOR%%" },
  { label: "cot  \\cot", snippet: "\\cot %%CURSOR%%" },
  { label: "coth  \\coth", snippet: "\\coth %%CURSOR%%" },
  { label: "csc  \\csc", snippet: "\\csc %%CURSOR%%" },
  { label: "deg  \\deg", snippet: "\\deg %%CURSOR%%" },
  { label: "det  \\det", snippet: "\\det %%CURSOR%%" },
  { label: "dim  \\dim", snippet: "\\dim %%CURSOR%%" },
  { label: "exp  \\exp", snippet: "\\exp %%CURSOR%%" },
  { label: "gcd  \\gcd", snippet: "\\gcd %%CURSOR%%" },
  { label: "hom  \\hom", snippet: "\\hom %%CURSOR%%" },
  { label: "inf  \\inf", snippet: "\\inf %%CURSOR%%" },
  { label: "ker  \\ker", snippet: "\\ker %%CURSOR%%" },
  { label: "lg  \\lg", snippet: "\\lg %%CURSOR%%" },
  { label: "lim  \\lim", snippet: "\\lim %%CURSOR%%" },
  { label: "liminf  \\liminf", snippet: "\\liminf %%CURSOR%%" },
  { label: "limsup  \\limsup", snippet: "\\limsup %%CURSOR%%" },
  { label: "ln  \\ln", snippet: "\\ln %%CURSOR%%" },
  { label: "log  \\log", snippet: "\\log %%CURSOR%%" },
  { label: "max  \\max", snippet: "\\max %%CURSOR%%" },
  { label: "min  \\min", snippet: "\\min %%CURSOR%%" },
  { label: "Pr  \\Pr", snippet: "\\Pr %%CURSOR%%" },
  { label: "sec  \\sec", snippet: "\\sec %%CURSOR%%" },
  { label: "sin  \\sin", snippet: "\\sin %%CURSOR%%" },
  { label: "sinh  \\sinh", snippet: "\\sinh %%CURSOR%%" },
  { label: "sup  \\sup", snippet: "\\sup %%CURSOR%%" },
  { label: "tan  \\tan", snippet: "\\tan %%CURSOR%%" },
  { label: "tanh  \\tanh", snippet: "\\tanh %%CURSOR%%" },
];

const sumIntegralMenuItems = [
  { label: "∫  \\int", snippet: "\\int %%CURSOR%%" },
  { label: "∮  \\oint", snippet: "\\oint %%CURSOR%%" },
  { label: "∑  \\sum", snippet: "\\sum %%CURSOR%%" },
  { label: "∏  \\prod", snippet: "\\prod %%CURSOR%%" },
  { label: "∐  \\coprod", snippet: "\\coprod %%CURSOR%%" },
  { label: "⋂  \\bigcap", snippet: "\\bigcap %%CURSOR%%" },
  { label: "⋃  \\bigcup", snippet: "\\bigcup %%CURSOR%%" },
  { label: "⋀  \\bigwedge", snippet: "\\bigwedge %%CURSOR%%" },
  { label: "⋁  \\bigvee", snippet: "\\bigvee %%CURSOR%%" },
];

const INSERT_SNIPPET_EVENT = "freeslotex:insert-snippet";

type MenuPosition = {
  top: number;
  left: number;
};

export default function ProjectsTopMenu() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({ top: 42, left: 180 });
  const [submenuPosition, setSubmenuPosition] = useState<MenuPosition>({ top: 42, left: 420 });
  const menuRootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (openMenu === null) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && menuRootRef.current?.contains(target)) return;
      setOpenMenu(null);
      setActiveSubmenu(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenu(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenu]);

  function handleMenuClick(item: string, event: MouseEvent<HTMLButtonElement>) {
    if (item !== "TeX Insert") {
      setOpenMenu(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setMenuPosition({
      top: rect.bottom + 6,
      left: rect.left,
    });

    setActiveSubmenu(null);
    setOpenMenu((current) => (current === item ? null : item));
  }

  return (
    <nav ref={menuRootRef} className="fsx-editor-menubar" aria-label="FreeSloTeX editor menu">
      {editorMenuItems.map((item) => {
        const isTexInsert = item === "TeX Insert";

        return (
          <button
            key={item}
            type="button"
            className="fsx-editor-menuitem"
            onClick={(event) => handleMenuClick(item, event)}
            aria-haspopup={isTexInsert ? "menu" : undefined}
            aria-expanded={isTexInsert ? openMenu === item : undefined}
            style={{
              border: 0,
              background: "transparent",
              font: "inherit",
            }}
          >
            {item}
          </button>
        );
      })}

      {openMenu === "TeX Insert" ? (
        <div
          role="menu"
          aria-label="TeX Insert menu"
          style={{
            position: "fixed",
            top: menuPosition.top,
            left: menuPosition.left,
            zIndex: 2147483647,
            display: "flex",
            minWidth: 220,
            flexDirection: "column",
            gap: 2,
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {texInsertMenuItems.map((label) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              onClick={(event) => {
                if (
                  label === "数式モード" ||
                  label === "分数・根号・添字" ||
                  label === "ギリシャ文字" ||
                  label === "数学関数" ||
                  label === "和・積分記号等"
                ) {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setSubmenuPosition({
                    top: menuPosition.top,
                    left: rect.right + 4,
                  });
                  setActiveSubmenu((current) => (current === label ? null : label));
                  return;
                }

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: label === activeSubmenu ? "#e2e8f0" : "transparent",
                color: label === activeSubmenu ? "#0f172a" : "#334155",
                fontSize: 12,
                fontWeight: label === activeSubmenu ? 700 : 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "TeX Insert" && activeSubmenu === "数式モード" ? (
        <div
          role="menu"
          aria-label="数式モード menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "flex",
            minWidth: 260,
            flexDirection: "column",
            gap: 2,
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {mathModeMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "TeX Insert" && activeSubmenu === "分数・根号・添字" ? (
        <div
          role="menu"
          aria-label="分数・根号・添字 menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "flex",
            minWidth: 230,
            flexDirection: "column",
            gap: 2,
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {fracRootSubscriptMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      {openMenu === "TeX Insert" && activeSubmenu === "ギリシャ文字" ? (
        <div
          role="menu"
          aria-label="ギリシャ文字 menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(110px, 1fr))",
            gap: 2,
            minWidth: 360,
            maxHeight: "min(70vh, 520px)",
            overflowY: "auto",
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {greekMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "TeX Insert" && activeSubmenu === "数学関数" ? (
        <div
          role="menu"
          aria-label="数学関数 menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(120px, 1fr))",
            gap: 2,
            minWidth: 520,
            maxHeight: "min(70vh, 520px)",
            overflowY: "auto",
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {mathFunctionMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "TeX Insert" && activeSubmenu === "和・積分記号等" ? (
        <div
          role="menu"
          aria-label="和・積分記号等 menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(120px, 1fr))",
            gap: 2,
            minWidth: 390,
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {sumIntegralMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

    </nav>
  );
}
