import { describe, expect, it } from "vitest";

import { assetUrlForPage, downloadUrlForAsset } from "./assets";
import type { AssetRead, PageRead } from "../types/api";

const asset = (id: string, url?: string): AssetRead => ({
  id,
  user_id: "user-1",
  project_id: "project-1",
  page_id: "page-1",
  kind: "preview",
  storage_backend: "local",
  bucket: null,
  key: `projects/project-1/${id}.png`,
  filename: `${id}.png`,
  content_type: "image/png",
  size_bytes: 10,
  checksum: null,
  width: 10,
  height: 10,
  url,
  created_at: "2026-05-03T00:00:00Z",
  updated_at: "2026-05-03T00:00:00Z",
});

const page: PageRead = {
  id: "page-1",
  project_id: "project-1",
  page_number: 1,
  original_asset_id: "original",
  processed_asset_id: null,
  cleaned_asset_id: "cleaned",
  preview_asset_id: "preview",
  final_asset_id: "final",
  width: 10,
  height: 10,
  status: "uploaded",
  progress: 0,
  failure_reason: null,
  original_asset: asset("original", "original-url"),
  cleaned_asset: asset("cleaned", "cleaned-url"),
  preview_asset: asset("preview", "preview-url"),
  final_asset: asset("final", "final-url"),
  created_at: "2026-05-03T00:00:00Z",
  updated_at: "2026-05-03T00:00:00Z",
};

describe("asset URL helpers", () => {
  it("selects the correct asset by preference with fallbacks", () => {
    expect(assetUrlForPage(undefined)).toBeUndefined();
    expect(assetUrlForPage(page)).toBe("preview-url");
    expect(assetUrlForPage(page, "original")).toBe("original-url");
    expect(assetUrlForPage(page, "editable")).toBe("original-url");
    expect(assetUrlForPage(page, "cleaned")).toBe("cleaned-url");
    expect(assetUrlForPage(page, "final")).toBe("final-url");
    expect(assetUrlForPage({ ...page, preview_asset: null })).toBe("final-url");
    expect(assetUrlForPage({ ...page, cleaned_asset: null }, "cleaned")).toBe("original-url");
  });

  it("builds download URLs from hydrated URLs or storage keys", () => {
    expect(downloadUrlForAsset(null)).toBeUndefined();
    expect(downloadUrlForAsset({ url: "ready-url" })).toBe("ready-url");
    expect(downloadUrlForAsset({ key: "projects/project-1/final/page.png" })).toBe(
      "http://localhost:8000/api/v1/assets/by-key/projects/project-1/final/page.png",
    );
  });
});
