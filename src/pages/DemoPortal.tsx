/**
 * DemoPortal — Consolidated demo surface hub.
 * Orchestrates feature cards, pipeline flow, obligation heatmap,
 * and demo tool sections in a single scrollable page.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Clapperboard, Monitor, BarChart3, Map, Play,
  ChevronRight, ExternalLink, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DemoPipelineFlow } from '@/components/demo/DemoPipelineFlow';
import { DemoObligationHeatmap } from '@/components/demo/DemoObligationHeatmap';
import { DemoScriptUpload } from '@/components/demo/DemoScriptUpload';
import { DemoDocGeneration } from '@/components/demo/DemoDocGeneration';
import { DemoAtomExplorer } from '@/components/demo/DemoAtomExplorer';
import { useObligationData } from '@/hooks/useObligationData';

/* ── Feature cards linking to existing demo pages ── */
const FEATURE_CARDS = [
  {
    id: 'cinematic',
    title: 'Cinematic',
    description: 'Full-screen immersive pitch experience with parallax scrolling and cinematic transitions.',
    icon: Clapperboard,
    path: '/demo/cinematic',
    color: 'from-indigo-500/10 to-purple-500/10 border-indigo-500/20 hover:border-indigo-500/40',
    badge: 'Immersive',
  },
  {
    id: 'interactive',
    title: 'Interactive',
    description: 'Interactive data dashboard with toggleable KPIs, animated counters, and territory cards.',
    icon: Monitor,
    path: '/demo/interactive',
    color: 'from-emerald-500/10 to-teal-500/10 border-emerald-500/20 hover:border-emerald-500/40',
    badge: 'Data',
  },
  {
    id: 'executive',
    title: 'Executive',
    description: 'Major studio packaging walkthrough from idea to recoupment for decision-makers.',
    icon: BarChart3,
    path: '/demo/executive',
    color: 'from-amber-500/10 to-orange-500/10 border-amber-500/20 hover:border-amber-500/40',
    badge: 'Walkthrough',
  },
  {
    id: 'guided',
    title: 'Guided Tour',
    description: 'Interactive step-by-step demo with auto-advance, screen recording, and chapter navigation.',
    icon: Map,
    path: '/demo/guided',
    color: 'from-blue-500/10 to-cyan-500/10 border-blue-500/20 hover:border-blue-500/40',
    badge: 'Tour',
  },
  {
    id: 'run',
    title: 'Demo Run',
    description: 'One-click pipeline orchestration against a deterministic project with live artifact display.',
    icon: Play,
    path: '/demo/run',
    color: 'from-rose-500/10 to-pink-500/10 border-rose-500/20 hover:border-rose-500/40',
    badge: 'Live',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
};

export default function DemoPortal() {
  const navigate = useNavigate();
  const { obligations, topology, isLoading } = useObligationData({ mock: true });

  const MOCK_SCENES = [
    { id: 's1', title: 'Cold Open' },
    { id: 's2', title: 'Safe House' },
    { id: 's3', title: 'Archive' },
    { id: 's4', title: 'Intercept' },
    { id: 's5', title: 'Mole Reveal' },
    { id: 's6', title: 'Chase' },
    { id: 's7', title: 'Safe House 2' },
    { id: 's8', title: 'Cipher Solved' },
    { id: 's9', title: 'Confrontation' },
    { id: 's10', title: 'Resolution' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* ── Hero Header ── */}
      <section className="relative overflow-hidden border-b border-border/20">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="container relative px-6 py-20 md:py-28">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="max-w-3xl"
          >
            <Badge variant="outline" className="mb-4 border-primary/30 text-primary bg-primary/5">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Demo Surface
            </Badge>
            <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight text-foreground mb-4">
              See IFFY in Action
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
              Explore five curated demo modes — from cinematic pitches to live pipeline runs — 
              plus embedded visualizations of narrative obligation topology and pipeline flow.
            </p>
          </motion.div>
        </div>
      </section>

      <div className="container px-6 py-12 space-y-16">
        {/* ── Section 1: Feature Cards ── */}
        <motion.section
          id="demo-feature-cards"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
        >
          <h2 className="text-2xl font-display font-semibold text-foreground mb-2">Demo Modes</h2>
          <p className="text-muted-foreground mb-8">
            Choose a demo mode to explore IFFY's capabilities
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {FEATURE_CARDS.map((card) => (
              <motion.div key={card.id} variants={itemVariants}>
                <Card
                  className={`group cursor-pointer transition-all duration-300 border bg-card/50 hover:bg-card ${card.color}`}
                  onClick={() => navigate(card.path)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between mb-2">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <card.icon className="h-5 w-5 text-primary" />
                      </div>
                      <Badge variant="secondary" className="text-[10px] px-2 py-0.5 opacity-70">
                        {card.badge}
                      </Badge>
                    </div>
                    <CardTitle className="text-base">{card.title}</CardTitle>
                    <CardDescription className="text-xs leading-relaxed">
                      {card.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      <span>Explore</span>
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* ── Section 2: Pipeline Flow ── */}
        <motion.section
          id="pipeline-flow"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-2xl font-display font-semibold text-foreground mb-2">IFFY Pipeline</h2>
          <p className="text-muted-foreground mb-8">
            End-to-end narrative production pipeline from script intake to export
          </p>
          <DemoPipelineFlow />
        </motion.section>

        {/* ── Section 3: Obligation Heatmap ── */}
        <motion.section
          id="obligation-heatmap"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-2xl font-display font-semibold text-foreground mb-2">
            Obligation Topology
            {isLoading && <span className="ml-2 text-sm text-muted-foreground font-normal">Loading…</span>}
          </h2>
          <p className="text-muted-foreground mb-8">
            Narrative obligations across scenes — structural promises, entity relationships, and charge states
          </p>
          <DemoObligationHeatmap
            obligations={obligations}
            scenes={MOCK_SCENES}
          />
          {topology?.metrics && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
              <Card className="bg-card/50">
                <CardContent className="pt-6 text-center">
                  <p className="text-2xl font-bold text-foreground">{topology.metrics.total_obligations}</p>
                  <p className="text-xs text-muted-foreground mt-1">Total Obligations</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50">
                <CardContent className="pt-6 text-center">
                  <p className="text-2xl font-bold text-green-400">{topology.metrics.discharged_count}</p>
                  <p className="text-xs text-muted-foreground mt-1">Discharged</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50">
                <CardContent className="pt-6 text-center">
                  <p className="text-2xl font-bold text-amber-400">{topology.metrics.active_count}</p>
                  <p className="text-xs text-muted-foreground mt-1">Active</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50">
                <CardContent className="pt-6 text-center">
                  <p className="text-2xl font-bold text-foreground">{topology.metrics.avg_charge.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Avg Charge</p>
                </CardContent>
              </Card>
            </div>
          )}
        </motion.section>

        {/* ── Section 4: Demo Tools ── */}
        <motion.section
          id="demo-tools"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-2xl font-display font-semibold text-foreground mb-2">Demo Tools</h2>
          <p className="text-muted-foreground mb-8">
            Explore key IFFY features in sandbox mode
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <DemoScriptUpload />
            <DemoDocGeneration />
            <DemoAtomExplorer />
          </div>
        </motion.section>
      </div>

      {/* ── Footer CTA ── */}
      <section className="border-t border-border/20 mt-16">
        <div className="container px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Ready to go deeper? Try a demo mode above or create a project to see IFFY on your own material.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button onClick={() => navigate('/projects/new')}>
              Create Project
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
            <Button variant="outline" onClick={() => navigate('/dashboard')}>
              Go to Dashboard
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
