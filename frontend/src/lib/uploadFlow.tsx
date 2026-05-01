/* eslint-disable react-refresh/only-export-components */
import { createContext, type ReactNode, useContext, useMemo, useReducer } from "react";

interface UploadFlowContextValue {
  pendingFiles: File[];
  setPendingFiles: (files: File[]) => void;
  clearPendingFiles: () => void;
}

const UploadFlowContext = createContext<UploadFlowContextValue | null>(null);

function pendingFilesReducer(_current: File[], next: File[]): File[] {
  return next;
}

export function UploadFlowProvider({ children }: { children: ReactNode }) {
  const [pendingFiles, setPendingFiles] = useReducer(pendingFilesReducer, []);
  const value = useMemo(
    () => ({
      pendingFiles,
      setPendingFiles,
      clearPendingFiles: () => setPendingFiles([]),
    }),
    [pendingFiles],
  );

  return <UploadFlowContext.Provider value={value}>{children}</UploadFlowContext.Provider>;
}

export function useUploadFlow(): UploadFlowContextValue {
  const context = useContext(UploadFlowContext);
  if (!context) {
    throw new Error("useUploadFlow must be used inside UploadFlowProvider.");
  }
  return context;
}
