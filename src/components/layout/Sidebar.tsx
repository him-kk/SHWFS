import { Link, useLocation } from "react-router";
import {
  LayoutDashboard,
  Play,
  BarChart3,
  Settings,
  History,
  Microscope,
  BookOpen,
  Code2,
} from "lucide-react";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/process", label: "Processing", icon: Play },
  { path: "/results", label: "Results", icon: BarChart3 },
  { path: "/history", label: "History", icon: History },
  { path: "/calibration", label: "Calibration", icon: Microscope },
  { path: "/docs", label: "Documentation", icon: BookOpen },
  { path: "/code", label: "Source Code", icon: Code2 },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <aside className="w-64 min-h-screen bg-gradient-to-b from-white via-[hsl(30,30%,98%)] to-[hsl(30,25%,96%)] border-r border-[hsl(30,15%,90%)] flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-[hsl(30,15%,90%)]">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[hsl(25,75%,47%)] to-[hsl(20,80%,50%)] flex items-center justify-center shadow-sm">
            <Microscope className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-foreground">AO-Pro</h1>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Adaptive Optics</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`
                flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium
                transition-all duration-200
                ${isActive 
                  ? "bg-gradient-to-r from-[hsl(25,85%,55%)]/10 to-[hsl(20,80%,50%)]/5 text-[hsl(25,75%,40%)]" 
                  : "text-muted-foreground hover:text-foreground hover:bg-[hsl(30,15%,94%)]"
                }
              `}
            >
              <Icon className={`w-4.5 h-4.5 ${isActive ? "text-[hsl(25,75%,47%)]" : ""}`} />
              {item.label}
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[hsl(25,75%,47%)]" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-[hsl(30,15%,90%)]">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-2 h-2 rounded-full bg-[hsl(150,60%,45%)] animate-pulse" />
          <span>System Online</span>
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-1">v1.0.0 - TRL 8-9</p>
      </div>
    </aside>
  );
}
