import type { PageRead } from "../types/api";

type PageAssetPreference = "original" | "editable" | "cleaned" | "preview" | "final";

export function assetUrlForPage(page: PageRead | undefined, preference: PageAssetPreference = "preview"): string | undefined {
  if (!page) {
    return undefined;
  }

  const candidates =
    preference === "original"
      ? [page.original_asset, page.cleaned_asset, page.preview_asset, page.final_asset]
      : preference === "editable"
        ? [page.original_asset]
      : preference === "cleaned"
        ? [page.cleaned_asset, page.original_asset]
      : preference === "final"
        ? [page.final_asset, page.preview_asset, page.cleaned_asset, page.original_asset]
        : [page.preview_asset, page.final_asset, page.cleaned_asset, page.original_asset];

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
