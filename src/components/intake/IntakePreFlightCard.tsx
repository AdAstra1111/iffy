import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, CheckCircle2, AlertCircle, Loader2, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ExtractedField {
  label: string;
  value: string;
  source: string;
}

interface IntakePreFlightCardProps {
  fileName: string;
  classification: {
    doc_type: string;
    confidence: string;
    lane: string;
    reasoning: string;
    key_signals: string[];
  };
  extractedFields: ExtractedField[];
  gaps: string[];
  isGenerating: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function IntakePreFlightCard({
  fileName,
  classification,
  extractedFields,
  gaps,
  isGenerating,
  onConfirm,
  onCancel,
}: IntakePreFlightCardProps) {
  const [showGaps, setShowGaps] = useState(false);

  const laneLabel = classification.lane === 'feature_film' ? 'Feature Film' 
    : classification.lane === 'vertical_drama' ? 'Vertical Drama'
    : 'Ambiguous — confirm lane';

  const confidenceColor = classification.confidence === 'high' ? 'text-green-400' 
    : classification.confidence === 'medium' ? 'text-yellow-400' 
    : 'text-red-400';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
    >
      <div className="glass-card rounded-xl p-6 w-full max-w-lg mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/30">
          <div className="flex items-center gap-2.5">
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-display font-semibold text-base text-foreground">Intake Review</h3>
              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{fileName}</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1 rounded-md text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Classification Badge */}
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
            {classification.doc_type.replace('_', ' ')} 
            <span className={`opacity-70 ${confidenceColor}`}>({classification.confidence})</span>
          </span>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            classification.lane === 'ambiguous' 
              ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
              : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
          }`}>
            {laneLabel}
          </span>
        </div>

        {/* Extracted Fields */}
        {extractedFields.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">I extracted the following:</p>
            <div className="space-y-1.5">
              {extractedFields.map((field, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
                  <span className="text-foreground">
                    <span className="font-medium">{field.label}</span>
                    {field.value && <span className="text-muted-foreground"> — {field.value}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Gaps */}
        {gaps.length > 0 && (
          <div className="mb-4">
            <button 
              onClick={() => setShowGaps(!showGaps)}
              className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 hover:text-foreground transition-colors"
            >
              <AlertCircle className="h-3.5 w-3.5" />
              {gaps.length} gap{gaps.length !== 1 ? 's' : ''} to fill
            </button>
            <AnimatePresence>
              {showGaps && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-1.5"
                >
                  {gaps.map((gap, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-red-400 mt-0.5">✗</span>
                      <span className="text-foreground">{gap}</span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Key Signals */}
        {classification.key_signals.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-1.5">Key signals:</p>
            <div className="flex flex-wrap gap-1">
              {classification.key_signals.map((signal, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded bg-muted/50 text-muted-foreground">
                  {signal}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Lane Ambiguity Warning */}
        {classification.lane === 'ambiguous' && (
          <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
            <p className="text-sm text-yellow-400">
              This could be Feature Film or Vertical Drama. The pipeline will use your project's current lane setting. You can adjust the lane in the project page after creation.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-3 border-t border-border/30">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            size="sm" 
            onClick={onConfirm}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                Confirm & Generate
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
