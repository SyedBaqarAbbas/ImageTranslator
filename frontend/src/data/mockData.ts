import type {
  AssetRead,
  PageRead,
  ProjectDetail,
  TextRegionRead,
  TranslationSettingsRead,
} from "../types/api";

const userId = "mock-user-1";

export function iso(offsetMinutes = 0): string {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString();
}

export function createAsset(params: {
  id: string;
  projectId: string;
  pageId?: string | null;
  kind: string;
  filename: string;
  url: string;
  width?: number;
  height?: number;
}): AssetRead {
  const contentType = params.filename.endsWith(".zip")
    ? "application/zip"
    : params.filename.endsWith(".pdf")
      ? "application/pdf"
      : "image/png";

  return {
    id: params.id,
    user_id: userId,
    project_id: params.projectId,
    page_id: params.pageId ?? null,
    kind: params.kind,
    storage_backend: "mock",
    bucket: null,
    key: `mock/${params.projectId}/${params.filename}`,
    filename: params.filename,
    content_type: contentType,
    size_bytes: 182_000,
    checksum: null,
    width: params.width ?? 920,
    height: params.height ?? 1320,
    url: params.url,
    created_at: iso(-800),
    updated_at: iso(-800),
  };
}

export function comicPageDataUri(title: string, accent = "#22D3EE", translatedText = true, marker = ""): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 1320">
      ${marker ? `<desc>${marker}</desc>` : ""}
      <rect width="920" height="1320" fill="#f4f0e7"/>
      <rect x="52" y="54" width="816" height="1212" fill="#ffffff" stroke="#171717" stroke-width="12"/>
      <g stroke="#171717" stroke-width="9" fill="none">
        <path d="M90 105h340v315H90zM470 105h360v180H470zM470 315h360v365H470zM90 455h340v225H90zM90 715h740v500H90z"/>
        <path d="M120 145c72 30 149 23 241-16M512 360c96 22 182 13 270-33M140 780c130 46 256 39 390-20"/>
        <path d="M145 205l215 160M508 160l295 96M138 540l230 102M126 1132l675-316"/>
      </g>
      <g fill="#111827">
        <ellipse cx="235" cy="177" rx="100" ry="46"/>
        <ellipse cx="669" cy="381" rx="118" ry="52"/>
        <ellipse cx="285" cy="822" rx="132" ry="54"/>
      </g>
      <g fill="#fff">
        <ellipse cx="228" cy="170" rx="98" ry="45"/>
        <ellipse cx="662" cy="374" rx="116" ry="51"/>
        <ellipse cx="278" cy="815" rx="130" ry="53"/>
      </g>
      ${
        translatedText
          ? `<g fill="#111827" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle">
        <text x="228" y="164" font-size="25">Where did</text>
        <text x="228" y="195" font-size="25">the signal go?</text>
        <text x="662" y="369" font-size="26">Keep moving.</text>
        <text x="662" y="402" font-size="21">We are exposed.</text>
        <text x="278" y="812" font-size="28">Not yet!</text>
      </g>`
          : ""
      }
      <g fill="${accent}" opacity=".72">
        <path d="M613 615l172-56-126 130 156 8-221 95 93-108-154-4z"/>
        <path d="M124 1002l169-58-77 102 137-12-243 152 90-122-136 12z"/>
      </g>
      <text x="460" y="1260" font-family="Arial, sans-serif" font-size="34" font-weight="800" text-anchor="middle" fill="#111827">${title}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export interface MockStore {
  projects: ProjectDetail[];
  settings: TranslationSettingsRead[];
  pages: PageRead[];
  regions: TextRegionRead[];
}

export function seedMockStore(): MockStore {
  const cyberOriginalImage = comicPageDataUri("CYBER NEON", "#22D3EE", false);
  const cyberCleanedImage = comicPageDataUri("CYBER NEON", "#22D3EE", false, "cleaned-editor-mask");
  const cyberPreviewImage = comicPageDataUri("CYBER NEON", "#22D3EE");
  const samuraiOriginalImage = comicPageDataUri("SAMURAI ECHOES", "#FFB869", false);
  const samuraiFinalImage = comicPageDataUri("SAMURAI ECHOES", "#FFB869");
  const cyberOriginalAsset = createAsset({
    id: "asset-cyber-original",
    projectId: "project-cyber",
    pageId: "page-cyber-1",
    kind: "original",
    filename: "cyber-neon-original.png",
    url: cyberOriginalImage,
  });
  const cyberAsset = createAsset({
    id: "asset-cyber-1",
    projectId: "project-cyber",
    pageId: "page-cyber-1",
    kind: "preview",
    filename: "cyber-neon-preview.png",
    url: cyberPreviewImage,
  });
  const cyberCleanedAsset = createAsset({
    id: "asset-cyber-cleaned",
    projectId: "project-cyber",
    pageId: "page-cyber-1",
    kind: "cleaned",
    filename: "cyber-neon-cleaned.png",
    url: cyberCleanedImage,
  });
  const samuraiOriginalAsset = createAsset({
    id: "asset-samurai-original",
    projectId: "project-samurai",
    pageId: "page-samurai-1",
    kind: "original",
    filename: "samurai-echoes-original.png",
    url: samuraiOriginalImage,
  });
  const samuraiAsset = createAsset({
    id: "asset-samurai-1",
    projectId: "project-samurai",
    pageId: "page-samurai-1",
    kind: "final",
    filename: "samurai-echoes-final.png",
    url: samuraiFinalImage,
  });

  const settings: TranslationSettingsRead[] = [
    {
      id: "settings-cyber",
      project_id: "project-cyber",
      source_language: "ja",
      target_language: "en",
      translation_tone: "natural",
      replacement_mode: "replace",
      reading_direction: "rtl",
      preserve_sfx: true,
      bilingual: false,
      font_family: "Anime Ace",
      notes: "Prioritize concise dialogue.",
      created_at: iso(-6000),
      updated_at: iso(-35),
    },
    {
      id: "settings-samurai",
      project_id: "project-samurai",
      source_language: "ja",
      target_language: "en",
      translation_tone: "dramatic",
      replacement_mode: "replace",
      reading_direction: "rtl",
      preserve_sfx: true,
      bilingual: false,
      font_family: "Wild Words",
      notes: null,
      created_at: iso(-7200),
      updated_at: iso(-480),
    },
  ];

  const projects: ProjectDetail[] = [
    {
      id: "project-cyber",
      user_id: userId,
      name: "Cyber Neon Vol. 1",
      description: "Night-city scanlation batch with dense dialogue.",
      source_language: "ja",
      target_language: "en",
      translation_tone: "natural",
      replacement_mode: "replace",
      reading_direction: "rtl",
      status: "review_required",
      failure_reason: null,
      settings: settings[0],
      created_at: iso(-6000),
      updated_at: iso(-35),
    },
    {
      id: "project-samurai",
      user_id: userId,
      name: "Samurai Echoes",
      description: "Finished chapter export ready for release.",
      source_language: "ja",
      target_language: "en",
      translation_tone: "dramatic",
      replacement_mode: "replace",
      reading_direction: "rtl",
      status: "export_ready",
      failure_reason: null,
      settings: settings[1],
      created_at: iso(-7200),
      updated_at: iso(-480),
    },
  ];

  const pages: PageRead[] = [
    {
      id: "page-cyber-1",
      project_id: "project-cyber",
      page_number: 1,
      original_asset_id: "asset-cyber-original",
      processed_asset_id: "asset-cyber-original",
      cleaned_asset_id: "asset-cyber-cleaned",
      preview_asset_id: "asset-cyber-1",
      final_asset_id: null,
      width: 920,
      height: 1320,
      status: "review_required",
      progress: 92,
      failure_reason: null,
      original_asset: cyberOriginalAsset,
      cleaned_asset: cyberCleanedAsset,
      preview_asset: cyberAsset,
      final_asset: null,
      created_at: iso(-5990),
      updated_at: iso(-35),
    },
    {
      id: "page-samurai-1",
      project_id: "project-samurai",
      page_number: 1,
      original_asset_id: "asset-samurai-original",
      processed_asset_id: "asset-samurai-original",
      cleaned_asset_id: null,
      preview_asset_id: "asset-samurai-1",
      final_asset_id: "asset-samurai-1",
      width: 920,
      height: 1320,
      status: "completed",
      progress: 100,
      failure_reason: null,
      original_asset: samuraiOriginalAsset,
      cleaned_asset: null,
      preview_asset: samuraiAsset,
      final_asset: samuraiAsset,
      created_at: iso(-7190),
      updated_at: iso(-480),
    },
  ];

  const regions: TextRegionRead[] = [
    {
      id: "region-cyber-1",
      page_id: "page-cyber-1",
      region_index: 1,
      region_type: "speech",
      bounding_box: { x: 126, y: 126, width: 210, height: 106 },
      polygon: null,
      detected_text: "信号はどこへ消えた?",
      detected_language: "ja",
      translated_text: "Where did the signal go?",
      user_text: null,
      ocr_confidence: 0.91,
      translation_confidence: 0.88,
      render_style: { fontSize: 26, fontFamily: "Anime Ace" },
      editable: true,
      status: "translated",
      failure_reason: null,
      created_at: iso(-5800),
      updated_at: iso(-35),
    },
    {
      id: "region-cyber-2",
      page_id: "page-cyber-1",
      region_index: 2,
      region_type: "speech",
      bounding_box: { x: 540, y: 322, width: 245, height: 116 },
      polygon: null,
      detected_text: "進め。",
      detected_language: "ja",
      translated_text: "Keep moving. We are exposed.",
      user_text: null,
      ocr_confidence: 0.79,
      translation_confidence: 0.71,
      render_style: { fontSize: 22, fontFamily: "Anime Ace" },
      editable: true,
      status: "needs_review",
      failure_reason: null,
      created_at: iso(-5795),
      updated_at: iso(-35),
    },
    {
      id: "region-samurai-1",
      page_id: "page-samurai-1",
      region_index: 1,
      region_type: "caption",
      bounding_box: { x: 110, y: 760, width: 360, height: 132 },
      polygon: null,
      detected_text: "まだだ。",
      detected_language: "ja",
      translated_text: "Not yet!",
      user_text: "Not yet!",
      ocr_confidence: 0.96,
      translation_confidence: 0.94,
      render_style: { fontSize: 32, fontFamily: "Wild Words" },
      editable: true,
      status: "rendered",
      failure_reason: null,
      created_at: iso(-7000),
      updated_at: iso(-480),
    },
  ];

  return { projects, settings, pages, regions };
}
