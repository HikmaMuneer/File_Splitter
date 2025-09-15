import { Loader2 } from "lucide-react";

interface ProcessingStatusProps {
  progress: number;
  instructions: string;
}

export function ProcessingStatus({ progress, instructions }: ProcessingStatusProps) {
  return (
    <div className="bg-card rounded-lg border border-border p-6 shadow-sm fade-in" data-testid="processing-status">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <div>
            <h3 className="font-medium text-card-foreground">Processing PDF...</h3>
            <p className="text-sm text-muted-foreground">Splitting pages according to your instructions</p>
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="w-full bg-muted rounded-full h-2">
          <div 
            className="bg-primary h-2 rounded-full transition-all duration-300 ease-in-out" 
            style={{ width: `${progress}%` }}
            data-testid="progress-bar"
          />
        </div>
        
        <p className="text-xs text-muted-foreground text-center" data-testid="text-status-message">
          Processing page ranges: {instructions}
        </p>
      </div>
    </div>
  );
}
