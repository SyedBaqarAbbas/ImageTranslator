import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: {
    getRuntimeLanguage: vi.fn(),
    listProjects: vi.fn(),
    createProject: vi.fn(),
    updateSettings: vi.fn(),
    uploadPages: vi.fn(),
    processProject: vi.fn(),
  },
  uploadFlow: {
    pendingFiles: [] as File[],
    setPendingFiles: vi.fn(),
    clearPendingFiles: vi.fn(),
  },
}));

vi.mock("../api", () => ({
  api: mocks.api,
  queryKeys: {
    runtimeLanguage: ["runtime-language"],
    projects: ["projects"],
  },
}));

vi.mock("../lib/uploadFlow", () => ({
  useUploadFlow: () => mocks.uploadFlow,
}));

import { ProjectSetup } from "./ProjectSetup";
import { Settings } from "./Settings";

const runtimeLanguage = {
  source_language: "ko",
  target_language: "en",
  provider: "opus_mt",
  locked: true,
  lock_message: "Ask a system administrator to change the language.",
};

function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("locked language UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.api.getRuntimeLanguage.mockResolvedValue(runtimeLanguage);
    mocks.api.listProjects.mockResolvedValue([]);
    mocks.api.createProject.mockResolvedValue({ id: "project-runtime" });
    mocks.api.updateSettings.mockResolvedValue({});
    mocks.api.uploadPages.mockResolvedValue([]);
    mocks.api.processProject.mockResolvedValue({});
    mocks.uploadFlow.pendingFiles = [];
  });

  it("shows disabled runtime language controls in settings", async () => {
    renderWithProviders(<Settings />);

    const sourceSelect = await screen.findByLabelText("Source language");
    const targetSelect = screen.getByLabelText("Target language");

    await waitFor(() => expect(sourceSelect).toHaveValue("ko"));
    expect(sourceSelect).toBeDisabled();
    expect(targetSelect).toBeDisabled();
    expect(targetSelect).toHaveValue("en");
    expect(screen.getAllByTitle("Ask a system administrator to change the language.")).toHaveLength(2);
  });

  it("creates projects with the runtime language pair", async () => {
    mocks.uploadFlow.pendingFiles = [new File(["zip"], "chapter.zip", { type: "application/zip" })];
    renderWithProviders(<ProjectSetup />);

    const startButton = await screen.findByRole("button", { name: /start ai processing/i });
    await waitFor(() => expect(startButton).not.toBeDisabled());
    fireEvent.click(startButton);

    await waitFor(() =>
      expect(mocks.api.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          source_language: "ko",
          target_language: "en",
        }),
      ),
    );
    expect(mocks.api.updateSettings).toHaveBeenCalledWith(
      "project-runtime",
      expect.objectContaining({
        source_language: "ko",
        target_language: "en",
      }),
    );
  });
});
