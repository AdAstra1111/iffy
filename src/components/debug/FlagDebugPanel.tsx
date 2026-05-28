/**
 * FlagDebugPanel — Debug overlay for feature flag toggling.
 *
 * Visible only when NEW_SYSTEM_MODE is true. Shows all 10 flags with
 * toggle buttons that write to localStorage and call notifyFlagChange()
 * to trigger re-render.
 *
 * Safe to import anywhere — the gate check ensures it renders nothing
 * unless the system mode flag is explicitly enabled.
 */
import React from 'react'
import { useFeatureFlag, useFeatureFlags, notifyFlagChange } from '@/hooks/useFeatureFlag'
import { FLAG_NAMES } from '@/config/featureFlags'
import type { FeatureFlags } from '@/config/featureFlags'

const LOCAL_STORAGE_KEY = 'iffy_flags'

/** Human-readable label for a flag key */
function flagLabel(key: keyof FeatureFlags): string {
  const labels: Record<keyof FeatureFlags, string> = {
    NEW_IFFY_SHELL: 'New Shell',
    NEW_WORKSPACE_DEVELOP: 'Develop',
    NEW_WORKSPACE_VISUALIZE: 'Visualize',
    NEW_WORKSPACE_CAST: 'Cast',
    NEW_WORKSPACE_PRODUCE: 'Produce',
    NEW_WORKSPACE_PACKAGE: 'Package',
    NEW_WORKSPACE_DELIVER: 'Deliver',
    NEW_INTELLIGENCE_LAYER: 'Intelligence',
    NEW_EXPERT_MODE: 'Expert Mode',
    NEW_SYSTEM_MODE: 'System Mode',
  }
  return labels[key] ?? key
}

/**
 * Toggle a single flag in localStorage.
 * Reads the existing store, flips the value, writes it back,
 * then notifies subscribers to re-render.
 */
function toggleFlag(name: keyof FeatureFlags): void {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    const store: Partial<Record<keyof FeatureFlags, boolean>> = raw
      ? JSON.parse(raw)
      : {}

    // Flip the flag: if currently true → false, else → true
    store[name] = !store[name]

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(store))
    notifyFlagChange()
  } catch {
    // Silently fail — localStorage might be unavailable
  }
}

/**
 * Reset all flags in localStorage (clear all overrides).
 */
function resetAllFlags(): void {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY)
    notifyFlagChange()
  } catch {
    // Silently fail
  }
}

export function FlagDebugPanel(): React.ReactElement | null {
  const systemMode = useFeatureFlag('NEW_SYSTEM_MODE')
  const allFlags = useFeatureFlags()

  // Don't render unless system mode is explicitly enabled
  if (!systemMode) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        right: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        color: '#e0e0e0',
        fontFamily: 'monospace',
        fontSize: 12,
        padding: 12,
        borderRadius: '8px 0 0 0',
        maxHeight: '60vh',
        overflowY: 'auto',
        minWidth: 220,
        borderTop: '1px solid #444',
        borderLeft: '1px solid #444',
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: 8, fontSize: 13 }}>
        Feature Flags (Debug)
      </div>

      {FLAG_NAMES.map((name) => (
        <div
          key={name}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '3px 0',
            gap: 8,
          }}
        >
          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {flagLabel(name)}
          </span>
          <button
            onClick={() => toggleFlag(name)}
            style={{
              background: allFlags[name] ? '#2e7d32' : '#555',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              padding: '2px 10px',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 'bold',
              minWidth: 50,
            }}
            title={`${name}: ${allFlags[name] ? 'enabled' : 'disabled'}`}
          >
            {allFlags[name] ? 'ON' : 'OFF'}
          </button>
        </div>
      ))}

      <div style={{ marginTop: 8, borderTop: '1px solid #555', paddingTop: 6 }}>
        <button
          onClick={resetAllFlags}
          style={{
            background: '#b71c1c',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            padding: '4px 12px',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 'bold',
            width: '100%',
          }}
        >
          Reset All
        </button>
      </div>
    </div>
  )
}