import { Scissors, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface SplitInstructionsProps {
  instructions: string;
  onChange: (value: string) => void;
  onSplit: () => void;
  disabled: boolean;
}

export function SplitInstructions({ instructions, onChange, onSplit, disabled }: SplitInstructionsProps) {
  return (
    <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
      <h2 className="text-lg font-semibold mb-4 text-card-foreground">Split Instructions</h2>
      
      <div className="space-y-4">
        <div>
          <Label htmlFor="instructions" className="block text-sm font-medium text-card-foreground mb-2">
            Page Instructions
          </Label>
          <Textarea
            id="instructions"
            placeholder="Enter page ranges or individual pages&#10;Examples:&#10;1-3, 5-7, 10-15&#10;1, 3, 5, 8&#10;2-4, 7, 9-12"
            className="w-full p-3 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-ring resize-none"
            rows={4}
            value={instructions}
            onChange={(e) => onChange(e.target.value)}
            data-testid="input-instructions"
          />
        </div>
        
        {/* Examples and Help */}
        <div className="bg-muted rounded-lg p-4">
          <h3 className="text-sm font-medium text-card-foreground mb-2">Supported Formats:</h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Circle className="w-2 h-2 text-primary fill-current" />
              <span><strong>Page ranges:</strong> 1-3, 5-7, 10-15</span>
            </div>
            <div className="flex items-center gap-2">
              <Circle className="w-2 h-2 text-primary fill-current" />
              <span><strong>Individual pages:</strong> 1, 3, 5, 8</span>
            </div>
            <div className="flex items-center gap-2">
              <Circle className="w-2 h-2 text-primary fill-current" />
              <span><strong>Mixed format:</strong> 2-4, 7, 9-12</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Split Button */}
      <div className="mt-6">
        <Button
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-3 px-4 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={onSplit}
          disabled={disabled}
          data-testid="button-split-pdf"
        >
          <Scissors className="w-4 h-4 mr-2" />
          Split PDF
        </Button>
      </div>
    </div>
  );
}
