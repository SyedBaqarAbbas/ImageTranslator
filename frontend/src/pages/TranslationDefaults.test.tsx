import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_TRANSLATION_DEFAULTS,
  TRANSLATION_DEFAULTS_STORAGE_KEY,
  type TranslationDefaults,
} from "../lib/translationDefaults";

const mocks = vi.hoisted(() => ({
  api: {
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
    projects: ["projects"],
  },
}));

vi.mock("../lib/uploadFlow", () => ({
  useUploadFlow: () => mocks.uploadFlow,
}));

import { ProjectSetup } from "./ProjectSetup";
import { Settings } from "./Settings";

function renderWithProviders(ui: ReactElement, initialEntries = ["/settings"]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

function storeDefaults(patch: Partial<TranslationDefaults>) {
  window.localStorage.setItem(
    TRANSLATION_DEFAULTS_STORAGE_KEY,
    JSON.stringify({
      ...DEFAULT_TRANSLATION_DEFAULTS,
      ...patch,
    }),
  );
}

describe("translation defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.api.listProjects.mockResolvedValue([]);
    mocks.api.createProject.mockResolvedValue({ id: "project-defaults" });
    mocks.api.updateSettings.mockResolvedValue({});
    mocks.api.uploadPages.mockResolvedValue([]);
    mocks.api.processProject.mockResolvedValue({});
    mocks.uploadFlow.pendingFiles = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("persists settings defaults and reloads them into controlled controls", async () => {
    const { unmount } = renderWithProviders(<Settings />);

    fireEvent.change(screen.getByLabelText("Source language"), { target: { value: "ja" } });
    fireEvent.change(screen.getByLabelText("Target language"), { target: { value: "fr" } });
    fireEvent.change(screen.getByLabelText("Tone"), { target: { value: "dramatic" } });
    fireEvent.change(screen.getByLabelText("Replacement"), { target: { value: "bilingual" } });
    fireEvent.change(screen.getByLabelText("Reading"), { target: { value: "ltr" } });
    fireEvent.click(screen.getByLabelText("Auto-start processing"));
    fireEvent.click(screen.getByLabelText("Preserve SFX"));
    fireEvent.click(screen.getByRole("button", { name: /high quality/i }));
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    await screen.findByText("Saved for new projects");
    expect(JSON.parse(window.localStorage.getItem(TRANSLATION_DEFAULTS_STORAGE_KEY) ?? "{}")).toMatchObject({
      sourceLanguage: "ja",
      targetLanguage: "fr",
      tone: "dramatic",
      replacementMode: "bilingual",
      readingDirection: "ltr",
      preserveSfx: false,
      autoStartProcessing: false,
      qualityMode: "high",
    });

    unmount();
    renderWithProviders(<Settings />);

    expect(screen.getByLabelText("Source language")).toHaveValue("ja");
    expect(screen.getByLabelText("Target language")).toHaveValue("fr");
    expect(screen.getByLabelText("Tone")).toHaveValue("dramatic");
    expect(screen.getByLabelText("Replacement")).toHaveValue("bilingual");
    expect(screen.getByLabelText("Reading")).toHaveValue("ltr");
    expect(screen.getByLabelText("Auto-start processing")).not.toBeChecked();
    expect(screen.getByLabelText("Preserve SFX")).not.toBeChecked();
    expect(screen.getByRole("button", { name: /high quality/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows an error when browser storage rejects a save", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    renderWithProviders(<Settings />);

    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    expect(screen.getByText("Unable to save defaults. Check browser storage permissions.")).toBeInTheDocument();
  });

  it("resets saved defaults back to the built-in project setup values", () => {
    storeDefaults({ sourceLanguage: "ko", targetLanguage: "es", tone: "literal", qualityMode: "high" });
    renderWithProviders(<Settings />);

    fireEvent.click(screen.getByRole("button", { name: /reset defaults/i }));

    expect(screen.getByText("Defaults reset")).toBeInTheDocument();
    expect(window.localStorage.getItem(TRANSLATION_DEFAULTS_STORAGE_KEY)).toBeNull();
    expect(screen.getByLabelText("Source language")).toHaveValue(DEFAULT_TRANSLATION_DEFAULTS.sourceLanguage);
    expect(screen.getByLabelText("Target language")).toHaveValue(DEFAULT_TRANSLATION_DEFAULTS.targetLanguage);
    expect(screen.getByLabelText("Tone")).toHaveValue(DEFAULT_TRANSLATION_DEFAULTS.tone);
    expect(screen.getByRole("button", { name: /balanced quality/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("creates new projects from saved defaults", async () => {
    storeDefaults({
      sourceLanguage: "ko",
      targetLanguage: "es",
      tone: "localized",
      replacementMode: "bilingual",
      readingDirection: "ltr",
      preserveSfx: false,
      autoStartProcessing: false,
      qualityMode: "high",
    });
    mocks.uploadFlow.pendingFiles = [new File(["zip"], "chapter.zip", { type: "application/zip" })];
    renderWithProviders(<ProjectSetup />, ["/projects/new"]);

    expect(screen.getByLabelText("Source")).toHaveValue("ko");
    expect(screen.getByLabelText("Target")).toHaveValue("es");
    expect(screen.getByLabelText("Tone")).toHaveValue("localized");
    expect(screen.getByLabelText("Replacement")).toHaveValue("bilingual");
    expect(screen.getByLabelText("Reading")).toHaveValue("ltr");
    expect(screen.getByLabelText("Preserve SFX")).not.toBeChecked();
    expect(screen.getByLabelText("Auto-start processing")).not.toBeChecked();
    expect(screen.getByRole("button", { name: /high quality/i })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /create project/i }));

    await waitFor(() =>
      expect(mocks.api.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          source_language: "ko",
          target_language: "es",
          translation_tone: "localized",
          replacement_mode: "bilingual",
          reading_direction: "ltr",
        }),
      ),
    );
    expect(mocks.api.updateSettings).toHaveBeenCalledWith(
      "project-defaults",
      expect.objectContaining({
        source_language: "ko",
        target_language: "es",
        translation_tone: "localized",
        replacement_mode: "bilingual",
        reading_direction: "ltr",
        preserve_sfx: false,
        bilingual: true,
      }),
    );
    expect(mocks.api.processProject).not.toHaveBeenCalled();
    expect(mocks.uploadFlow.clearPendingFiles).toHaveBeenCalled();
  });
});
