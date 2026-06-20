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
  "equation / align",
  "cases / matrix",
  "figure / table",
  "theorem / proof",
  "日本語 TeX preamble",
];

const mathModeMenuItems = [
  "文中に挿入 / $...$",
  "1行出力 / \\[...\\]",
  "1行出力番号付き / equation 環境",
  "複数行番号なし / align* 環境",
  "複数行番号付き / align 環境",
];

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
                if (label === "数式モード") {
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
          {mathModeMenuItems.map((label) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              onClick={() => {
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
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
