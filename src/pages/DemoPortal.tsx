import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Clapperboard, Cpu, BarChart3, Users, Play, ArrowRight,
  Film, Sparkles, BrainCircuit, Gauge, ChevronDown, ChevronUp,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useObligationData } from '@/hooks/useObligationData';
import { DemoPipelineFlow } from '@/components/demo/DemoPipelineFlow';
import { DemoObligationHeatmap } from '@/components/demo/DemoObligationHeatmap';
import { DemoScriptUpload } from '@/components/demo/DemoScriptUpload';
import { DemoDocGeneration } from '@/components/demo/DemoDocGeneration';
import { DemoAtomExplorer } from '@/components/demo/DemoAtomExplorer';
import { DemoGuideSteps } from '@/components/demo/DemoGuideSteps';
import iffyLogo from '@/assets/iffy-logo-v3.png';

interface FeatureCard {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  path: string;
  color: string;
  gradient: string;
  badge?: string;
}

const FEATURE_CARDS: FeatureCard[] = [
  {
    id: 'cinematic',
    title: 'Cinematic',
    description: 'Full-screen visual walkthrough of IFFY\'s production intelligence platform',
    icon: Film,
    path: '/demo/cinematic',
    color: 'text-blue-400',
    gradient: 'from-blue-500/10 via-blue-600/5 to-transparent',
    badge: 'Scrolling',
  },
  {
    id: 'interactive',
    title: 'Interactive',
    description: 'Hands-on demo — explore IFFY\'s tools and dashboards live',
    icon: Cpu,
    path: '/demo/interactive',
    color: 'text-purple-400',
    gradient: 'from-purple-500/10 via-purple-600/5 to-transparent',
    badge: 'Hands-on',
  },
  {
    id: 'executive',
    title: 'Executive',
    description: 'Major studio packaging demo — SHADOW PROTOCOL from idea to recoupment',
    icon: Users,
    path: '/demo/executive',
    color: 'text-amber-400',
    gradient: 'from-amber-500/10 via-amber-600/5 to-transparent',
    badge: 'Pitch',
  },
  {
    id: 'guided',
    title: 'Guided',
    description: 'Step-by-step interactive demo player with narration and chapters',
    icon: Play,
    path: '/demo/guided',
    color: 'text-green-400',
    gradient: 'from-green-500/10 via-green-600/5 to-transparent',
    badge: 'Tour',
  },
  {
    id: 'run',
    title: 'Run The Demo',
    description: 'Self-directed sandbox — try IFFY with real tools and sample data',
    icon: Gauge,
    path: '/demo/run',
    color: 'text-rose-400',
    gradient: 'from-rose-500/10 via-rose-600/5 to-transparent',
    badge: 'Sandbox',
  },
];

function SectionHeader({ title, subtitle, icon: Icon, color }: {
  title: string; subtitle?: string; icon?: React.ElementType; color?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      {Icon && <Icon className={`h-5 w-5 ${color || 'text-primary/60'}`} />}
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-[11px] text-muted-foreground/60">{subtitle}</p>}
      </div>
    </div>
  );
}

function FeatureCardView({ card, index }: { card: FeatureCard; index: number }) {
  const navigate = useNavigate();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4 }}
    >
      <Card
        className="relative overflow-hidden border border-border/20 bg-card/40 hover:bg-card/60 hover:border-border/40 transition-all cursor-pointer group h-full"
        onClick={() => navigate(card.path)}
      >
        <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
        <div className="relative p-4 flex flex-col h-full">
          <div className="flex items-start justify-between mb-2">
            <div className={`p-2 rounded-lg bg-muted/50 group-hover:bg-${card.color.split('-')[1]}-500/10 transition-colors`}>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </div>
            {card.badge && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-border/20 text-muted-foreground/60">
                {card.badge}
              </Badge>
            )}
          </div>
          <h4 className="text-sm font-semibold text-foreground mb-1">{card.title}</h4>
          <p className="text-[11px] text-muted-foreground/60 flex-1">{card.description}</p>
          <div className="flex items-center gap-1 mt-2 text-[10px] text-primary/60 group-hover:text-primary transition-colors">
            <span>Open</span>
            <ArrowRight className="h-3 w-3" />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export default function DemoPortal() {
  const navigate = useNavigate();
  const { scenes, summary, loading } = useObligationData();
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showPipeline, setShowPipeline] = useState(true);

  const avgPressure = useMemo(() => {
    if (!scenes.length) return 0;
    return scenes.reduce((sum, s) => sum + s.narrativePressure, 0) / scenes.length;
  }, [scenes]);

  const pressureBand = avgPressure > 0.7 ? 'text-red-400' : avgPressure > 0.5 ? 'text-amber-400' : avgPressure > 0.3 ? 'text-green-400' : 'text-blue-400';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/20 bg-background/70 backdrop-blur-2xl">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/')}>
              <img src={iffyLogo} alt="IFFY" className="h-6 w-6 rounded ring-1 ring-border/20" />
            </Button>
            <div className="flex flex-col leading-none">
              <span className="font-display font-semibold text-sm text-foreground">IFFY Demo</span>
              <span className="text-[8px] text-muted-foreground/50 uppercase tracking-wider">Surface Hub</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => navigate('/demo/guided')}>
              <Play className="h-3.5 w-3.5 mr-1" /> Guided Tour
            </Button>
            <Button variant="outline" size="sm" className="text-xs border-border/20" onClick={() => navigate('/dashboard')}>
              <Clapperboard className="h-3.5 w-3.5 mr-1" /> Projects
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6 max-w-6xl mx-auto px-4">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-primary/60" />
            <Badge variant="outline" className="text-[10px] border-primary/20 text-primary/60">Demo Surface</Badge>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Welcome to IFFY</h1>
          <p className="text-sm text-muted-foreground/70 max-w-2xl">
            Intelligent Film Flow &amp; Yield — from screenplay to recoupment model in one platform.
            Explore the features below or jump straight into a guided tour.
          </p>
        </motion.div>

        {/* Feature Cards */}
        <section className="mb-8">
          <SectionHeader title="Demo Experiences" subtitle="Pick a path to explore IFFY" icon={Film} color="text-blue-400" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {FEATURE_CARDS.map((card, i) => (
              <FeatureCardView key={card.id} card={card} index={i} />
            ))}
          </div>
        </section>

        {/* Pipeline Flow Diagram */}
        <section className="mb-8">
          <button
            onClick={() => setShowPipeline(!showPipeline)}
            className="w-full flex items-center justify-between"
          >
            <SectionHeader title="IFFY Pipeline" subtitle="How data flows through the platform" icon={BrainCircuit} color="text-purple-400" />
            {showPipeline ? <ChevronUp className="h-4 w-4 text-muted-foreground/50" /> : <ChevronDown className="h-4 w-4 text-muted-foreground/50" />}
          </button>
          <AnimatePresence>
            {showPipeline && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <Card className="border border-border/20 bg-card/30 p-4">
                  <DemoPipelineFlow />
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Obligation Heatmap */}
        <section className="mb-8">
          <button
            onClick={() => setShowHeatmap(!showHeatmap)}
            className="w-full flex items-center justify-between"
          >
            <SectionHeader
              title="Obligation Topology"
              subtitle={`${scenes.length} scenes analysed — ${summary?.dominantModeAcrossScenes || 'balanced'} across acts`}
              icon={BarChart3}
              color="text-amber-400"
            />
            <div className="flex items-center gap-3">
              {summary && (
                <span className={`text-xs font-mono font-bold ${pressureBand}`}>
                  Ø {(avgPressure * 100).toFixed(0)}%
                </span>
              )}
              {showHeatmap ? <ChevronUp className="h-4 w-4 text-muted-foreground/50" /> : <ChevronDown className="h-4 w-4 text-muted-foreground/50" />}
            </div>
          </button>
          <AnimatePresence>
            {showHeatmap && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <Card className="border border-border/20 bg-card/30 p-4">
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                    </div>
                  ) : (
                    <DemoObligationHeatmap scenes={scenes} />
                  )}
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Demo Components Grid */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <Card className="border border-border/20 bg-card/30 p-4">
            <SectionHeader title="Script Upload" icon={Film} color="text-blue-400" />
            <DemoScriptUpload />
          </Card>
          <Card className="border border-border/20 bg-card/30 p-4">
            <SectionHeader title="Document Generation" icon={Sparkles} color="text-green-400" />
            <DemoDocGeneration />
          </Card>
          <Card className="border border-border/20 bg-card/30 p-4">
            <SectionHeader title="Atom Explorer" icon={BrainCircuit} color="text-purple-400" />
            <DemoAtomExplorer />
          </Card>
          <Card className="border border-border/20 bg-card/30 p-4">
            <SectionHeader title="Quick Start" icon={Play} color="text-amber-400" />
            <DemoGuideSteps />
          </Card>
        </motion.section>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center pb-8"
        >
          <p className="text-xs text-muted-foreground/50 mb-3">Ready to go deeper?</p>
          <div className="flex items-center justify-center gap-3">
            <Button onClick={() => navigate('/demo/guided')}>
              <Play className="h-4 w-4 mr-1" /> Start Guided Tour
            </Button>
            <Button variant="outline" onClick={() => navigate('/demo/run')}>
              <Gauge className="h-4 w-4 mr-1" /> Sandbox
            </Button>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => navigate('/dashboard')}>
              Go to Projects <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </motion.div>
      </main>
    </div>
  );
}