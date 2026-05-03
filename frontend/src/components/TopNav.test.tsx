import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { TopNav } from "./TopNav";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderTopNav(path = "/projects") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TopNav />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("TopNav", () => {
  it("searches projects and clears menus on route changes", async () => {
    renderTopNav();

    fireEvent.click(screen.getByLabelText("Notifications"));
    expect(screen.getByText("No new workspace notifications.")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search projects..."), {
      target: { value: "Project Alpha" },
    });
    fireEvent.submit(screen.getByRole("search"));

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/projects?search=Project%20Alpha",
      ),
    );
    expect(screen.queryByText("No new workspace notifications.")).not.toBeInTheDocument();
  });

  it("opens and dismisses help and share popovers", () => {
    renderTopNav();

    fireEvent.click(screen.getByLabelText("Help"));
    expect(screen.getByText("Workspace settings")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Workspace settings")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(screen.getByText("Coming Soon")).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByText("Coming Soon")).not.toBeInTheDocument();
  });

  it("routes the new project button and empty search to the intended pages", async () => {
    renderTopNav("/settings");

    fireEvent.click(screen.getByLabelText("New project"));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/"));

    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/projects"));
  });
});
