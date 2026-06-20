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

type MenuPosition = {
  top: number;
  left: number;
};

export default function ProjectsTopMenu() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({ top: 42, left: 180 });
  const menuRootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (openMenu === null) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && menuRootRef.current?.contains(target)) return;
      setOpenMenu(null);
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
              onClick={() => setOpenMenu(null)}
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
