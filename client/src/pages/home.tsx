import { useState } from "react";
import { FileUpload } from "@/components/file-upload";
import { SplitInstructions } from "@/components/split-instructions";
import { ProcessingStatus } from "@/components/processing-status";
import { ResultsSection } from "@/components/results-section";
import { ErrorDisplay } from "@/components/error-display";
import { FileText } from "lucide-react";

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [instructions, setInstructions] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [resultFilename, setResultFilename] = useState<string | null>(null);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setError(null);
    setDownloadUrl(null);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setDownloadUrl(null);
  };

  const handleInstructionsChange = (value: string) => {
    setInstructions(value);
    setError(null);
  };

  const handleSplit = async () => {
    if (!selectedFile || !instructions.trim()) {
      setError("Please select a PDF file and enter splitting instructions");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append("pdf", selectedFile);
      formData.append("instructions", instructions);

      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const response = await fetch("/api/split-pdf", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to split PDF");
      }

      // Create download URL from response blob
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      
      // Get filename from response headers or generate one
      const contentDisposition = response.headers.get("content-disposition");
      const filename = contentDisposition
        ? contentDisposition.split("filename=")[1]?.replace(/"/g, "")
        : `${selectedFile.name.replace('.pdf', '')}-split.zip`;
      
      setResultFilename(filename);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred while processing the PDF");
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setInstructions("");
    setIsProcessing(false);
    setProgress(0);
    setError(null);
    setDownloadUrl(null);
    setResultFilename(null);
  };

  const handleDownload = () => {
    if (downloadUrl && resultFilename) {
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = resultFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <FileText className="text-primary-foreground text-lg" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-card-foreground">PDF Splitter</h1>
              <p className="text-sm text-muted-foreground">Split PDF files by page ranges or individual pages</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid gap-8">
          <FileUpload
            selectedFile={selectedFile}
            onFileSelect={handleFileSelect}
            onRemoveFile={handleRemoveFile}
          />

          <SplitInstructions
            instructions={instructions}
            onChange={handleInstructionsChange}
            onSplit={handleSplit}
            disabled={!selectedFile || !instructions.trim() || isProcessing}
          />

          {isProcessing && (
            <ProcessingStatus progress={progress} instructions={instructions} />
          )}

          {error && (
            <ErrorDisplay error={error} onDismiss={() => setError(null)} />
          )}

          {downloadUrl && (
            <ResultsSection
              filename={resultFilename || "split-files.zip"}
              onDownload={handleDownload}
              onReset={handleReset}
            />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card mt-16">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
            <p>© 2024 PDF Splitter. Process files securely in your browser.</p>
            <div className="flex items-center gap-4">
              <a href="#" className="hover:text-card-foreground transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-card-foreground transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-card-foreground transition-colors">Help</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
