interface NavItem {
  icon: string;
  label: string;
  active: boolean;
  disabled: boolean;
}

const navItems: NavItem[] = [
  { icon: "\u25CB", label: "Sessions", active: true, disabled: false },
  { icon: "\u25C7", label: "Flows", active: false, disabled: true },
  { icon: "\u2630", label: "History", active: false, disabled: true },
  { icon: "\u25A1", label: "Projects", active: false, disabled: true },
  { icon: "\u2699", label: "Settings", active: false, disabled: true },
];

export function Sidebar() {
  return (
    <div className="sidebar">
      <div className="sidebar-header">Navigation</div>
      <nav className="sidebar-nav">
        <div className="nav-section">
          {navItems.map((item) => (
            <button
              key={item.label}
              className={`nav-item${item.active ? " active" : ""}`}
              disabled={item.disabled}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
