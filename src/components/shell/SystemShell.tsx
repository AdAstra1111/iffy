/**
 * SystemShell — minimal, clean sidebar shell for /system/* routes.
 *
 * Different visual contract from PlatformShell:
 *   - No cinematic atmosphere
 *   - Dark but distinct from Visualize workspace
 *   - Technical, dashboard-like sidebar nav
 *   - "Exit System Mode" button returns to main PlatformShell
 */

import { type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Kanban,
  Activity,
  FlaskConical,
  Crosshair,
  BarChart3,
  Shield,
  Box,
  Settings,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SystemShellProps {
  children: ReactNode
}

const NAV_ITEMS = [
  { label: 'Dashboard',     path: '/system',         icon: LayoutDashboard },
  { label: 'Kanban Board',  path: '/system/kanban',   icon: Kanban },
  { label: 'Pipeline',       path: '/system/pipeline', icon: Activity },
  { label: 'Calibration',    path: '/system/calibration', icon: FlaskConical },
  { label: 'Coverage',       path: '/system/coverage',    icon: Crosshair },
  { label: 'Governance',     path: '/system/trend-governance', icon: BarChart3 },
  { label: 'Intel Policies', path: '/system/intel-policies',  icon: Shield },
  { label: 'CI Blueprint',   path: '/system/blueprint',       icon: Box },
  { label: 'Settings',       path: '/system/settings',       icon: Settings },
] as const

export function SystemShell({ children }: SystemShellProps) {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen bg-zinc-950" data-system-shell>
      {/* ── Sidebar ──────────────────────────────────────── */}
      <aside className="w-56 shrink-0 border-r border-zinc-800 bg-zinc-900/80 flex flex-col">
        {/* Brand */}
        <div className="px-4 pt-5 pb-3 border-b border-zinc-800/50">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded border border-zinc-600 flex items-center justify-center">
              <span className="text-[10px] font-mono text-zinc-400">SYS</span>
            </div>
            <span className="text-sm font-semibold text-zinc-200 tracking-wide">
              System
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/system'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs transition-colors',
                  isActive
                    ? 'bg-zinc-800 text-zinc-100 font-medium'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50',
                )
              }
            >
              <item.icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Exit button */}
        <div className="p-3 border-t border-zinc-800/50">
          <button
            onClick={() => navigate('/dashboard')}
            className={cn(
              'flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-xs',
              'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors',
            )}
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Exit System Mode</span>
          </button>
        </div>
      </aside>

      {/* ── Content area ─────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto bg-zinc-950">
        {children}
      </main>
    </div>
  )
}