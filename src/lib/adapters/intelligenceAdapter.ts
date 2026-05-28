/**
 * Intelligence Adapter — transforms raw trend/market/project data into 3 insight cards.
 *
 * Pure function layer (no React). Called from IntelligenceOverlay with hydrated data
 * from useTrends, useMarketIntelligence, useIntelDashboard, useReports, etc.
 */
import type { InsightCardData, IntelligenceAdapter } from './AdapterTypes'

// ── Workspace-specific insight generators ──────────────────────────────────

function developInsights(data: NonNullable<Parameters<IntelligenceAdapter['getInsights']>[1]>): InsightCardData[] {
  const { trends = [], project } = data
  const cards: InsightCardData[] = []

  // Signal count insight
  const totalSignals = Array.isArray(trends) ? trends.length : 0
  if (totalSignals > 0) {
    const highStrength = (trends as any[]).filter((s: any) => (s.strength ?? 0) >= 7)
    cards.push({
      id: 'dev-signal-count',
      title: 'Active Story Signals',
      text: `${totalSignals} active trend signals ${project?.format ? `for ${project.format}` : ''}${
        highStrength.length > 0 ? ` — ${highStrength.length} at high strength` : ''
      }.`,
      relevance: Math.min(85, 50 + totalSignals * 2),
      sourceIcon: '📡',
      sourceLabel: 'Trend Signals',
      category: 'trends',
      supportingData: { totalSignals, highStrength: highStrength.length },
    })
  } else {
    cards.push({
      id: 'dev-signal-empty',
      title: 'No Active Signals',
      text: 'No insights available yet. Connect to intelligence services to see relevant trends.',
      relevance: 0,
      sourceIcon: '📡',
      sourceLabel: 'Trend Signals',
      category: 'trends',
    })
  }

  // Genre-relevant insight
  if (project?.genres && project.genres.length > 0 && Array.isArray(trends)) {
    const relevantSignals = (trends as any[]).filter((s: any) =>
      s.genre_tags?.some((g: string) =>
        project.genres!.some((pg: string) =>
          g.toLowerCase().includes(pg.toLowerCase()) || pg.toLowerCase().includes(g.toLowerCase()),
        ),
      ),
    )
    if (relevantSignals.length > 0) {
      cards.push({
        id: 'dev-genre-match',
        title: 'Genre-Aligned Trends',
        text: `${relevantSignals.length} trends align with your project's genres (${project.genres.slice(0, 3).join(', ')}).`,
        relevance: Math.min(95, 60 + relevantSignals.length * 5),
        sourceIcon: '🎯',
        sourceLabel: 'Genre Analysis',
        category: 'trends',
        supportingData: { matchedSignals: relevantSignals.length, genres: project.genres },
      })
    } else {
      cards.push({
        id: 'dev-genre-nomatch',
        title: 'Trend Gap',
        text: 'No trends directly align with your project genres. Consider exploring adjacent categories.',
        relevance: 30,
        sourceIcon: '🎯',
        sourceLabel: 'Genre Analysis',
        category: 'trends',
      })
    }
  } else {
    cards.push({
      id: 'dev-genre-default',
      title: 'Trend Landscape',
      text: `${totalSignals} trend signals available. Set project genres for personalised insights.`,
      relevance: 25,
      sourceIcon: '🎯',
      sourceLabel: 'Trend Landscape',
      category: 'trends',
    })
  }

  // Market pulse insight
  if (data.marketData && Array.isArray(data.marketData) && data.marketData.length > 0) {
    cards.push({
      id: 'dev-market-pulse',
      title: 'Market Pulse',
      text: `${data.marketData.length} market intelligence items available.`,
      relevance: 60,
      sourceIcon: '📊',
      sourceLabel: 'Market',
      category: 'market',
      supportingData: { items: data.marketData.length },
    })
  } else if (cards.length < 3) {
    cards.push({
      id: 'dev-market-default',
      title: 'Market Intelligence',
      text: 'Connect to intelligence services to surface relevant market data.',
      relevance: 20,
      sourceIcon: '📊',
      sourceLabel: 'Market',
      category: 'market',
    })
  }

  return cards.slice(0, 3)
}

function visualizeInsights(data: NonNullable<Parameters<IntelligenceAdapter['getInsights']>[1]>): InsightCardData[] {
  const { marketData = [], trends = [] } = data
  const cards: InsightCardData[] = []

  // Visual market insight
  const totalMarket = Array.isArray(marketData) ? marketData.length : 0
  if (totalMarket > 0) {
    cards.push({
      id: 'vis-market-overview',
      title: 'Visual Market Overview',
      text: `${totalMarket} market data points available for visual intelligence.`,
      relevance: 75,
      sourceIcon: '📊',
      sourceLabel: 'Market Intelligence',
      category: 'market',
      supportingData: { totalMarket },
    })
  } else {
    cards.push({
      id: 'vis-market-empty',
      title: 'Visual Market Data',
      text: 'No insights available yet. Connect to intelligence services to see market data.',
      relevance: 0,
      sourceIcon: '📊',
      sourceLabel: 'Market Intelligence',
      category: 'market',
    })
  }

  // Trend signals for visual context
  const totalSignals = Array.isArray(trends) ? trends.length : 0
  if (totalSignals > 0) {
    cards.push({
      id: 'vis-trend-signals',
      title: 'Trend Signals',
      text: `${totalSignals} trend signals inform visual direction and market positioning.`,
      relevance: 65,
      sourceIcon: '📡',
      sourceLabel: 'Trends',
      category: 'trends',
      supportingData: { totalSignals },
    })
  } else if (cards.length < 3) {
    cards.push({
      id: 'vis-trend-empty',
      title: 'Trend Intelligence',
      text: 'No insights available yet. Connect to intelligence services to see relevant trends.',
      relevance: 0,
      sourceIcon: '📡',
      sourceLabel: 'Trends',
      category: 'trends',
    })
  }

  // Reports summary
  const reportsCount = Array.isArray(data.reports) ? data.reports.length : 0
  cards.push({
    id: 'vis-reports',
    title: reportsCount > 0 ? `${reportsCount} Reports Available` : 'Reports',
    text: reportsCount > 0
      ? `${reportsCount} project reports are ready for visual export.`
      : 'No reports yet. Generate reports from your project data.',
    relevance: reportsCount > 0 ? 70 : 15,
    sourceIcon: '📄',
    sourceLabel: 'Reports',
    category: 'reports',
    supportingData: reportsCount > 0 ? { count: reportsCount } : undefined,
  })

  return cards.slice(0, 3)
}

function castInsights(data: NonNullable<Parameters<IntelligenceAdapter['getInsights']>[1]>): InsightCardData[] {
  const { trends = [], marketData = [] } = data
  const totalSignals = Array.isArray(trends) ? trends.length : 0
  const cards: InsightCardData[] = []

  cards.push({
    id: 'cast-talent-trends',
    title: totalSignals > 0 ? `${totalSignals} Talent Signals` : 'Talent Trends',
    text: totalSignals > 0
      ? `${totalSignals} talent and cast trends available for your project.`
      : 'No insights available yet. Connect to intelligence services for casting intelligence.',
    relevance: totalSignals > 0 ? 80 : 0,
    sourceIcon: '🎭',
    sourceLabel: 'Cast Trends',
    category: 'trends',
    supportingData: totalSignals > 0 ? { totalSignals } : undefined,
  })

  const marketCount = Array.isArray(marketData) ? marketData.length : 0
  cards.push({
    id: 'cast-market-alignment',
    title: marketCount > 0 ? 'Market Alignment' : 'Market Intelligence',
    text: marketCount > 0
      ? 'Cast and talent market alignment data is available.'
      : 'Connect to intelligence services for talent market data.',
    relevance: marketCount > 0 ? 65 : 0,
    sourceIcon: '📊',
    sourceLabel: 'Market',
    category: 'market',
    supportingData: marketCount > 0 ? { items: marketCount } : undefined,
  })

  // Dashboard summary
  if (data.dashboardData) {
    cards.push({
      id: 'cast-dashboard',
      title: 'Dashboard Overview',
      text: 'Intelligence dashboard data available for casting decisions.',
      relevance: 55,
      sourceIcon: '📋',
      sourceLabel: 'Dashboard',
      category: 'reports',
      supportingData: {},
    })
  } else {
    cards.push({
      id: 'cast-dashboard-empty',
      title: 'Dashboard',
      text: 'No insights available yet. Connect to intelligence services for dashboard data.',
      relevance: 0,
      sourceIcon: '📋',
      sourceLabel: 'Dashboard',
      category: 'reports',
    })
  }

  return cards.slice(0, 3)
}

function produceInsights(data: NonNullable<Parameters<IntelligenceAdapter['getInsights']>[1]>): InsightCardData[] {
  const { marketData = [], reports = [] } = data
  const cards: InsightCardData[] = []

  const marketCount = Array.isArray(marketData) ? marketData.length : 0
  cards.push({
    id: 'prod-market-intel',
    title: marketCount > 0 ? `${marketCount} Market Signals` : 'Production Market Intel',
    text: marketCount > 0
      ? `${marketCount} market signals relevant to production planning.`
      : 'No insights available yet. Connect to intelligence services for production market data.',
    relevance: marketCount > 0 ? 75 : 0,
    sourceIcon: '📊',
    sourceLabel: 'Market',
    category: 'market',
    supportingData: marketCount > 0 ? { items: marketCount } : undefined,
  })

  cards.push({
    id: 'prod-reports',
    title: 'Production Reports',
    text: Array.isArray(reports) && reports.length > 0
      ? `${reports.length} production reports ready.`
      : 'No reports yet. Generate production reports from your project.',
    relevance: Array.isArray(reports) && reports.length > 0 ? 70 : 15,
    sourceIcon: '📄',
    sourceLabel: 'Reports',
    category: 'reports',
    supportingData: Array.isArray(reports) && reports.length > 0 ? { count: reports.length } : undefined,
  })

  cards.push({
    id: 'prod-financing',
    title: 'Financing & Incentives',
    text: 'Explore co-production frameworks, incentives, and cashflow planning in the Financing tab.',
    relevance: 50,
    sourceIcon: '💰',
    sourceLabel: 'Financing',
    category: 'financing',
  })

  return cards.slice(0, 3)
}

function packageInsights(data: NonNullable<Parameters<IntelligenceAdapter['getInsights']>[1]>): InsightCardData[] {
  const { reports = [], marketData = [] } = data
  const cards: InsightCardData[] = []

  cards.push({
    id: 'pkg-reports',
    title: 'Package Reports',
    text: Array.isArray(reports) && reports.length > 0
      ? `${reports.length} reports available for packaging and investor materials.`
      : 'No reports yet. Generate reports to build your package.',
    relevance: Array.isArray(reports) && reports.length > 0 ? 80 : 10,
    sourceIcon: '📦',
    sourceLabel: 'Reports',
    category: 'reports',
    supportingData: Array.isArray(reports) && reports.length > 0 ? { count: reports.length } : undefined,
  })

  cards.push({
    id: 'pkg-market',
    title: 'Market Intelligence for Packaging',
    text: Array.isArray(marketData) && marketData.length > 0
      ? `${marketData.length} market signals strengthen your package positioning.`
      : 'Connect to intelligence services for buyer and market data to strengthen your package.',
    relevance: Array.isArray(marketData) && marketData.length > 0 ? 70 : 0,
    sourceIcon: '📊',
    sourceLabel: 'Market',
    category: 'market',
    supportingData: Array.isArray(marketData) && marketData.length > 0 ? { items: marketData.length } : undefined,
  })

  cards.push({
    id: 'pkg-financing',
    title: 'Financing Overview',
    text: 'Include incentive and co-production data in your package. Explore the Financing tab.',
    relevance: 45,
    sourceIcon: '💰',
    sourceLabel: 'Financing',
    category: 'financing',
  })

  return cards.slice(0, 3)
}

function deliverInsights(data: NonNullable<Parameters<IntelligenceAdapter['getInsights']>[1]>): InsightCardData[] {
  const { reports = [] } = data
  const cards: InsightCardData[] = []

  cards.push({
    id: 'del-reports',
    title: 'Delivery Reports',
    text: Array.isArray(reports) && reports.length > 0
      ? `${reports.length} reports ready for delivery and distribution.`
      : 'No reports yet. Generate delivery documentation from project data.',
    relevance: Array.isArray(reports) && reports.length > 0 ? 75 : 10,
    sourceIcon: '📄',
    sourceLabel: 'Reports',
    category: 'reports',
    supportingData: Array.isArray(reports) && reports.length > 0 ? { count: reports.length } : undefined,
  })

  cards.push({
    id: 'del-market',
    title: 'Distribution Market Intel',
    text: 'Market intelligence supports distribution strategy and territory planning.',
    relevance: 60,
    sourceIcon: '📊',
    sourceLabel: 'Market',
    category: 'market',
  })

  cards.push({
    id: 'del-financing',
    title: 'Delivery Financing',
    text: 'Finalise incentive claims and co-production obligations before delivery.',
    relevance: 40,
    sourceIcon: '💰',
    sourceLabel: 'Financing',
    category: 'financing',
  })

  return cards.slice(0, 3)
}

// ── Workspace routing ───────────────────────────────────────────────────────

const WORKSPACE_GENERATORS: Record<string, (data: NonNullable<Parameters<IntelligenceAdapter['getInsights']>[1]>) => InsightCardData[]> = {
  concept: developInsights,
  develop: developInsights,
  visualize: visualizeInsights,
  cast: castInsights,
  produce: produceInsights,
  package: packageInsights,
  deliver: deliverInsights,
}

export const intelligenceAdapter: IntelligenceAdapter = {
  getInsights(context, data = {}): InsightCardData[] {
    const generator = WORKSPACE_GENERATORS[context] || developInsights
    return generator(data)
  },
}