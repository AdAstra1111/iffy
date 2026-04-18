import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { CommandPalette } from "@/components/CommandPalette";
import { ScrollToTop } from "@/components/ScrollToTop";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { CorpusIntegrityBanner } from "@/components/corpus/CorpusIntegrityBanner";
import { UIModeProvider } from "@/hooks/useUIMode";
import { ProcessingProvider } from "@/lib/processing/ProcessingContext";

// Eagerly load critical path pages — lazy+Suspense causes removeChild crash on Android/slow connections
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import ProjectDevelopmentEngine from "./pages/ProjectDevelopmentEngine";

// Lazy-load everything else
// Dashboard is eagerly loaded above — do not lazy-load it (causes removeChild crash)
const NewProject = lazy(() => import("./pages/NewProject"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const Trends = lazy(() => import("./pages/Trends"));
const StoryTrends = lazy(() => import("./pages/StoryTrends"));
const CastTrends = lazy(() => import("./pages/CastTrends"));
const IncentiveFinder = lazy(() => import("./pages/IncentiveFinder"));
const CoproPlanner = lazy(() => import("./pages/CoproPlanner"));
const StackCashflow = lazy(() => import("./pages/StackCashflow"));
const CompareProjects = lazy(() => import("./pages/CompareProjects"));
const Pipeline = lazy(() => import("./pages/Pipeline"));
const FestivalCalendar = lazy(() => import("./pages/FestivalCalendar"));
const ProductionCalendar = lazy(() => import("./pages/ProductionCalendar"));
const BuyerCRM = lazy(() => import("./pages/BuyerCRM"));
const About = lazy(() => import("./pages/About"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const FAQ = lazy(() => import("./pages/FAQ"));
const HowIFFYThinks = lazy(() => import("./pages/HowIFFYThinks"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const Notifications = lazy(() => import("./pages/Notifications"));
const MarketIntelligence = lazy(() => import("./pages/MarketIntelligence"));
const Settings = lazy(() => import("./pages/Settings"));
const Reports = lazy(() => import("./pages/Reports"));
const Companies = lazy(() => import("./pages/Companies"));
const CompanyDetail = lazy(() => import("./pages/CompanyDetail"));
const CompanyProjects = lazy(() => import("./pages/CompanyProjects"));
const PresentationMode = lazy(() => import("./pages/PresentationMode"));
const TrendGovernance = lazy(() => import("./pages/TrendGovernance"));
const TrendsExplorer = lazy(() => import("./pages/TrendsExplorer"));
const TrendsCoverage = lazy(() => import("./pages/TrendsCoverage"));
const CinematicDemo = lazy(() => import("./pages/CinematicDemo"));
const GuidedDemo = lazy(() => import("./demo/GuidedDemo"));
const InteractiveDemo = lazy(() => import("./pages/InteractiveDemo"));
const ExecutiveDemo = lazy(() => import("./pages/ExecutiveDemo"));
const Pricing = lazy(() => import("./pages/Pricing"));
const CoverageLab = lazy(() => import("./pages/CoverageLab"));
const PitchIdeas = lazy(() => import("./pages/PitchIdeas"));
const CalibrationLab = lazy(() => import("./pages/CalibrationLab"));
const PitchDeckViewer = lazy(() => import("./pages/PitchDeckViewer"));
const InvestorPresentation = lazy(() => import("./pages/InvestorPresentation"));
const DevelopmentEngine = lazy(() => import("./pages/DevelopmentEngine"));
// ProjectDevelopmentEngine is eagerly loaded above — do not lazy-load (causes removeChild crash)
const SeriesWriterPage = lazy(() => import("./pages/SeriesWriter"));
const FeatureScript = lazy(() => import("./pages/FeatureScript"));
const ProducerCockpit = lazy(() => import("./pages/ProducerCockpit"));
const SharePackView = lazy(() => import("./pages/SharePackView"));
const ShotListPage = lazy(() => import("./pages/ShotListPage"));
const StoryboardsPage = lazy(() => import("./pages/StoryboardsPage"));
const VisualReferencesPage = lazy(() => import("./pages/VisualReferencesPage"));
const ScriptIntakePage = lazy(() => import("./pages/ScriptIntakePage"));
const Processing = lazy(() => import("./pages/Processing"));
// QuickReview / DeepReview kept as thin redirects to canonical workspace analysis
const NotFound = lazy(() => import("./pages/NotFound"));
const Pitch = lazy(() => import("./pages/Pitch"));
const NotesInbox = lazy(() => import("./pages/NotesInbox"));
// AiTrailerBuilder removed — canonical Trailer Intelligence pipeline only
const VisualUnits = lazy(() => import("./pages/VisualUnits"));
const StoryboardPipeline = lazy(() => import("./pages/StoryboardPipeline"));
const TrailerPipeline = lazy(() => import("./pages/TrailerPipeline"));
const ClipCandidatesStudio = lazy(() => import("./pages/ClipCandidatesStudio"));
const TrailerTimelineStudio = lazy(() => import("./pages/TrailerTimelineStudio"));
const VisualDevHub = lazy(() => import("./pages/VisualDevHub"));
const TrailerHub = lazy(() => import("./pages/TrailerHub"));
const Showcase = lazy(() => import("./pages/Showcase"));
const CanonPlaceholder = lazy(() => import("./pages/CanonPlaceholder"));
const AIContentPage = lazy(() => import("./pages/AIContentPage"));
const AICastLibrary = lazy(() => import("./pages/AICastLibrary"));
const ActorMarketplace = lazy(() => import("./pages/ActorMarketplace"));
const ProjectCasting = lazy(() => import("./pages/ProjectCasting"));
const CastingStudio = lazy(() => import("./pages/CastingStudio"));
const CastingPipeline = lazy(() => import("./pages/CastingPipeline"));
const ProductionDesign = lazy(() => import("./pages/ProductionDesign"));
const VisualProductionPipeline = lazy(() => import("./pages/VisualProductionPipeline"));
const NarrativeDna = lazy(() => import("./pages/NarrativeDna"));
const NarrativeEngines = lazy(() => import("./pages/NarrativeEngines"));
const DemoDashboard = lazy(() => import("./pages/DemoDashboard"));
const IntelDashboard = lazy(() => import("./pages/IntelDashboard"));
const IntelPolicies = lazy(() => import("./pages/IntelPolicies"));
const IntelEvents = lazy(() => import("./pages/IntelEvents"));
const IntelAlignment = lazy(() => import("./pages/IntelAlignment"));
const ExemplarBrowser = lazy(() => import("./pages/ExemplarBrowser"));
const CIBlueprintEngine = lazy(() => import("./pages/CIBlueprintEngine"));
const PosterEngine = lazy(() => import("./components/poster/PosterEnginePanel"));
const LookBookPage = lazy(() => import("./pages/LookBookPage"));
const ProjectImageLibrary = lazy(() => import("./pages/ProjectImageLibrary"));
const ActorLibrary = lazy(() => import("./pages/ActorLibrary"));


// ProjectShell — new unified workspace frame (Week 1 refactor)
import { ProjectShell } from "@/components/project/ProjectShell";

// Trailer redirect helper — maps old trailer routes to canonical /projects/:id/trailer?tab=
function TrailerRedirect({ tab }: { tab?: string }) {
  const { id, '*': splat } = useParams<{ id: string; '*': string }>();
  // Derive tab from explicit prop, splat path segment, or default empty
  const resolvedTab = tab || splat?.split('/').filter(Boolean)[0] || '';
  const to = `/projects/${id}/trailer${resolvedTab ? `?tab=${resolvedTab}` : ''}`;
  return <Navigate to={to} replace />;
}

/**
 * ReviewRedirect — deterministic redirect for legacy /quick-review and /deep-review routes.
 * If projectId is present, redirects to canonical workspace analysis.
 * Otherwise redirects to /dashboard.
 */
function ReviewRedirect() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId');
  if (projectId) {
    return <Navigate to={`/projects/${projectId}/script?drawer=open&drawerTab=analysis`} replace />;
  }
  return <Navigate to="/dashboard" replace />;
}
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 min – avoid redundant refetches
      gcTime: 1000 * 60 * 10, // 10 min garbage collection
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const PageFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="h-8 w-8 rounded-md bg-primary animate-pulse" />
  </div>
);

// S — thin per-route Suspense wrapper. Each lazy route gets its own boundary
// so a slow load never races with another route's Suspense unmount.
const S = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<PageFallback />}>{children}</Suspense>
);
const P = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>{children}</ProtectedRoute>
);

const AnimatedRoutes = () => (
  <Routes>
    <Route path="/" element={<Index />} />
    <Route path="/auth" element={<Auth />} />
    <Route path="/dashboard" element={<P><Dashboard /></P>} />
    <Route path="/projects/new" element={<P><S><NewProject /></S></P>} />
    <Route path="/projects/:id" element={<P><S><ProjectShell><ProjectDetail /></ProjectShell></S></P>} />
    <Route path="/projects/:id/development" element={<P><ProjectShell><ProjectDevelopmentEngine /></ProjectShell></P>} />
    <Route path="/projects/:id/script" element={<P><ProjectShell><ProjectDevelopmentEngine /></ProjectShell></P>} />
    <Route path="/projects/:id/notes" element={<P><S><NotesInbox /></S></P>} />
    <Route path="/projects/:id/series-writer" element={<P><S><SeriesWriterPage /></S></P>} />
    <Route path="/projects/:id/feature-script" element={<P><S><FeatureScript /></S></P>} />
    <Route path="/projects/:id/cockpit" element={<P><S><ProducerCockpit /></S></P>} />
    <Route path="/projects/:id/shot-list" element={<P><S><ShotListPage /></S></P>} />
    <Route path="/projects/:id/storyboards" element={<P><S><StoryboardsPage /></S></P>} />
    <Route path="/projects/:id/visual-references" element={<P><S><VisualReferencesPage /></S></P>} />
    <Route path="/projects/:id/script-intake" element={<P><S><ScriptIntakePage /></S></P>} />
    <Route path="/projects/:id/ai-trailer" element={<P><TrailerRedirect /></P>} />
    <Route path="/projects/:id/visual-units" element={<P><S><VisualUnits /></S></P>} />
    <Route path="/projects/:id/storyboard-pipeline" element={<P><S><StoryboardPipeline /></S></P>} />
    <Route path="/projects/:id/trailer-pipeline" element={<P><TrailerRedirect tab="blueprints" /></P>} />
    <Route path="/projects/:id/trailer-clips" element={<P><TrailerRedirect tab="clips" /></P>} />
    <Route path="/projects/:id/trailer-assemble" element={<P><TrailerRedirect tab="assemble" /></P>} />
    <Route path="/projects/:id/visual-dev" element={<P><S><VisualDevHub /></S></P>} />
    <Route path="/projects/:id/visual-dev/trailer/*" element={<P><TrailerRedirect /></P>} />
    <Route path="/projects/:id/canon" element={<P><S><ProjectShell><CanonPlaceholder /></ProjectShell></S></P>} />
    <Route path="/projects/:id/trailer" element={<P><S><ProjectShell><TrailerHub /></ProjectShell></S></P>} />
    <Route path="/projects/:id/produce" element={<P><S><ProjectShell><ProducerCockpit /></ProjectShell></S></P>} />
    <Route path="/projects/:id/ai-content" element={<P><S><ProjectShell><AIContentPage /></ProjectShell></S></P>} />
    <Route path="/projects/:id/casting" element={<P><S><ProjectShell><CastingPipeline /></ProjectShell></S></P>} />
    <Route path="/projects/:id/production-design" element={<P><S><ProjectShell><ProductionDesign /></ProjectShell></S></P>} />
    <Route path="/projects/:id/visual-production" element={<P><S><ProjectShell><VisualProductionPipeline /></ProjectShell></S></P>} />
    <Route path="/projects/:id/casting-studio" element={<P><S><ProjectShell><CastingStudio /></ProjectShell></S></P>} />
    <Route path="/projects/:id/casting-advanced" element={<P><S><ProjectShell><ProjectCasting /></ProjectShell></S></P>} />
    <Route path="/projects/:id/poster" element={<P><S><ProjectShell><PosterEngine /></ProjectShell></S></P>} />
    <Route path="/projects/:id/lookbook" element={<P><S><ProjectShell><LookBookPage /></ProjectShell></S></P>} />
    <Route path="/projects/:id/images" element={<P><S><ProjectShell><ProjectImageLibrary /></ProjectShell></S></P>} />
    <Route path="/projects/:id/present" element={<P><S><PresentationMode /></S></P>} />
    <Route path="/projects/:id/pitch-deck" element={<P><S><PitchDeckViewer /></S></P>} />
    <Route path="/trends" element={<P><S><Trends /></S></P>} />
    <Route path="/trends/story" element={<P><S><StoryTrends /></S></P>} />
    <Route path="/trends/cast" element={<P><S><CastTrends /></S></P>} />
    <Route path="/trends/governance" element={<P><S><TrendGovernance /></S></P>} />
    <Route path="/trends/explorer" element={<P><S><TrendsExplorer /></S></P>} />
    <Route path="/trends/coverage" element={<P><S><TrendsCoverage /></S></P>} />
    <Route path="/incentives" element={<P><S><IncentiveFinder /></S></P>} />
    <Route path="/incentives/copro" element={<P><S><CoproPlanner /></S></P>} />
    <Route path="/incentives/stack" element={<P><S><StackCashflow /></S></P>} />
    <Route path="/compare" element={<P><S><CompareProjects /></S></P>} />
    <Route path="/pipeline" element={<P><S><Pipeline /></S></P>} />
    <Route path="/festivals" element={<P><S><FestivalCalendar /></S></P>} />
    <Route path="/calendar" element={<P><S><ProductionCalendar /></S></P>} />
    <Route path="/buyer-crm" element={<P><S><BuyerCRM /></S></P>} />
    <Route path="/notifications" element={<P><S><Notifications /></S></P>} />
    <Route path="/market-intelligence" element={<P><S><MarketIntelligence /></S></P>} />
    <Route path="/settings" element={<P><S><Settings /></S></P>} />
    <Route path="/reports" element={<P><S><Reports /></S></P>} />
    <Route path="/intel" element={<P><S><IntelDashboard /></S></P>} />
    <Route path="/intel/policies" element={<P><S><IntelPolicies /></S></P>} />
    <Route path="/intel/events" element={<P><S><IntelEvents /></S></P>} />
    <Route path="/intel/alignment/:id" element={<P><S><IntelAlignment /></S></P>} />
    <Route path="/companies" element={<P><S><Companies /></S></P>} />
    <Route path="/companies/:id" element={<P><S><CompanyDetail /></S></P>} />
    <Route path="/companies/:id/projects" element={<P><S><CompanyProjects /></S></P>} />
    <Route path="/pricing" element={<P><S><Pricing /></S></P>} />
    <Route path="/coverage-lab" element={<P><S><CoverageLab /></S></P>} />
    <Route path="/pitch-ideas" element={<P><S><PitchIdeas /></S></P>} />
    <Route path="/exemplars" element={<P><S><ExemplarBrowser /></S></P>} />
    <Route path="/ci-blueprint" element={<P><S><CIBlueprintEngine /></S></P>} />
    <Route path="/ai-cast" element={<P><S><AICastLibrary /></S></P>} />
    <Route path="/ai-cast/actors" element={<P><S><ActorLibrary /></S></P>} />
    <Route path="/actor-marketplace" element={<P><S><ActorMarketplace /></S></P>} />
    <Route path="/calibration-lab" element={<P><S><CalibrationLab /></S></P>} />
    <Route path="/about" element={<P><S><About /></S></P>} />
    <Route path="/how-it-works" element={<P><S><HowItWorks /></S></P>} />
    <Route path="/faq" element={<P><S><FAQ /></S></P>} />
    <Route path="/how-iffy-thinks" element={<P><S><HowIFFYThinks /></S></P>} />
    <Route path="/showcase" element={<P><S><Showcase /></S></P>} />
    <Route path="/narrative-dna" element={<P><S><NarrativeDna /></S></P>} />
    <Route path="/narrative-engines" element={<P><S><NarrativeEngines /></S></P>} />
    <Route path="/development-engine" element={<P><S><DevelopmentEngine /></S></P>} />
    <Route path="/demo" element={<S><GuidedDemo /></S>} />
    <Route path="/demo/cinematic" element={<S><CinematicDemo /></S>} />
    <Route path="/demo/interactive" element={<S><InteractiveDemo /></S>} />
    <Route path="/demo/executive" element={<S><ExecutiveDemo /></S>} />
    <Route path="/demo/run" element={<P><S><DemoDashboard /></S></P>} />
    <Route path="/investor" element={<P><S><InvestorPresentation /></S></P>} />
    <Route path="/processing" element={<S><Processing /></S>} />
    <Route path="/quick-review" element={<ReviewRedirect />} />
    <Route path="/deep-review" element={<ReviewRedirect />} />
    <Route path="/invite" element={<S><AcceptInvite /></S>} />
    <Route path="/share/pack/:token" element={<S><SharePackView /></S>} />
    <Route path="/pitch" element={<S><Pitch /></S>} />
    <Route path="*" element={<S><NotFound /></S>} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
    <UIModeProvider>
    <ProcessingProvider>
    <ThemeProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      {/* Build stamp — fixed bottom-left, only visible in dev/staging awareness */}
      <div style={{ position: 'fixed', bottom: 4, left: 6, zIndex: 9999, fontSize: '9px', color: 'rgba(255,255,255,0.18)', pointerEvents: 'none', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
        {__COMMIT_HASH__} · {new Date(__BUILD_TIME__).toISOString().slice(0,16).replace('T',' ')}Z
      </div>
      <BrowserRouter>
        <ScrollToTop />
        <CorpusIntegrityBanner />
        <CommandPalette />
        <AnimatedRoutes />
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
    </ProcessingProvider>
    </UIModeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
