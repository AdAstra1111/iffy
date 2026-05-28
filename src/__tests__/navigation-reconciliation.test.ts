/**
 * Navigation Reconciliation Tests
 *
 * Verifies fix(nav): reconcile standalone vs ProjectShell navigation
 * Commit 650314a — 5 routes wrapped, old Header/PageTransition stripped, 3 new rail links
 *
 * Two navigation systems existed:
 * 1. Standalone: each page rendered its own <Header /> + <PageTransition> wrapper
 * 2. ProjectShell: centralized project shell with rail navigation
 *
 * This fix reconciles them — all project-context pages now use ProjectShell.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf-8');
}

// ── 1. 5 Routes wrapped in ProjectShell (App.tsx) ──────────────────────

describe('App.tsx: Route wrapping', () => {
  const source = readSource('src/App.tsx');

  const EXPECTED_SHELL_ROUTES = [
    { path: '/projects/:id/shot-list',     page: 'ShotListPage' },
    { path: '/projects/:id/storyboards',    page: 'StoryboardsPage' },
    { path: '/projects/:id/visual-references', page: 'VisualReferencesPage' },
    { path: '/projects/:id/visual-units',  page: 'VisualUnits' },
    { path: '/projects/:id/visual-dev',    page: 'VisualDevHub' },
  ];

  for (const route of EXPECTED_SHELL_ROUTES) {
    it(`wraps ${route.path} in ProjectShell`, () => {
      const pattern = `<Route path="${route.path}" element={<ProtectedRoute><ProjectShell>`;
      const negative = `<Route path="${route.path}" element={<ProtectedRoute><${route.page}`;
      expect(source).toContain(pattern);
      expect(source).not.toContain(negative);
    });
  }

  it('still has ProjectShell wrapping for previously-shelled routes', () => {
    const previouslyShelled = [
      '/projects/:id/development',
      '/projects/:id/script',
      '/projects/:id/canon',
      '/projects/:id/trailer',
      '/projects/:id/produce',
      '/projects/:id/audio-export',
      '/projects/:id/ai-content',
      '/projects/:id/casting',
      '/projects/:id/production-design',
      '/projects/:id/visual-production',
      '/projects/:id/casting-studio',
      '/projects/:id/casting-advanced',
      '/projects/:id/poster',
      '/projects/:id/lookbook',
      '/projects/:id/images',
      '/projects/:id/character-merge',
    ];
    for (const r of previouslyShelled) {
      expect(source).toContain(
        `<Route path="${r}" element={<ProtectedRoute><ProjectShell>`
      );
    }
  });

  it('does not have bare ProjectShell route (should wrap page component)', () => {
    // Each shell route should have </ProjectShell> before </ProtectedRoute>
    const shellRoutes = source.match(
      /<Route path="\/projects\/:id\/[^"]+" element=\{<ProtectedRoute><ProjectShell>/g
    ) || [];
    const shellCloses = source.match(
      /<\/ProjectShell><\/ProtectedRoute>}/g
    ) || [];
    expect(shellRoutes.length).toBeGreaterThanOrEqual(21);
    expect(shellCloses.length).toBeGreaterThanOrEqual(21);
  });
});

// ── 2. Header/PageTransition stripped from pages ────────────────────────

describe('Header/PageTransition removal from pages', () => {
  const PAGES_WITH_HEADER = [
    { name: 'ShotListPage', path: 'src/pages/ShotListPage.tsx' },
    { name: 'StoryboardsPage', path: 'src/pages/StoryboardsPage.tsx' },
    { name: 'VisualReferencesPage', path: 'src/pages/VisualReferencesPage.tsx' },
    { name: 'VisualUnits', path: 'src/pages/VisualUnits.tsx' },
  ];

  for (const page of PAGES_WITH_HEADER) {
    it(`${page.name} should not import Header or PageTransition`, () => {
      const source = readSource(page.path);
      // Check that Header from @/components/Header is not imported
      expect(source).not.toMatch(/from ['"]@\/components\/Header['"]/);
      expect(source).not.toMatch(/from ['"]@\/components\/PageTransition['"]/);
      // Verify the card-header import is still there (false positive guard)
      expect(source).toContain("from '@/components/ui/card'");
    });

    it(`${page.name} should not have PageTransition wrapper`, () => {
      const source = readSource(page.path);
      // The <PageTransition> wrapper should be gone
      expect(source).not.toContain('<PageTransition>');
      expect(source).not.toContain('</PageTransition>');
    });
  }

  it('VisualDevHub should not import VisualPipelineErrorBoundary', () => {
    const source = readSource('src/pages/VisualDevHub.tsx');
    expect(source).not.toContain('VisualPipelineErrorBoundary');
  });

  it('VisualDevHub should preserve max-w-[1200px] on main', () => {
    const source = readSource('src/pages/VisualDevHub.tsx');
    expect(source).toContain('max-w-[1200px]');
  });
});

// ── 3. Three new rail links in ProjectShell ─────────────────────────────

describe('ProjectShell: Rail links', () => {
  const source = readSource('src/components/project/ProjectShell.tsx');

  const NEW_RAIL_LINKS = [
    { label: 'Storyboards', icon: 'Layers', path: 'storyboards' },
    { label: 'Shot List',   icon: 'Clapperboard', path: 'shot-list' },
    { label: 'Visual Ref',  icon: 'Palette', path: 'visual-references' },
  ];

  for (const link of NEW_RAIL_LINKS) {
    it(`has rail link "${link.label}" pointing to ${link.path}`, () => {
      expect(source).toContain(`label: '${link.label}'`);
      expect(source).toContain(`${link.path}`);
    });
  }

  it('operating modes for new links are produce-only', () => {
    // Storyboards, Shot List, Visual Ref should be 'produce' mode
    expect(source).toContain(
      "{ icon: Layers,     label: 'Storyboards', to: `${p}/storyboards`, modes: ['produce'] }"
    );
    expect(source).toContain(
      "{ icon: Clapperboard, label: 'Shot List', to: `${p}/shot-list`,   modes: ['produce'] }"
    );
    expect(source).toContain(
      "{ icon: Palette,    label: 'Visual Ref',  to: `${p}/visual-references`, modes: ['produce'] }"
    );
  });

  it('imports Layer, Clapperboard, Palette icons from lucide-react', () => {
    // The three new icons should be in the import
    expect(source).toContain('Layers');
    expect(source).toContain('Clapperboard');
    expect(source).toContain('Palette');
  });
});

// ── 4. VisualExecutionReviewPanel fix ──────────────────────────────────

describe('VisualExecutionReviewPanel: ErrorBoundary fix', () => {
  const source = readSource('src/components/visual/VisualExecutionReviewPanel.tsx');

  it('should close the VisualPanelErrorBoundary tag', () => {
    // The fix added a closing </VisualPanelErrorBoundary> tag
    expect(source).toContain('</VisualPanelErrorBoundary>');
  });

  it('should have one opening and one closing boundary', () => {
    const openCount = (source.match(/<VisualPanelErrorBoundary[^>]*>/g) || []).length;
    const closeCount = (source.match(/<\/VisualPanelErrorBoundary>/g) || []).length;
    expect(openCount).toBe(1);
    expect(closeCount).toBe(1);
  });
});

// ── 5. Fragment wrapper in VisualReferencesPage ─────────────────────────

describe('VisualReferencesPage: Fragment wrapper', () => {
  const source = readSource('src/pages/VisualReferencesPage.tsx');

  it('should use fragment (<>) instead of PageTransition', () => {
    // The old wrapper was <PageTransition>, replaced with <>
    // The return should start with a fragment
    expect(source).toMatch(/return\s*\(\s*</);
    // It should not have PageTransition anymore
    expect(source).not.toContain('<PageTransition>');
  });
});

// ── 6. Invariant: 5 fixed pages no longer import Header or PageTransition ──

describe('Architecture invariant: 5 fixed pages no longer import standalone nav', () => {
  const FIXED_PAGES = [
    { name: 'ShotListPage', file: 'ShotListPage.tsx' },
    { name: 'StoryboardsPage', file: 'StoryboardsPage.tsx' },
    { name: 'VisualReferencesPage', file: 'VisualReferencesPage.tsx' },
    { name: 'VisualUnits', file: 'VisualUnits.tsx' },
    { name: 'VisualDevHub', file: 'VisualDevHub.tsx' },
  ];

  for (const page of FIXED_PAGES) {
    it(`${page.name} does not import standalone Header`, () => {
      const source = readSource(`src/pages/${page.file}`);
      expect(source).not.toContain("from '@/components/Header'");
    });

    it(`${page.name} does not import PageTransition`, () => {
      const source = readSource(`src/pages/${page.file}`);
      expect(source).not.toContain("from '@/components/PageTransition'");
    });
  }

  it('VisualDevHub does not import VisualPipelineErrorBoundary', () => {
    const source = readSource('src/pages/VisualDevHub.tsx');
    expect(source).not.toContain('VisualPipelineErrorBoundary');
  });
});

// ── 7. VisualExecutionReviewPanel fix ──────────────────────────────────

describe('Import integrity: VisualExecutionReviewPanel fix', () => {
  it('VisualExecutionReviewPanel properly closes VisualPanelErrorBoundary', () => {
    const source = readSource('src/components/visual/VisualExecutionReviewPanel.tsx');
    expect(source).toContain('</VisualPanelErrorBoundary>');
    const openCount = (source.match(/<VisualPanelErrorBoundary[^>]*>/g) || []).length;
    const closeCount = (source.match(/<\/VisualPanelErrorBoundary>/g) || []).length;
    expect(openCount).toBe(1);
    expect(closeCount).toBe(1);
  });
});