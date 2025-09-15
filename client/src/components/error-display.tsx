import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorDisplayProps {
  error: string;
  onDismiss: () => void;
}

export function ErrorDisplay({ error, onDismiss }: ErrorDisplayProps) {
  return (
    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 fade-in" data-testid="error-display">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
        <div className="flex-1">
          <h3 className="font-medium text-destructive mb-1">Error Processing PDF</h3>
          <p className="text-sm text-destructive/80" data-testid="text-error-message">
            {error}
          </p>
          <div className="mt-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive/80 h-auto p-0"
              onClick={onDismiss}
              data-testid="button-dismiss-error"
            >
              <X className="w-4 h-4 mr-1" />
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
