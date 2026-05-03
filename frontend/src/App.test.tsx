import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("./pages/Account", () => ({ Account: () => <h1>Account Page</h1> }));
vi.mock("./pages/ArchiveView", () => ({ ArchiveView: () => <h1>Archive Page</h1> }));
vi.mock("./pages/Assets", () => ({ Assets: () => <h1>Assets Page</h1> }));
vi.mock("./pages/BatchOCR", () => ({ BatchOCR: () => <h1>Batch OCR Page</h1> }));
vi.mock("./pages/Dashboard", () => ({ Dashboard: () => <h1>Dashboard Page</h1> }));
vi.mock("./pages/Editor", () => ({ Editor: () => <h1>Editor Page</h1> }));
vi.mock("./pages/Export", () => ({ Export: () => <h1>Export Page</h1> }));
vi.mock("./pages/LandingUpload", () => ({ LandingUpload: () => <h1>Landing Page</h1> }));
vi.mock("./pages/Processing", () => ({ Processing: () => <h1>Processing Page</h1> }));
vi.mock("./pages/ProjectSetup", () => ({ ProjectSetup: () => <h1>Project Setup Page</h1> }));
vi.mock("./pages/Review", () => ({ Review: () => <h1>Review Page</h1> }));
vi.mock("./pages/Settings", () => ({ Settings: () => <h1>Settings Page</h1> }));
vi.mock("./pages/Support", () => ({ Support: () => <h1>Support Page</h1> }));
vi.mock("./pages/Typefaces", () => ({ Typefaces: () => <h1>Typefaces Page</h1> }));

import App from "./App";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("App routes", () => {
  it.each([
    ["/", "Landing Page"],
    ["/projects", "Dashboard Page"],
    ["/projects/new", "Project Setup Page"],
    ["/assets", "Assets Page"],
    ["/settings", "Settings Page"],
    ["/batch-ocr", "Batch OCR Page"],
    ["/typefaces", "Typefaces Page"],
    ["/archive", "Archive Page"],
    ["/account", "Account Page"],
    ["/support", "Support Page"],
    ["/projects/project-1/processing", "Processing Page"],
    ["/projects/project-1/editor", "Editor Page"],
    ["/projects/project-1/review", "Review Page"],
    ["/projects/project-1/export", "Export Page"],
  ])("renders %s", (path, heading) => {
    renderApp(path);

    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(path);
  });

  it.each(["/team", "/unknown/path"])("redirects %s to projects", async (path) => {
    renderApp(path);

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/projects"));
    expect(screen.getByRole("heading", { name: "Dashboard Page" })).toBeInTheDocument();
  });
});
