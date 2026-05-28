import React, { useState } from 'react'
import type { VisualEntity } from '@/lib/adapters/AdapterTypes'

interface EntityDetailPanelProps {
  entity: VisualEntity | null
  isLoading?: boolean
  error?: string | null
  /** Additional metadata about the entity, e.g. description, wardrobe, etc. */
  metadata?: Record<string, unknown>
}

interface SectionProps {
  label: string
  value: string | React.ReactNode
  icon?: React.ReactNode
}

function DetailSection({ label, value, icon }: SectionProps) {
  return (
    <div className="py-2 border-b border-border/30 last:border-b-0">
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          {label}
        </span>
      </div>
      <div className="text-sm text-foreground/80">
        {typeof value === 'string' && !value ? (
          <span className="text-muted-foreground/50 italic">Not set</span>
        ) : (
          value
        )}
      </div>
    </div>
  )
}

function EntityDetailSkeleton() {
  return (
    <div className="space-y-3 animate-pulse p-4">
      <div className="h-5 w-3/4 bg-muted rounded" />
      <div className="h-3 w-1/2 bg-muted rounded" />
      <div className="h-3 w-full bg-muted rounded" />
      <div className="h-3 w-2/3 bg-muted rounded" />
      <div className="h-3 w-4/5 bg-muted rounded" />
    </div>
  )
}

const EntityDetailPanel: React.FC<EntityDetailPanelProps> = ({
  entity,
  isLoading = false,
  error = null,
  metadata = {},
}) => {
  const [collapsed, setCollapsed] = useState(false)

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <EntityDetailSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-destructive text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span>Failed to load entity details.</span>
        </div>
      </div>
    )
  }

  if (!entity) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-col items-center justify-center text-center gap-2">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <svg className="w-5 h-5 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground">Select an entity to view details</p>
        </div>
      </div>
    )
  }

  const isCharacter = entity.type === 'character'
  const description = metadata?.description as string | undefined
  const wardrobeStatus = metadata?.wardrobeStatus as string | undefined
  const expressionCount = metadata?.expressionCount as number | undefined
  const angleCoverage = metadata?.angleCoverage as string | undefined
  const atmosphere = metadata?.atmosphere as string | undefined
  const locationType = metadata?.locationType as string | undefined

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header — clickable to collapse */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isCharacter ? (
            <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
          <span className="font-medium text-sm truncate">
            {entity.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
              entity.status === 'approved'
                ? 'bg-green-500/10 text-green-600'
                : entity.status === 'has_images'
                  ? 'bg-amber-500/10 text-amber-600'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {entity.status === 'approved'
              ? '✓ Approved'
              : entity.status === 'has_images'
                ? 'Has images'
                : 'Empty'}
          </span>
          <svg
            className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
              collapsed ? '' : 'rotate-180'
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </div>
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="px-4 pb-4">
          {isCharacter ? (
            <>
              {description && (
                <DetailSection
                  label="Description"
                  value={description}
                  icon={
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                    </svg>
                  }
                />
              )}
              {wardrobeStatus && (
                <DetailSection
                  label="Wardrobe"
                  value={wardrobeStatus}
                  icon={
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                    </svg>
                  }
                />
              )}
              {expressionCount !== undefined && (
                <DetailSection
                  label="Expressions"
                  value={`${expressionCount} variant(s)`}
                  icon={
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  }
                />
              )}
              {angleCoverage && (
                <DetailSection
                  label="Angle Coverage"
                  value={angleCoverage}
                />
              )}
              {/* Fallback: show role from metadata */}
              {(metadata?.role as string) && (
                <DetailSection label="Role" value={metadata?.role as string} />
              )}
            </>
          ) : (
            <>
              {description && (
                <DetailSection
                  label="Description"
                  value={description}
                />
              )}
              {atmosphere && (
                <DetailSection label="Atmosphere" value={atmosphere} />
              )}
              {locationType && (
                <DetailSection label="Type" value={locationType} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default EntityDetailPanel