/**
 * ProductionDesignPanel — Displays Production Design Canon state.
 *
 * Shows:
 * - Location count and template inheritance
 * - Materials, color palette, lighting language per template
 * - Canon source chain: pd_location_design → pd_design_templates → pd_world_rules
 */

import React from 'react'
import { useVisualCanonStatus } from '@/hooks/useVisualCanonStatus'

interface ProductionDesignPanelProps {
  projectId?: string
}

const ProductionDesignPanel: React.FC<ProductionDesignPanelProps> = ({ projectId }) => {
  const { data, isLoading } = useVisualCanonStatus({ projectId })

  if (isLoading) {
    return (
      <div className="p-4 rounded-lg border border-border bg-card animate-pulse">
        <div className="h-4 w-40 bg-muted rounded mb-3" />
        <div className="h-3 w-52 bg-muted rounded" />
      </div>
    )
  }

  const pd = data?.canon_status?.pd
  if (!pd?.locations && !pd?.templates) {
    return (
      <div className="p-4 rounded-lg border border-border bg-card">
        <h4 className="text-sm font-medium mb-2">Production Design Canon</h4>
        <p className="text-xs text-muted-foreground">No production design data available.</p>
      </div>
    )
  }

  return (
    <div className="p-4 rounded-lg border border-border bg-card space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium">Production Design Canon</h4>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-500 font-medium">
          Active
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-lg font-semibold">{pd.locations}</div>
          <div className="text-[10px] text-muted-foreground">Locations</div>
        </div>
        <div>
          <div className="text-lg font-semibold">{pd.templates}</div>
          <div className="text-[10px] text-muted-foreground">Design Templates</div>
        </div>
        <div>
          <div className="text-lg font-semibold">1</div>
          <div className="text-[10px] text-muted-foreground">World Rule Set</div>
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground/60 pt-1 border-t border-border/50">
        Inheritance: Location → Design Template → World Rules
      </div>
    </div>
  )
}

export default ProductionDesignPanel