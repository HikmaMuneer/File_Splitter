import { CheckCircle, Download, RotateCcw, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ResultsSectionProps {
  filename: string;
  onDownload: () => void;
  onReset: () => void;
}

export function ResultsSection({ filename, onDownload, onReset }: ResultsSectionProps) {
  return (
    <div className="bg-card rounded-lg border border-border p-6 shadow-sm fade-in" data-testid="results-section">
      <h2 className="text-lg font-semibold mb-4 text-card-foreground flex items-center gap-2">
        <CheckCircle className="w-5 h-5 text-green-600" />
        PDF Split Complete
      </h2>
      
      {/* Generated Files */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-red-600" />
            <div>
              <p className="text-sm font-medium text-card-foreground" data-testid="text-result-filename">
                {filename}
              </p>
              <p className="text-xs text-muted-foreground">
                ZIP archive containing split PDF files
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-primary hover:text-primary/80"
            onClick={onDownload}
            data-testid="button-download-file"
          >
            <Download className="w-4 h-4 mr-1" />
            Download
          </Button>
        </div>
      </div>
      
      {/* Download All Button */}
      <div className="border-t border-border pt-4">
        <Button
          className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-4 font-medium"
          onClick={onDownload}
          data-testid="button-download-all"
        >
          <Download className="w-4 h-4 mr-2" />
          Download ZIP Archive
        </Button>
      </div>
      
      {/* Start Over */}
      <div className="mt-4 text-center">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-card-foreground"
          onClick={onReset}
          data-testid="button-reset"
        >
          <RotateCcw className="w-4 h-4 mr-1" />
          Split Another PDF
        </Button>
      </div>
    </div>
  );
}
