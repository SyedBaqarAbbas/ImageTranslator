import type { PageRead } from "../types/api";

export function assetUrlForPage(page: PageRead | undefined, preference: "original" | "preview" | "final" = "preview"): string | undefined {
  if (!page) {
    return undefined;
  }

  const candidates =
    preference === "original"
      ? [page.original_asset, page.preview_asset, page.final_asset]
      : preference === "final"
        ? [page.final_asset, page.preview_asset, page.original_asset]
        : [page.preview_asset, page.final_asset, page.original_asset];

  return candidates.find((asset) => asset?.url)?.url;
}

export function downloadUrlForAsset(asset: { url?: string; key?: string } | null | undefined): string | undefined {
  if (asset?.url) {
    return asset.url;
  }

  if (asset?.key) {
    return `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1"}/assets/by-key/${asset.key}`;
  }

  return undefined;
}
