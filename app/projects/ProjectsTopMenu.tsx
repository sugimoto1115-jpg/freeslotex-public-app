"use client";

const editorMenuItems = [
  "File",
  "Edit & Search",
  "View",
  "TeX Insert",
  "Math",
  "Compile",
  "Help",
];

export default function ProjectsTopMenu() {
  return (
    <nav className="fsx-editor-menubar" aria-label="FreeSloTeX editor menu">
      {editorMenuItems.map((item) => (
        <span key={item} className="fsx-editor-menuitem">
          {item}
        </span>
      ))}
    </nav>
  );
}
