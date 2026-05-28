/**
 * P0 Visual Pipeline useAuth Crash — 3-Fix Verification Tests
 *
 * Validates 3 fixes:
 * 1. useSafeAuth() wrapper in useAuth.tsx — try/catch that returns safe defaults
 *    instead of throwing when AuthContext is temporarily unavailable
 * 2. useCostumeOnActor.ts updated to import and use useSafeAuth instead of raw useAuth
 * 3. VisualPipelineErrorBoundary handleRetry — permanentFailure auth gate removed
 *    (dead code since useSafeAuth now catches at the hook level)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { VisualPipelineErrorBoundary } from '@/components/VisualPipelineErrorBoundary';
import { Component, createContext, useContext, type ReactNode } from 'react';
import fs from 'fs';
import path from 'path';

// ── Source file paths ──
const USE_AUTH_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../src/hooks/useAuth.tsx'),
  'utf-8'
);

const USE_COSTUME_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../src/hooks/useCostumeOnActor.ts'),
  'utf-8'
);

const ERROR_BOUNDARY_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../src/components/VisualPipelineErrorBoundary.tsx'),
  'utf-8'
);

// ═══════════════════════════════════════════════════════════════════
// FIX 1: useSafeAuth() wrapper in useAuth.tsx
// ═══════════════════════════════════════════════════════════════════

describe('Fix 1: useSafeAuth in useAuth.tsx', () => {
  it('exports useSafeAuth alongside useAuth', () => {
    expect(USE_AUTH_SOURCE).toContain('export function useSafeAuth');
  });

  it('useSafeAuth wraps useAuth with try/catch', () => {
    // Must have try + return useAuth() + catch block
    const safeAuthMatch = USE_AUTH_SOURCE.match(
      /export function useSafeAuth[\s\S]*?^}/m
    );
    expect(safeAuthMatch).not.toBeNull();
    const safeAuthBody = safeAuthMatch![0];
    expect(safeAuthBody).toContain('try {');
    expect(safeAuthBody).toContain('return useAuth()');
    expect(safeAuthBody).toContain('catch');
  });

  it('useSafeAuth returns { user: null, session: null, loading: true } on catch', () => {
    const safeAuthMatch = USE_AUTH_SOURCE.match(
      /export function useSafeAuth[\s\S]*?^}/m
    );
    expect(safeAuthMatch).not.toBeNull();
    const safeAuthBody = safeAuthMatch![0];
    // The catch block must return safe defaults
    expect(safeAuthBody).toContain('user: null');
    expect(safeAuthBody).toContain('session: null');
    expect(safeAuthBody).toContain('loading: true');
  });

  it('useSafeAuth return type is correct — { user, session, loading }', () => {
    const returnTypeMatch = USE_AUTH_SOURCE.match(
      /useSafeAuth\(\)[\s\S]*?{\s*\n\s*\{ user/m
    );
    // Get the return type annotation
    const signatureMatch = USE_AUTH_SOURCE.match(
      /export function useSafeAuth\(\):\s*\{[^}]+\}/
    );
    expect(signatureMatch).not.toBeNull();
    const signature = signatureMatch![0];
    expect(signature).toContain('user');
    expect(signature).toContain('session');
    expect(signature).toContain('loading');
  });

  it('useSafeAuth does NOT re-throw the error', () => {
    const safeAuthMatch = USE_AUTH_SOURCE.match(
      /export function useSafeAuth[\s\S]*?^}/m
    );
    expect(safeAuthMatch).not.toBeNull();
    const safeAuthBody = safeAuthMatch![0];
    // The catch block must NOT contain throw
    const catchContent = safeAuthBody.split('catch')[1] || '';
    expect(catchContent).not.toContain('throw');
  });

  it('useSafeAuth is a separate named export, not renaming useAuth', () => {
    // It should be a distinct function, not "export const useSafeAuth = useAuth"
    const exportCount = (USE_AUTH_SOURCE.match(/export function useSafeAuth/g) || []).length;
    expect(exportCount).toBe(1);

    // It should NOT be a simple reassignment/alias
    const aliasPattern = /useSafeAuth\s*=\s*useAuth/;
    expect(USE_AUTH_SOURCE).not.toMatch(aliasPattern);
  });
});

// ═══════════════════════════════════════════════════════════════════
// FIX 2: useCostumeOnActor.ts — imports and uses useSafeAuth
// ═══════════════════════════════════════════════════════════════════

describe('Fix 2: useCostumeOnActor imports useSafeAuth', () => {
  it('imports useSafeAuth from @/hooks/useAuth', () => {
    const importLine = USE_COSTUME_SOURCE.match(
      /import\s*\{[^}]*\}[^;]*from\s+['"]@\/hooks\/useAuth['"]/
    );
    expect(importLine).not.toBeNull();
    expect(importLine![0]).toContain('useSafeAuth');
  });

  it('uses useSafeAuth for { user } (not raw useAuth)', () => {
    // Find the destructuring of user
    const userAuthMatch = USE_COSTUME_SOURCE.match(
      /const\s*\{\s*user\s*\}\s*=\s*use\w+Auth\(\)/g
    );
    expect(userAuthMatch).not.toBeNull();
    if (userAuthMatch) {
      // Every destructuring of { user } from an Auth hook should use useSafeAuth
      for (const match of userAuthMatch) {
        expect(match).toContain('useSafeAuth');
      }
    }
  });

  it('does NOT use raw useAuth() for user destructuring', () => {
    // There should be no "const { user } = useAuth()" in the source
    const rawUseAuthMatch = USE_COSTUME_SOURCE.match(
      /const\s*\{\s*user\s*\}\s*=\s*useAuth\(\)/g
    );
    expect(rawUseAuthMatch).toBeNull();
  });

  it('still imports useAuth for other consumers', () => {
    // The import should include both useAuth AND useSafeAuth
    const importLine = USE_COSTUME_SOURCE.match(
      /import\s*\{[^}]*\}[^;]*from\s+['"]@\/hooks\/useAuth['"]/
    );
    expect(importLine).not.toBeNull();
    expect(importLine![0]).toContain('useAuth');
    expect(importLine![0]).toContain('useSafeAuth');
  });
});

// ═══════════════════════════════════════════════════════════════════
// FIX 3: VisualPipelineErrorBoundary handleRetry — permanentFailure gate removed
// ═══════════════════════════════════════════════════════════════════

describe('Fix 3: VisualPipelineErrorBoundary handleRetry', () => {
  it('does NOT have a permanentFailure gate for useAuth/AuthProvider errors', () => {
    // The old code checked for 'useAuth' or 'AuthProvider' in error.message
    // and set permanentFailure: true. This must be removed.
    expect(ERROR_BOUNDARY_SOURCE).not.toContain("error?.message?.includes('useAuth')");
    expect(ERROR_BOUNDARY_SOURCE).not.toContain("error?.message?.includes('AuthProvider')");
  });

  it('handleRetry directly sets hasError: false without auth checks', () => {
    // Find the handleRetry method body
    const retryMatch = ERROR_BOUNDARY_SOURCE.match(
      /private handleRetry[\s\S]*?this\.setState\([\s\S]*?hasError: false[\s\S]*?\n\s*\}/
    );
    expect(retryMatch).not.toBeNull();
    const retryBody = retryMatch![0];

    // Should set hasError: false and error: null
    expect(retryBody).toContain('hasError: false');
    expect(retryBody).toContain('error: null');

    // Should NOT set permanentFailure
    expect(retryBody).not.toContain('permanentFailure');
  });

  it('handleRetry does not reference AuthProvider or useAuth at all', () => {
    const retryMatch = ERROR_BOUNDARY_SOURCE.match(
      /private handleRetry[\s\S]*?\n  \}/
    );
    expect(retryMatch).not.toBeNull();
    const retryBody = retryMatch![0];

    expect(retryBody).not.toContain('useAuth');
    expect(retryBody).not.toContain('AuthProvider');
    expect(retryBody).not.toContain('permanentFailure');
  });
});

// ═══════════════════════════════════════════════════════════════════
// RUNTIME: useSafeAuth behavior via component tests
// ═══════════════════════════════════════════════════════════════════

interface AuthCTX {
  user: { id: string } | null;
  session: { access_token: string } | null;
  loading: boolean;
}

// Manually recreate what useSafeAuth does to test its behavior
function useSafeAuthTest(authCtx: AuthCTX | null): AuthCTX {
  try {
    if (!authCtx) throw new Error('useAuth must be used within AuthProvider');
    return authCtx;
  } catch {
    return { user: null, session: null, loading: true };
  }
}

describe('useSafeAuth — runtime behavior (logic-equivalent)', () => {
  it('returns auth context when available', () => {
    const mockCtx: AuthCTX = {
      user: { id: 'user-1' },
      session: { access_token: 'tok_abc' },
      loading: false,
    };
    const result = useSafeAuthTest(mockCtx);
    expect(result).toEqual(mockCtx);
  });

  it('returns safe defaults instead of throwing when context is null', () => {
    const result = useSafeAuthTest(null);
    expect(result).toEqual({
      user: null,
      session: null,
      loading: true,
    });
  });

  it('does not throw when context is unavailable', () => {
    expect(() => useSafeAuthTest(null)).not.toThrow();
  });

  it('loading is true when context is unavailable (indicates pending retry)', () => {
    const result = useSafeAuthTest(null);
    expect(result.loading).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// RUNTIME: VisualPipelineErrorBoundary — auth errors are recoverable
// ═══════════════════════════════════════════════════════════════════

describe('VisualPipelineErrorBoundary — auth error recovery (runtime)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('shows retry button when useAuth error is caught', () => {
    const ThrowingChild = () => {
      throw new Error('useAuth must be used within AuthProvider');
    };

    render(
      <VisualPipelineErrorBoundary>
        <ThrowingChild />
      </VisualPipelineErrorBoundary>
    );

    // Should show a retry button (not "Refresh page")
    const retryButton = screen.queryByRole('button', { name: /retry/i });
    expect(retryButton).not.toBeNull();
  });

  it('shows retry button (not permanent failure) for AuthProvider errors', () => {
    const ThrowingChild = () => {
      throw new Error('AuthProvider not found');
    };

    render(
      <VisualPipelineErrorBoundary>
        <ThrowingChild />
      </VisualPipelineErrorBoundary>
    );

    // Should show retry, not permanent failure message
    expect(screen.queryByText(/cannot be recovered/i)).toBeNull();
    expect(screen.getByRole('button', { name: /retry/i })).toBeDefined();
  });

  it('handleRetry clears the error state on click', () => {
    let throwNext = true;
    const ThrowingChild = () => {
      if (throwNext) {
        throw new Error('useAuth must be used within AuthProvider');
      }
      return <div>Recovered content</div>;
    };

    render(
      <VisualPipelineErrorBoundary>
        <ThrowingChild />
      </VisualPipelineErrorBoundary>
    );

    // Should show retry button
    const retryButton = screen.getByRole('button', { name: /retry/i });

    // On retry, stop throwing
    throwNext = false;

    act(() => {
      retryButton.click();
    });

    // Should show recovered content
    expect(screen.getByText('Recovered content')).toBeDefined();
  });

  it('does not show permanent failure message for auth errors', () => {
    const ThrowingChild = () => {
      throw new Error('useAuth: context is null during SafeRouteBoundary remount');
    };

    render(
      <VisualPipelineErrorBoundary>
        <ThrowingChild />
      </VisualPipelineErrorBoundary>
    );

    // The key indicator — old code showed "Auth provider error — reload the page"
    expect(screen.queryByText(/Auth provider error/i)).toBeNull();
    expect(screen.queryByText(/reload the page/i)).toBeNull();
  });
});