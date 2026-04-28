import { Navigate, Route, Routes } from "react-router-dom";

import { Account } from "./pages/Account";
import { ArchiveView } from "./pages/ArchiveView";
import { Assets } from "./pages/Assets";
import { BatchOCR } from "./pages/BatchOCR";
import { Dashboard } from "./pages/Dashboard";
import { Editor } from "./pages/Editor";
import { Export } from "./pages/Export";
import { LandingUpload } from "./pages/LandingUpload";
import { Processing } from "./pages/Processing";
import { ProjectSetup } from "./pages/ProjectSetup";
import { Review } from "./pages/Review";
import { Settings } from "./pages/Settings";
import { Support } from "./pages/Support";
import { Team } from "./pages/Team";
import { Typefaces } from "./pages/Typefaces";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingUpload />} />
      <Route path="/projects" element={<Dashboard />} />
      <Route path="/projects/new" element={<ProjectSetup />} />
      <Route path="/assets" element={<Assets />} />
      <Route path="/team" element={<Team />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/batch-ocr" element={<BatchOCR />} />
      <Route path="/typefaces" element={<Typefaces />} />
      <Route path="/archive" element={<ArchiveView />} />
      <Route path="/account" element={<Account />} />
      <Route path="/support" element={<Support />} />
      <Route path="/projects/:projectId/processing" element={<Processing />} />
      <Route path="/projects/:projectId/editor" element={<Editor />} />
      <Route path="/projects/:projectId/review" element={<Review />} />
      <Route path="/projects/:projectId/export" element={<Export />} />
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}
