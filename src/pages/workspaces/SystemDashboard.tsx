/**
 * SystemDashboard — index page for /system/ that lists available admin/diagnostic tools.
 *
 * Clean, technical card layout. No cinematic atmosphere.
 */

import { Link } from 'react-router-dom'
import {
  Kanban,
  Activity,
  FlaskConical,
  Crosshair,
  BarChart3,
  Shield,
  Box,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolCard {
  title: string
  description: string
  path: string
  icon: typeof Kanban
}

const TOOLS: ToolCard[] = [
  {
    title: 'Kanban Board',
    description: 'Visual project pipeline with drag-and-drop stage management',
    path: '/system/kanban',
    icon: Kanban,
  },
  {
    title: 'Pipeline Monitor',
    description: 'Real-time autorun pipeline status, logs, and processing diagnostics',
    path: '/system/pipeline',
    icon: Activity,
  },
  {
    title: 'Calibration Lab',
    description: 'Model calibration, parameter tuning, and evaluation settings',
    path: '/system/calibration',
    icon: FlaskConical,
  },
  {
    title: 'Coverage Lab',
    description: 'Test coverage analysis, gap detection, and quality metrics',
    path: '/system/coverage',
    icon: Crosshair,
  },
  {
    title: 'Trend Governance',
    description: 'Trend data policies, moderation rules, and compliance dashboard',
    path: '/system/trend-governance',
    icon: BarChart3,
  },
  {
    title: 'Intel Policies',
    description: 'Intelligence layer access controls, data retention, and audit trails',
    path: '/system/intel-policies',
    icon: Shield,
  },
  {
    title: 'CI Blueprint',
    description: 'Continuous integration pipeline configuration and deployment blueprints',
    path: '/system/blueprint',
    icon: Box,
  },
  {
    title: 'System Settings',
    description: 'Global configuration, feature flags, user role management',
    path: '/system/settings',
    icon: Settings,
  },
]

export default function SystemDashboard() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">
          System Tools
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Administrative and diagnostic tools for platform management
        </p>
      </div>

      {/* Tool cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TOOLS.map((tool) => (
          <Link
            key={tool.path}
            to={tool.path}
            className={cn(
              'group flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4',
              'hover:border-zinc-700 hover:bg-zinc-900 transition-all duration-150',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600',
            )}
          >
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-md border border-zinc-700/60 bg-zinc-800/50 flex items-center justify-center shrink-0">
                <tool.icon className="h-4 w-4 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
              </div>
              <h3 className="text-sm font-medium text-zinc-200 group-hover:text-zinc-100 transition-colors">
                {tool.title}
              </h3>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              {tool.description}
            </p>
          </Link>
        ))}
      </div>

      {/* Footer hint */}
      <p className="mt-10 text-[10px] text-zinc-700 text-center">
        System mode — administrative interface
      </p>
    </div>
  )
}