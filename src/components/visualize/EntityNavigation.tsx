import React from 'react'

export interface EntityTab {
  type: string
  label: string
  count: number
}

interface EntityNavigationProps {
  tabs: EntityTab[]
  activeTab: string
  onTabChange: (type: string) => void
  isLoading?: boolean
}

const EntityNavigation: React.FC<EntityNavigationProps> = ({
  tabs,
  activeTab,
  onTabChange,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="flex gap-1 p-1 rounded-lg bg-muted/30 mb-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-10 w-24 rounded-md bg-muted/50 animate-pulse"
          />
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-1 p-1 rounded-lg bg-muted/30 mb-4 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.type
        return (
          <button
            key={tab.type}
            onClick={() => onTabChange(tab.type)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
              transition-all duration-150 whitespace-nowrap
              ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }
            `}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className={`
                  inline-flex items-center justify-center min-w-[20px] h-5 px-1.5
                  rounded-full text-xs font-semibold
                  ${
                    isActive
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }
                `}
              >
                {tab.count}
              </span>
            )}
            {tab.count === 0 && !isActive && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs text-muted-foreground/50">
                0
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default EntityNavigation