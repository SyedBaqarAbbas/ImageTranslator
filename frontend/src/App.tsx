import { Navigate, Route, Routes } from "react-router-dom";

import { Dashboard } from "./pages/Dashboard";
import { Editor } from "./pages/Editor";
import { Export } from "./pages/Export";
import { LandingUpload } from "./pages/LandingUpload";
import { Processing } from "./pages/Processing";
import { ProjectSetup } from "./pages/ProjectSetup";
import { Review } from "./pages/Review";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingUpload />} />
      <Route path="/projects" element={<Dashboard />} />
      <Route path="/projects/new" element={<ProjectSetup />} />
      <Route path="/projects/:projectId/processing" element={<Processing />} />
      <Route path="/projects/:projectId/editor" element={<Editor />} />
      <Route path="/projects/:projectId/review" element={<Review />} />
      <Route path="/projects/:projectId/export" element={<Export />} />
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}
