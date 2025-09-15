import { useRef } from "react";
import { Upload, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileUploadProps {
  selectedFile: File | null;
  onFileSelect: (file: File) => void;
  onRemoveFile: () => void;
}

export function FileUpload({ selectedFile, onFileSelect, onRemoveFile }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === "application/pdf") {
      onFileSelect(file);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.type === "application/pdf") {
      onFileSelect(file);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
      <h2 className="text-lg font-semibold mb-4 text-card-foreground">Upload PDF File</h2>
      
      <div
        className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer transition-all duration-200 hover:border-primary hover:bg-primary/5"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={handleClick}
        data-testid="file-upload-area"
      >
        <div className="max-w-sm mx-auto">
          <Upload className="w-12 h-12 text-muted-foreground mb-4 mx-auto" />
          <h3 className="text-lg font-medium text-card-foreground mb-2">Upload your PDF</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Drag and drop your PDF file here, or click to select
          </p>
          <Button
            type="button"
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            data-testid="button-select-file"
          >
            Select File
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleFileChange}
        className="hidden"
        data-testid="input-file"
      />

      {selectedFile && (
        <div className="mt-4 p-4 bg-muted rounded-lg fade-in" data-testid="selected-file-preview">
          <div className="flex items-center gap-3">
            <FileText className="text-red-600 text-xl" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-card-foreground truncate" data-testid="text-filename">
                {selectedFile.name}
              </p>
              <p className="text-xs text-muted-foreground" data-testid="text-filesize">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={onRemoveFile}
              data-testid="button-remove-file"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
