import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UploadFlowProvider, useUploadFlow } from "./uploadFlow";

function UploadFlowProbe() {
  const { pendingFiles, setPendingFiles, clearPendingFiles } = useUploadFlow();
  return (
    <div>
      <p>Files: {pendingFiles.map((file) => file.name).join(", ") || "none"}</p>
      <button
        type="button"
        onClick={() => setPendingFiles([new File(["page"], "page.png", { type: "image/png" })])}
      >
        Set files
      </button>
      <button type="button" onClick={clearPendingFiles}>
        Clear files
      </button>
    </div>
  );
}

function BrokenConsumer() {
  useUploadFlow();
  return <div>unreachable</div>;
}

describe("UploadFlowProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores and clears pending files for the setup flow", async () => {
    render(
      <UploadFlowProvider>
        <UploadFlowProbe />
      </UploadFlowProvider>,
    );

    expect(screen.getByText("Files: none")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Set files" }));
    expect(screen.getByText("Files: page.png")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear files" }));
    expect(screen.getByText("Files: none")).toBeInTheDocument();
  });

  it("fails fast when the hook is used outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => render(<BrokenConsumer />)).toThrow("useUploadFlow must be used inside UploadFlowProvider.");
  });
});
