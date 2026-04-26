import { useRef, useState } from "react";
import { FileArchive, FileImage, FileUp, UploadCloud } from "lucide-react";

const imageTypes = ["image/png", "image/jpeg", "image/webp"];
const archiveTypes = ["application/zip", "application/x-zip-compressed"];
const acceptsPdfInMock = import.meta.env.VITE_API_MODE !== "http";

function validateFiles(files: File[]): string | null {
  if (files.length === 0) {
    return "Select at least one page or archive.";
  }

  const invalid = files.find((file) => {
    const isZip = archiveTypes.includes(file.type) || file.name.toLowerCase().endsWith(".zip");
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    return !imageTypes.includes(file.type) && !isZip && !(acceptsPdfInMock && isPdf);
  });

  if (invalid) {
    return `${invalid.name} is not supported. Use PNG, JPG, WEBP, or ZIP${acceptsPdfInMock ? ", with PDF available in mock mode" : ""}.`;
  }

  return null;
}

export function UploadDropzone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function commitFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    const validationError = validateFiles(files);
    setError(validationError);
    if (!validationError) {
      onFiles(files);
    }
  }

  return (
    <div className="w-full max-w-4xl">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          commitFiles(event.dataTransfer.files);
        }}
        className={`group relative flex min-h-[320px] w-full flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed p-8 text-center transition ${
          isDragging ? "border-secondary bg-secondary/10 shadow-cyan" : "border-ink-border-strong bg-surface-mid/80 hover:border-primary hover:shadow-glow"
        }`}
      >
        <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(139,92,246,0.14),transparent_34rem)] opacity-0 transition group-hover:opacity-100" />
        <span className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-ink-border bg-surface text-primary-soft transition group-hover:scale-105">
          <UploadCloud className="h-10 w-10" />
        </span>
        <span className="relative font-display text-2xl font-bold text-white">Drag and drop comic pages here</span>
        <span className="relative mt-2 text-sm text-text-muted">or click to browse from your device</span>
        <span className="relative mt-6 inline-flex items-center gap-2 rounded-instrument bg-primary px-5 py-3 text-sm font-bold text-white shadow-glow">
          <FileUp className="h-4 w-4" />
          Upload comic pages
        </span>
        <span className="relative mt-8 flex flex-wrap justify-center gap-2 border-t border-ink-border pt-5 text-xs font-bold uppercase tracking-normal text-text-muted">
          {[
            ["PNG", FileImage],
            ["JPG", FileImage],
            ["WEBP", FileImage],
            ["ZIP", FileArchive],
            ["PDF", FileUp],
          ].map(([label, Icon]) => (
            <span key={label as string} className="inline-flex items-center gap-1 rounded-instrument bg-surface-high px-2.5 py-1 text-text-main">
              <Icon className="h-3.5 w-3.5" />
              {label as string}
            </span>
          ))}
        </span>
      </button>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        multiple
        accept=".png,.jpg,.jpeg,.webp,.zip,.pdf,image/png,image/jpeg,image/webp,application/zip,application/pdf"
        onChange={(event) => {
          if (event.target.files) {
            commitFiles(event.target.files);
          }
        }}
      />
      {error ? <p className="mt-3 text-sm font-semibold text-danger">{error}</p> : null}
    </div>
  );
}
