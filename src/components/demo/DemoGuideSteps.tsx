/**
 * Demo guide step definitions for the DemoPortal walkthrough.
 * Each step targets a section on the DemoPortal page via a CSS selector.
 */

export interface DemoStepDef {
  id: string;
  title: string;
  description: string;
  target: string;
}

export const DEMO_GUIDE_STEPS: DemoStepDef[] = [
  {
    id: 'feature-cards',
    title: 'Feature Overview',
    description: 'Browse the five core IFFY capabilities available in this demo.',
    target: '#demo-feature-cards',
  },
  {
    id: 'pipeline-flow',
    title: 'Pipeline Flow',
    description: 'Visualize how your script moves through the IFFY analysis pipeline.',
    target: '#pipeline-flow',
  },
  {
    id: 'obligation-heatmap',
    title: 'Obligation Heatmap',
    description: 'Explore narrative obligations mapped across scenes and types.',
    target: '#obligation-heatmap',
  },
  {
    id: 'script-upload',
    title: 'Script Upload',
    description: 'Upload a screenplay to seed the analysis pipeline with source material.',
    target: '#script-upload',
  },
  {
    id: 'doc-generation',
    title: 'Document Generation',
    description: 'Review generated documents like bibles, sheets, and briefs.',
    target: '#doc-generation',
  },
  {
    id: 'atom-explorer',
    title: 'Atom Explorer',
    description: 'Inspect extracted narrative atoms organized by category.',
    target: '#atom-explorer',
  },
];

export function getDemoStepById(id: string): DemoStepDef | undefined {
  return DEMO_GUIDE_STEPS.find((step) => step.id === id);
}

export default DEMO_GUIDE_STEPS;