// ── Runtime Binding Store ──
// Durable binding state — per docType binding store with change notification.
// Framework agnostic — no React dependency.

import type { RuntimeBinding, BindingType } from './documentRuntimeBindingTypes';

type BindingListener = (bindings: RuntimeBinding[]) => void;

class RuntimeBindingStoreImpl {
  private bindings: Map<string, RuntimeBinding[]> = new Map();
  private listeners: Map<string, Set<BindingListener>> = new Map();

  /**
   * Set all 4 bindings for a doc type. Notifies listeners if bindings changed.
   */
  setBindings(docType: string, newBindings: RuntimeBinding[]): void {
    const existing = this.bindings.get(docType);
    const changed = this.hasChanged(existing, newBindings);
    this.bindings.set(docType, newBindings);

    if (changed) {
      this.notify(docType, newBindings);
    }
  }

  /**
   * Get all 4 bindings for a doc type.
   */
  getBindings(docType: string): RuntimeBinding[] | null {
    return this.bindings.get(docType) || null;
  }

  /**
   * Get a specific binding type for a doc type.
   */
  getBinding(docType: string, type: BindingType): RuntimeBinding | null {
    const docBindings = this.bindings.get(docType);
    if (!docBindings) return null;
    return docBindings.find(b => b.type === type) || null;
  }

  /**
   * Clear bindings for a doc type (on doc type switch).
   */
  clearBindings(docType: string): void {
    this.bindings.delete(docType);
    this.listeners.delete(docType);
  }

  /**
   * Clear all bindings.
   */
  clearAll(): void {
    this.bindings.clear();
    this.listeners.clear();
  }

  /**
   * Subscribe to binding changes for a doc type.
   * Returns an unsubscribe function.
   */
  subscribe(docType: string, listener: BindingListener): () => void {
    if (!this.listeners.has(docType)) {
      this.listeners.set(docType, new Set());
    }
    this.listeners.get(docType)!.add(listener);

    // Return unsubscribe function
    return () => {
      const set = this.listeners.get(docType);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.listeners.delete(docType);
        }
      }
    };
  }

  /**
   * Log current binding state for debugging.
   */
  logState(docType?: string): void {
    if (docType) {
      const b = this.bindings.get(docType);
      console.info(`[runtimeBindingStore] state for "${docType}":`, b ? JSON.stringify(b, null, 2) : 'no bindings');
    } else {
      console.info(`[runtimeBindingStore] full state (${this.bindings.size} doc types):`);
      for (const [dt, b] of this.bindings.entries()) {
        console.info(`  "${dt}":`, JSON.stringify(b));
      }
    }
  }

  /**
   * Check if two binding arrays are meaningfully different.
   * A binding has "changed" if any of its 4 slots has a different versionId.
   */
  private hasChanged(existing: RuntimeBinding[] | undefined, incoming: RuntimeBinding[]): boolean {
    if (!existing || existing.length !== incoming.length) return true;
    for (const inc of incoming) {
      const ex = existing.find(e => e.type === inc.type);
      if (!ex || ex.versionId !== inc.versionId || ex.source !== inc.source) {
        return true;
      }
    }
    return false;
  }

  /**
   * Notify all listeners for a given doc type.
   */
  private notify(docType: string, bindings: RuntimeBinding[]): void {
    const set = this.listeners.get(docType);
    if (set) {
      for (const listener of set) {
        try {
          listener(bindings);
        } catch (e) {
          console.warn(`[runtimeBindingStore] listener error for "${docType}":`, e);
        }
      }
    }
  }
}

// Singleton instance
export const runtimeBindingStore = new RuntimeBindingStoreImpl();
export type { BindingListener };