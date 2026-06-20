import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";

const editorMenuItems = [
  "File",
  "Edit & Search",
  "View",
  "TeX Insert",
  "Math",
  "Compile",
  "Help",
];

export default async function ProjectsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="fsx-shell">
      <header className="fsx-topbar">
        <div className="fsx-topbar-inner">
          <div className="fsx-topbar-left">
            <div className="fsx-brand">FreeSloTeX</div>

            <nav className="fsx-editor-menubar" aria-label="FreeSloTeX editor menu">
              {editorMenuItems.map((item) => (
                <span key={item} className="fsx-editor-menuitem">
                  {item}
                </span>
              ))}
            </nav>
          </div>

          <div className="fsx-topbar-account">
            <div className="fsx-user">{user.displayName || user.email}</div>

            <form action="/api/logout" method="post">
              <button type="submit" className="fsx-button">
                Logout
              </button>
            </form>
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
