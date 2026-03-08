import type { PageId } from "../types";

interface NavItem {
  icon: string;
  label: string;
  pageId: PageId | null;
  disabled: boolean;
}

const navItems: NavItem[] = [
  { icon: "\u25CB", label: "Sessions", pageId: "sessions", disabled: false },
  { icon: "\u25C7", label: "Flows", pageId: null, disabled: true },
  { icon: "\u2630", label: "History", pageId: null, disabled: true },
  { icon: "\u25A1", label: "Projects", pageId: "projects", disabled: false },
  { icon: "\u2699", label: "Settings", pageId: null, disabled: true },
];

interface SidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  sessionCount: number;
}

export function Sidebar({ activePage, onNavigate, sessionCount }: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">Navigation</div>
      <nav className="sidebar-nav">
        <div className="nav-section">
          {navItems.map((item) => (
            <button
              key={item.label}
              className={`nav-item${item.pageId === activePage ? " active" : ""}`}
              disabled={item.disabled}
              onClick={() => item.pageId && onNavigate(item.pageId)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {item.pageId === "sessions" && sessionCount > 0 && (
                <span className="nav-badge">{sessionCount}</span>
              )}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
