import { ArrowLeft, Columns2, Download, Minus, Plus, RotateCcw, Save, ScanText, SquarePlus, Undo2 } from "lucide-react";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { api, queryKeys } from "../api";
import { CanvasWorkspace } from "../components/CanvasWorkspace";
import { RegionPanel } from "../components/RegionPanel";
import type { RegionOcrFeedback, RegionRetranslateFeedback, RegionRetranslateSource, RegionSaveAction, RegionSaveFeedback } from "../components/RegionPanel";
import { ErrorState, LoadingState } from "../components/States";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { assetUrlForPage } from "../lib/assets";
import {
  OCR_JOB_TIMEOUT_MESSAGE,
  RETRANSLATE_JOB_TIMEOUT_MESSAGE,
  isOcrJobPollingTimeoutError,
  isRetranslateJobPollingTimeoutError,
  waitForSuccessfulOcrJob,
  waitForSuccessfulRetranslateJob,
} from "../lib/retranslateJob";
import type { BoundingBox, TextRegionRead, TextRegionUpdate } from "../types/api";

type EditorMode = "original" | "translated";
type EditorTool = "select" | "addText" | "highlight_ocr";
type EditorSaveAction = RegionSaveAction | "workspace";

interface EditorState {
  selectedPageId?: string;
  selectedRegionId?: string;
  mode: EditorMode;
  tool: EditorTool;
  comparison: boolean;
  comparisonSplit: number;
  zoom: number;
  workspaceStatus: string;
  styleDrafts: Record<string, Record<string, unknown>>;
  regionSaveFeedback: RegionSaveFeedback | null;
  regionOcrFeedback: RegionOcrFeedback | null;
  regionRetranslateFeedback: RegionRetranslateFeedback | null;
}

type EditorAction =
  | { type: "patch"; patch: Partial<EditorState> }
  | { type: "toggleComparison" }
  | { type: "setStyleDraft"; regionId: string; renderStyle: Record<string, unknown> }
  | { type: "clearStyleDraft"; regionId: string }
  | { type: "markRegionDirty"; regionId: string }
  | { type: "setRegionSaveFeedback"; feedback: RegionSaveFeedback | null }
  | { type: "setRegionOcrFeedback"; feedback: RegionOcrFeedback | null }
  | { type: "setRegionRetranslateFeedback"; feedback: RegionRetranslateFeedback | null };

const ZOOM_MIN = 0.75;
const ZOOM_MAX = 1.45;
const ZOOM_STEP = 0.15;

const initialEditorState: EditorState = {
  mode: "translated",
  tool: "select",
  comparison: false,
  comparisonSplit: 50,
  zoom: 1,
  workspaceStatus: "Unsaved",
  styleDrafts: {},
  regionSaveFeedback: null,
  regionOcrFeedback: null,
  regionRetranslateFeedback: null,
};

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  if (action.type === "toggleComparison") {
    return { ...state, comparison: !state.comparison };
  }

  if (action.type === "setStyleDraft") {
    return {
      ...state,
      workspaceStatus: "Unsaved",
      regionSaveFeedback: state.regionSaveFeedback?.regionId === action.regionId ? null : state.regionSaveFeedback,
      regionOcrFeedback: state.regionOcrFeedback?.regionId === action.regionId ? null : state.regionOcrFeedback,
      regionRetranslateFeedback:
        state.regionRetranslateFeedback?.regionId === action.regionId ? null : state.regionRetranslateFeedback,
      styleDrafts: { ...state.styleDrafts, [action.regionId]: action.renderStyle },
    };
  }

  if (action.type === "clearStyleDraft") {
    const styleDrafts = { ...state.styleDrafts };
    delete styleDrafts[action.regionId];
    return { ...state, styleDrafts };
  }

  if (action.type === "markRegionDirty") {
    return {
      ...state,
      workspaceStatus: "Unsaved",
      regionSaveFeedback: state.regionSaveFeedback?.regionId === action.regionId ? null : state.regionSaveFeedback,
      regionOcrFeedback: state.regionOcrFeedback?.regionId === action.regionId ? null : state.regionOcrFeedback,
      regionRetranslateFeedback:
        state.regionRetranslateFeedback?.regionId === action.regionId ? null : state.regionRetranslateFeedback,
    };
  }

  if (action.type === "setRegionSaveFeedback") {
    return { ...state, regionSaveFeedback: action.feedback };
  }

  if (action.type === "setRegionOcrFeedback") {
    return {
      ...state,
      regionOcrFeedback: action.feedback,
      regionSaveFeedback:
        action.feedback && state.regionSaveFeedback?.regionId === action.feedback.regionId ? null : state.regionSaveFeedback,
      regionRetranslateFeedback:
        action.feedback && state.regionRetranslateFeedback?.regionId === action.feedback.regionId ? null : state.regionRetranslateFeedback,
    };
  }

  if (action.type === "setRegionRetranslateFeedback") {
    return {
      ...state,
      regionRetranslateFeedback: action.feedback,
      regionSaveFeedback:
        action.feedback && state.regionSaveFeedback?.regionId === action.feedback.regionId ? null : state.regionSaveFeedback,
      regionOcrFeedback:
        action.feedback && state.regionOcrFeedback?.regionId === action.feedback.regionId ? null : state.regionOcrFeedback,
    };
  }

  return { ...state, ...action.patch };
}

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(value.toFixed(2))));
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function pendingMessage(action: EditorSaveAction): string {
  return action === "approve" ? "Approving..." : "Saving...";
}

function successMessage(action: EditorSaveAction): string {
  return action === "approve" ? "Approved" : "Saved";
}

function retranslateSourceLabel(source: RegionRetranslateSource): string {
  return source === "detected_text" ? "source text" : "current target draft";
}

interface SaveRegionVariables {
  regionId: string;
  payload: TextRegionUpdate;
  action: EditorSaveAction;
  undoEntry?: UndoEntry;
}

interface CreateRegionVariables {
  pageId: string;
  boundingBox: BoundingBox;
  tool: Exclude<EditorTool, "select">;
}

interface RetranslateRegionVariables {
  regionId: string;
  sourceText: string;
  source: RegionRetranslateSource;
}

interface UndoEntry {
  order: number;
  projectId: string;
  regionId: string;
  pageId: string;
  payload: TextRegionUpdate;
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function valuesMatch(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function undoPayloadForRegion(region: TextRegionRead, payload: TextRegionUpdate): TextRegionUpdate | undefined {
  const undoPayload: TextRegionUpdate = {};
  let needsRerender = false;

  if ("detected_text" in payload && payload.detected_text !== region.detected_text) {
    undoPayload.detected_text = region.detected_text;
    needsRerender = true;
  }
  if ("translated_text" in payload && payload.translated_text !== region.translated_text) {
    undoPayload.translated_text = region.translated_text;
    needsRerender = true;
  }
  if ("user_text" in payload && payload.user_text !== region.user_text) {
    undoPayload.user_text = region.user_text;
    needsRerender = true;
  }
  if ("bounding_box" in payload && !valuesMatch(payload.bounding_box, region.bounding_box)) {
    undoPayload.bounding_box = cloneJson(region.bounding_box);
    needsRerender = true;
  }
  if ("render_style" in payload && !valuesMatch(payload.render_style, region.render_style)) {
    undoPayload.render_style = cloneJson(region.render_style);
    needsRerender = true;
  }
  if ("editable" in payload && payload.editable !== region.editable) {
    undoPayload.editable = region.editable;
  }
  if (!Object.keys(undoPayload).length) {
    return undefined;
  }
  if (needsRerender) {
    undoPayload.auto_rerender = true;
  }
  return undoPayload;
}

function undoEntryForUpdate(region: TextRegionRead | undefined, payload: TextRegionUpdate, order: number, projectId: string): UndoEntry | undefined {
  const undoPayload = region ? undoPayloadForRegion(region, payload) : undefined;
  if (!region || !undoPayload) {
    return undefined;
  }
  return {
    order,
    projectId,
    regionId: region.id,
    pageId: region.page_id,
    payload: undoPayload,
  };
}

function restoresRenderStyle(payload: TextRegionUpdate): boolean {
  return "render_style" in payload;
}

function regionWithPayload(region: TextRegionRead, payload: TextRegionUpdate): TextRegionRead {
  return {
    ...region,
    detected_text: "detected_text" in payload ? payload.detected_text ?? null : region.detected_text,
    translated_text: "translated_text" in payload ? payload.translated_text ?? null : region.translated_text,
    user_text: "user_text" in payload ? payload.user_text ?? null : region.user_text,
    bounding_box: payload.bounding_box ? cloneJson(payload.bounding_box) : region.bounding_box,
    render_style: "render_style" in payload ? cloneJson(payload.render_style ?? null) : region.render_style,
    editable: "editable" in payload ? payload.editable ?? region.editable : region.editable,
  };
}

function projectBackFallback(projectId: string, status?: string): string {
  return projectId && status === "review_required" ? `/projects/${projectId}/review` : "/projects";
}

export function Editor() {
  const { projectId = "" } = useParams();
  return <EditorWorkspace key={projectId} projectId={projectId} />;
}

function EditorWorkspace({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const undoOrderRef = useRef(0);
  const [
    {
      selectedPageId,
      selectedRegionId,
      mode,
      tool,
      comparison,
      comparisonSplit,
      zoom,
      workspaceStatus,
      styleDrafts,
      regionSaveFeedback,
      regionOcrFeedback,
      regionRetranslateFeedback,
    },
    dispatchEditor,
  ] = useReducer(editorReducer, initialEditorState);
  const zoomLabel = `${Math.round(zoom * 100)}%`;
  const undoDisabled = undoStack.length === 0;

  const projectQuery = useQuery({ queryKey: queryKeys.project(projectId), queryFn: () => api.getProject(projectId), enabled: Boolean(projectId) });
  const backFallbackPath = projectBackFallback(projectId, projectQuery.data?.status);
  const canNavigateBack =
    typeof window !== "undefined" && typeof window.history.state?.idx === "number"
      ? window.history.state.idx > 0
      : location.key !== "default";
  const pagesQuery = useQuery({ queryKey: queryKeys.pages(projectId), queryFn: () => api.listPages(projectId), enabled: Boolean(projectId) });
  const pages = useMemo(() => pagesQuery.data ?? [], [pagesQuery.data]);
  const selectedPage = pages.find((page) => page.id === selectedPageId) ?? pages[0];

  useEffect(() => {
    if (!selectedPageId && pages[0]) {
      dispatchEditor({ type: "patch", patch: { selectedPageId: pages[0].id } });
    }
  }, [pages, selectedPageId]);

  const regionsQuery = useQuery({
    queryKey: selectedPage ? queryKeys.regions(selectedPage.id) : ["regions", "empty"],
    queryFn: () => api.listRegions(selectedPage!.id),
    enabled: Boolean(selectedPage),
  });
  const regions = useMemo(() => regionsQuery.data ?? [], [regionsQuery.data]);
  const displayRegions = useMemo(
    () =>
      regions.map((region) => {
        const draft = styleDrafts[region.id];
        return draft ? { ...region, render_style: { ...(region.render_style ?? {}), ...draft } } : region;
      }),
    [regions, styleDrafts],
  );

  function nextUndoOrder(): number {
    undoOrderRef.current += 1;
    return undoOrderRef.current;
  }

  function insertUndoEntry(entry?: UndoEntry) {
    if (!entry) {
      return;
    }
    if (entry.projectId !== projectId) {
      return;
    }
    setUndoStack((current) => [...current, entry].sort((left, right) => left.order - right.order).slice(-25));
  }

  function handleBack() {
    if (canNavigateBack) {
      navigate(-1);
      return;
    }
    navigate(backFallbackPath, { replace: true });
  }

  function handleUndo() {
    const entry = undoStack[undoStack.length - 1];
    if (!entry) {
      dispatchEditor({ type: "patch", patch: { workspaceStatus: "Nothing to undo" } });
      return;
    }
    setUndoStack((current) => current.slice(0, -1));
    undoMutation.mutate(entry);
  }

  function handleSaveRegion(regionId: string, payload: TextRegionUpdate, action: EditorSaveAction) {
    const undoEntry = undoEntryForUpdate(regions.find((region) => region.id === regionId), payload, nextUndoOrder(), projectId);
    saveMutation.mutate({ regionId, payload, action, undoEntry });
  }

  function workspaceSavePayload(regionId: string): TextRegionUpdate {
    const styleDraft = styleDrafts[regionId];
    if (!styleDraft) {
      return { auto_rerender: true };
    }
    const region = regions.find((item) => item.id === regionId);
    return {
      render_style: { ...(region?.render_style ?? {}), ...styleDraft },
      auto_rerender: true,
    };
  }

  useEffect(() => {
    if (!selectedRegionId && regions[0]) {
      dispatchEditor({ type: "patch", patch: { selectedRegionId: regions[0].id } });
    }
  }, [regions, selectedRegionId]);

  const createRegionMutation = useMutation({
    mutationFn: ({ pageId, boundingBox, tool: createTool }: CreateRegionVariables) =>
      api.createRegion(pageId, {
        bounding_box: boundingBox,
        region_type: "unknown",
        render_style: createTool === "highlight_ocr" ? { align: "center", padding: 6 } : undefined,
      }),
    onMutate: ({ tool: createTool }) => {
      dispatchEditor({
        type: "patch",
        patch: { workspaceStatus: createTool === "highlight_ocr" ? "Creating OCR region..." : "Adding text box..." },
      });
    },
    onSuccess: async (createdRegion, variables) => {
      queryClient.setQueryData<TextRegionRead[]>(queryKeys.regions(createdRegion.page_id), (current) => {
        const existing = current?.filter((region) => region.id !== createdRegion.id) ?? [];
        return [...existing, createdRegion].sort((a, b) => a.region_index - b.region_index);
      });
      dispatchEditor({
        type: "patch",
        patch: {
          selectedRegionId: createdRegion.id,
          tool: "select",
          mode: variables.tool === "highlight_ocr" ? "translated" : mode,
          workspaceStatus: variables.tool === "highlight_ocr" ? "OCR region highlighted" : "Text box added",
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.regions(createdRegion.page_id) }),
        projectId ? queryClient.invalidateQueries({ queryKey: queryKeys.pages(projectId) }) : Promise.resolve(),
      ]);
    },
    onError: (error, variables) => {
      const label = variables.tool === "highlight_ocr" ? "Region highlight" : "Add text box";
      dispatchEditor({
        type: "patch",
        patch: {
          tool: "select",
          workspaceStatus: `${label} failed: ${errorMessage(error, "The request failed.")}`,
        },
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: ({ regionId, payload }: SaveRegionVariables) => api.updateRegion(regionId, payload),
    onMutate: ({ regionId, action }) => {
      if (action === "workspace") {
        dispatchEditor({ type: "patch", patch: { workspaceStatus: "Saving..." } });
        return;
      }
      dispatchEditor({
        type: "setRegionSaveFeedback",
        feedback: {
          regionId,
          action,
          status: "pending",
          message: pendingMessage(action),
        },
      });
      dispatchEditor({ type: "patch", patch: { workspaceStatus: "Saving..." } });
    },
    onSuccess: async (updatedRegion, variables) => {
      insertUndoEntry(variables.undoEntry);
      queryClient.setQueryData<TextRegionRead[]>(queryKeys.regions(updatedRegion.page_id), (current) =>
        current?.map((region) => (region.id === updatedRegion.id ? updatedRegion : region)) ?? current,
      );
      if (variables.payload.render_style !== undefined) {
        dispatchEditor({ type: "clearStyleDraft", regionId: updatedRegion.id });
      }
      if (variables.action === "workspace") {
        dispatchEditor({ type: "patch", patch: { workspaceStatus: "Saved" } });
      } else {
        dispatchEditor({
          type: "setRegionSaveFeedback",
          feedback: {
            regionId: updatedRegion.id,
            action: variables.action,
            status: "success",
            message: successMessage(variables.action),
          },
        });
        dispatchEditor({ type: "patch", patch: { workspaceStatus: "Saved" } });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.regions(updatedRegion.page_id) }),
        projectId ? queryClient.invalidateQueries({ queryKey: queryKeys.pages(projectId) }) : Promise.resolve(),
        projectId ? queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) }) : Promise.resolve(),
      ]);
    },
    onError: (error, variables) => {
      const message = errorMessage(error, "The request failed.");
      if (variables.action === "workspace") {
        dispatchEditor({ type: "patch", patch: { workspaceStatus: `Save failed: ${message}` } });
        return;
      }
      dispatchEditor({
        type: "setRegionSaveFeedback",
        feedback: {
          regionId: variables.regionId,
          action: variables.action,
          status: "error",
          message: `${variables.action === "approve" ? "Approve" : "Save"} failed: ${message}`,
        },
      });
      dispatchEditor({ type: "patch", patch: { workspaceStatus: "Unsaved" } });
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ regionId, boundingBox }: { regionId: string; boundingBox: BoundingBox }) =>
      api.updateRegion(regionId, { bounding_box: boundingBox, auto_rerender: true }),
    onMutate: async ({ regionId, boundingBox }) => {
      if (!selectedPage) {
        return undefined;
      }
      const key = queryKeys.regions(selectedPage.id);
      const undoOrder = nextUndoOrder();
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TextRegionRead[]>(key);
      const undoEntry = undoEntryForUpdate(
        previous?.find((region) => region.id === regionId),
        {
          bounding_box: boundingBox,
          auto_rerender: true,
        },
        undoOrder,
        projectId,
      );
      queryClient.setQueryData<TextRegionRead[]>(
        key,
        (current) => current?.map((region) => (region.id === regionId ? { ...region, bounding_box: boundingBox } : region)) ?? current,
      );
      return { key, previous, undoEntry };
    },
    onSuccess: (_updatedRegion, _variables, context) => {
      insertUndoEntry(context?.undoEntry);
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.key, context.previous);
      }
    },
    onSettled: async () => {
      await Promise.all([
        selectedPage ? queryClient.invalidateQueries({ queryKey: queryKeys.regions(selectedPage.id) }) : Promise.resolve(),
        projectId ? queryClient.invalidateQueries({ queryKey: queryKeys.pages(projectId) }) : Promise.resolve(),
      ]);
    },
  });

  const undoMutation = useMutation({
    mutationFn: (entry: UndoEntry) => api.updateRegion(entry.regionId, entry.payload),
    onMutate: async (entry) => {
      const key = queryKeys.regions(entry.pageId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TextRegionRead[]>(key);
      const hadStyleDraft = restoresRenderStyle(entry.payload) && Object.prototype.hasOwnProperty.call(styleDrafts, entry.regionId);
      const previousStyleDraft = hadStyleDraft ? cloneJson(styleDrafts[entry.regionId]) : undefined;
      queryClient.setQueryData<TextRegionRead[]>(
        key,
        (current) => current?.map((region) => (region.id === entry.regionId ? regionWithPayload(region, entry.payload) : region)) ?? current,
      );
      if (restoresRenderStyle(entry.payload)) {
        dispatchEditor({ type: "clearStyleDraft", regionId: entry.regionId });
      }
      dispatchEditor({ type: "setRegionSaveFeedback", feedback: null });
      dispatchEditor({ type: "patch", patch: { selectedPageId: entry.pageId, selectedRegionId: entry.regionId, workspaceStatus: "Undoing..." } });
      return { key, previous, hadStyleDraft, previousStyleDraft };
    },
    onSuccess: async (updatedRegion, entry) => {
      queryClient.setQueryData<TextRegionRead[]>(queryKeys.regions(updatedRegion.page_id), (current) =>
        current?.map((region) => (region.id === updatedRegion.id ? updatedRegion : region)) ?? current,
      );
      if (restoresRenderStyle(entry.payload)) {
        dispatchEditor({ type: "clearStyleDraft", regionId: updatedRegion.id });
      }
      dispatchEditor({ type: "setRegionSaveFeedback", feedback: null });
      dispatchEditor({ type: "patch", patch: { selectedPageId: updatedRegion.page_id, selectedRegionId: updatedRegion.id, workspaceStatus: "Undo applied" } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.regions(updatedRegion.page_id) }),
        projectId ? queryClient.invalidateQueries({ queryKey: queryKeys.pages(projectId) }) : Promise.resolve(),
        projectId ? queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) }) : Promise.resolve(),
      ]);
    },
    onError: (error, entry, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.key, context.previous);
      }
      if (context?.hadStyleDraft) {
        dispatchEditor({ type: "setStyleDraft", regionId: entry.regionId, renderStyle: context.previousStyleDraft ?? {} });
      }
      insertUndoEntry(entry);
      dispatchEditor({ type: "patch", patch: { workspaceStatus: `Undo failed: ${errorMessage(error, "The request failed.")}` } });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (regionId: string) => api.deleteRegion(regionId),
    onSuccess: async () => {
      dispatchEditor({ type: "patch", patch: { selectedRegionId: undefined } });
      await Promise.all([
        selectedPage ? queryClient.invalidateQueries({ queryKey: queryKeys.regions(selectedPage.id) }) : Promise.resolve(),
        projectId ? queryClient.invalidateQueries({ queryKey: queryKeys.pages(projectId) }) : Promise.resolve(),
      ]);
    },
  });

  const ocrMutation = useMutation({
    mutationFn: async (regionId: string) => {
      const job = await api.ocrRegion(regionId);
      return waitForSuccessfulOcrJob(job, { getProcessingJob: api.getProcessingJob });
    },
    onMutate: (regionId) => {
      dispatchEditor({
        type: "setRegionOcrFeedback",
        feedback: {
          regionId,
          status: "pending",
          message: "Running OCR on highlighted region.",
        },
      });
      dispatchEditor({ type: "patch", patch: { workspaceStatus: "Running OCR..." } });
    },
    onSuccess: async (job, regionId) => {
      const pageId = job.page_id ?? selectedPage?.id;
      await Promise.all([
        pageId ? queryClient.invalidateQueries({ queryKey: queryKeys.regions(pageId) }) : Promise.resolve(),
        projectId ? queryClient.invalidateQueries({ queryKey: queryKeys.jobs(projectId) }) : Promise.resolve(),
      ]);
      dispatchEditor({
        type: "setRegionOcrFeedback",
        feedback: {
          regionId,
          status: "success",
          message: "OCR text updated.",
        },
      });
      dispatchEditor({ type: "patch", patch: { workspaceStatus: "OCR text updated" } });
    },
    onError: async (error, regionId) => {
      const timedOut = isOcrJobPollingTimeoutError(error);
      const failedRegion = regions.find((region) => region.id === regionId);
      const pageId = failedRegion?.page_id ?? selectedPage?.id;
      dispatchEditor({
        type: "setRegionOcrFeedback",
        feedback: {
          regionId,
          status: "error",
          message: timedOut ? OCR_JOB_TIMEOUT_MESSAGE : `OCR failed: ${errorMessage(error, "The request failed.")}`,
        },
      });
      dispatchEditor({ type: "patch", patch: { workspaceStatus: timedOut ? "OCR still running" : "OCR failed" } });
      await Promise.all([
        pageId ? queryClient.invalidateQueries({ queryKey: queryKeys.regions(pageId) }) : Promise.resolve(),
        timedOut && projectId ? queryClient.invalidateQueries({ queryKey: queryKeys.jobs(projectId) }) : Promise.resolve(),
      ]);
    },
  });

  const retranslateMutation = useMutation({
    mutationFn: async ({ regionId, sourceText }: RetranslateRegionVariables) => {
      const job = await api.retranslateRegion(regionId, {
        source_text: sourceText,
        target_language: projectQuery.data?.target_language,
        tone: projectQuery.data?.translation_tone,
      });
      return waitForSuccessfulRetranslateJob(job, { getProcessingJob: api.getProcessingJob });
    },
    onMutate: ({ regionId, source }) => {
      dispatchEditor({
        type: "setRegionRetranslateFeedback",
        feedback: {
          regionId,
          status: "pending",
          message: `Translating from ${retranslateSourceLabel(source)}.`,
        },
      });
      dispatchEditor({ type: "patch", patch: { workspaceStatus: "Translating region..." } });
    },
    onSuccess: async (job, variables) => {
      const pageId = job.page_id ?? selectedPage?.id;
      await Promise.all([
        pageId ? queryClient.invalidateQueries({ queryKey: queryKeys.regions(pageId) }) : Promise.resolve(),
        projectId ? queryClient.invalidateQueries({ queryKey: queryKeys.jobs(projectId) }) : Promise.resolve(),
        projectId ? queryClient.invalidateQueries({ queryKey: queryKeys.pages(projectId) }) : Promise.resolve(),
        projectId ? queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) }) : Promise.resolve(),
      ]);
      dispatchEditor({
        type: "setRegionRetranslateFeedback",
        feedback: {
          regionId: variables.regionId,
          status: "success",
          message: "Translation updated.",
        },
      });
      dispatchEditor({ type: "patch", patch: { workspaceStatus: "Translation updated" } });
    },
    onError: async (error, variables) => {
      const timedOut = isRetranslateJobPollingTimeoutError(error);
      const failedRegion = regions.find((region) => region.id === variables.regionId);
      const pageId = failedRegion?.page_id ?? selectedPage?.id;
      dispatchEditor({
        type: "setRegionRetranslateFeedback",
        feedback: {
          regionId: variables.regionId,
          status: "error",
          message: timedOut ? RETRANSLATE_JOB_TIMEOUT_MESSAGE : `Translation failed: ${errorMessage(error, "The request failed.")}`,
        },
      });
      dispatchEditor({ type: "patch", patch: { workspaceStatus: timedOut ? "Translation still running" : "Translation failed" } });
      await Promise.all([
        pageId ? queryClient.invalidateQueries({ queryKey: queryKeys.regions(pageId) }) : Promise.resolve(),
        timedOut && projectId ? queryClient.invalidateQueries({ queryKey: queryKeys.jobs(projectId) }) : Promise.resolve(),
      ]);
    },
  });

  return (
    <WorkspaceShell fullHeight>
      {projectQuery.isLoading || pagesQuery.isLoading ? <LoadingState label="Loading editor" /> : null}
      {projectQuery.isError ? <ErrorState message={projectQuery.error.message} /> : null}
      {pagesQuery.isError ? <ErrorState message={pagesQuery.error.message} /> : null}

      {projectQuery.data && selectedPage ? (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-ink-border bg-surface-low px-3 md:px-5">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={handleBack}
                className="rounded-instrument p-2 text-text-muted transition hover:bg-surface-high hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
                aria-label="Back"
                title="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span className="group relative inline-flex">
                <button
                  type="button"
                  aria-disabled={undoDisabled ? "true" : undefined}
                  aria-describedby="undo-status-hint"
                  onClick={handleUndo}
                  className={`rounded-instrument p-2 text-text-muted transition hover:bg-surface-high hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary ${
                    undoDisabled ? "opacity-45" : ""
                  }`}
                  aria-label="Undo"
                  title={undoDisabled ? "Nothing to undo" : "Undo last editor change"}
                >
                  <Undo2 className="h-4 w-4" />
                </button>
                <span
                  id="undo-status-hint"
                  role="tooltip"
                  className="pointer-events-none absolute left-0 top-full z-50 mt-2 w-48 rounded-instrument border border-ink-border bg-background px-3 py-2 text-xs font-semibold text-text-main opacity-0 shadow-2xl transition group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  {undoDisabled ? "Nothing to undo." : "Undo last editor change."}
                </span>
              </span>
              <button
                type="button"
                aria-label="Highlight OCR Region"
                aria-pressed={tool === "highlight_ocr"}
                disabled={!selectedPage || createRegionMutation.isPending}
                onClick={() => {
                  const nextTool = tool === "highlight_ocr" ? "select" : "highlight_ocr";
                  dispatchEditor({
                    type: "patch",
                    patch: {
                      tool: nextTool,
                      comparison: false,
                      mode: "original",
                      workspaceStatus: nextTool === "highlight_ocr" ? "Highlight OCR region" : "Select mode",
                    },
                  });
                }}
                className={`inline-flex items-center gap-2 rounded-instrument px-3 py-2 text-xs font-bold transition hover:bg-surface-high hover:text-white disabled:cursor-not-allowed disabled:opacity-60 ${
                  tool === "highlight_ocr" ? "bg-tertiary/10 text-tertiary" : "text-text-muted"
                }`}
              >
                <ScanText className="h-4 w-4" />
                <span className="hidden sm:inline">Highlight OCR Region</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  dispatchEditor({ type: "patch", patch: { mode: "translated", tool: "select", comparison: false, zoom: 1, workspaceStatus: "View reset" } });
                }}
                className="rounded-instrument p-2 text-text-muted transition hover:bg-surface-high hover:text-white"
                aria-label="Reset view"
                title="Reset view"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={!selectedPage || createRegionMutation.isPending}
                aria-pressed={tool === "addText"}
                aria-busy={createRegionMutation.isPending}
                onClick={() => {
                  const nextTool = tool === "addText" ? "select" : "addText";
                  dispatchEditor({
                    type: "patch",
                    patch: {
                      tool: nextTool,
                      mode: "translated",
                      comparison: false,
                      workspaceStatus: nextTool === "addText" ? "Drag on the image to add a text box" : "Select mode",
                    },
                  });
                }}
                className={`rounded-instrument p-2 transition hover:bg-surface-high hover:text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                  tool === "addText" ? "bg-secondary/10 text-secondary" : "text-text-muted"
                }`}
                aria-label="Add text box"
                title="Add text box"
              >
                <SquarePlus className="h-4 w-4" />
              </button>
              <span className="hidden h-5 w-px bg-ink-border sm:block" />
              <h1 className="min-w-16 max-w-36 truncate font-display text-base font-bold text-white sm:max-w-none">{projectQuery.data.name}</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden rounded-instrument border border-ink-border bg-background p-1 sm:flex">
                {(["original", "translated"] as const).map((value) => (
                  <button key={value} aria-pressed={mode === value} onClick={() => dispatchEditor({ type: "patch", patch: { mode: value } })} className={`rounded-instrument px-3 py-1.5 text-xs font-bold capitalize ${mode === value ? "bg-surface-high text-white" : "text-text-muted hover:text-white"}`}>
                    {value}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-pressed={comparison}
                onClick={() => dispatchEditor({ type: "toggleComparison" })}
                className={`rounded-instrument p-2 transition hover:bg-surface-high hover:text-white ${comparison ? "bg-secondary/10 text-secondary" : "text-text-muted"}`}
                aria-label="Compare split"
              >
                <Columns2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={zoom <= ZOOM_MIN}
                onClick={() => dispatchEditor({ type: "patch", patch: { zoom: clampZoom(zoom - ZOOM_STEP) } })}
                className="hidden rounded-instrument p-2 text-text-muted transition hover:bg-surface-high hover:text-white disabled:cursor-not-allowed disabled:opacity-45 sm:block"
                aria-label="Zoom out"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="hidden w-12 shrink-0 text-center text-xs font-bold tabular-nums text-secondary sm:inline-block">{zoomLabel}</span>
              <button
                type="button"
                disabled={zoom >= ZOOM_MAX}
                onClick={() => dispatchEditor({ type: "patch", patch: { zoom: clampZoom(zoom + ZOOM_STEP) } })}
                className="hidden rounded-instrument p-2 text-text-muted transition hover:bg-surface-high hover:text-white disabled:cursor-not-allowed disabled:opacity-45 sm:block"
                aria-label="Zoom in"
              >
                <Plus className="h-4 w-4" />
              </button>
              <Link to={`/projects/${projectId}/export`} className="inline-flex items-center gap-2 rounded-instrument bg-primary px-3 py-2 text-sm font-bold text-white shadow-glow transition hover:bg-violet-500">
                <Download className="h-4 w-4" />
                Export
              </Link>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <aside className="hidden w-28 shrink-0 overflow-y-auto border-r border-ink-border bg-surface-low p-3 lg:block">
              <div className="space-y-3">
                {pages.map((page) => (
                  <button
                    key={page.id}
                    onClick={() => {
                      dispatchEditor({ type: "patch", patch: { selectedPageId: page.id, selectedRegionId: undefined } });
                    }}
                    disabled={selectedPage.id === page.id}
                    aria-current={selectedPage.id === page.id ? "true" : undefined}
                    className={`w-full rounded-instrument border p-1 transition disabled:cursor-default ${selectedPage.id === page.id ? "border-secondary bg-secondary/10" : "border-ink-border bg-background hover:border-primary/50"}`}
                  >
                    {assetUrlForPage(page) ? <img src={assetUrlForPage(page)} alt={`Page ${page.page_number}`} className="aspect-[3/4] w-full rounded-[2px] object-cover grayscale" /> : null}
                    <span className="mt-1 block text-xs font-bold text-text-muted">P{page.page_number}</span>
                  </button>
                ))}
              </div>
            </aside>

            <CanvasWorkspace
              imageUrl={assetUrlForPage(selectedPage, mode === "original" ? "original" : "editable")}
              comparisonOriginalImageUrl={assetUrlForPage(selectedPage, "original")}
              comparisonTranslatedImageUrl={assetUrlForPage(selectedPage, "editable")}
              comparisonSplit={comparisonSplit}
              onComparisonSplitChange={(split) => dispatchEditor({ type: "patch", patch: { comparisonSplit: split } })}
              width={selectedPage.width}
              height={selectedPage.height}
              regions={displayRegions}
              selectedRegionId={selectedRegionId}
              onSelectRegion={(regionId) => dispatchEditor({ type: "patch", patch: { selectedRegionId: regionId } })}
              onMoveRegion={(regionId, boundingBox) => moveMutation.mutate({ regionId, boundingBox })}
              onCreateRegion={(boundingBox) => {
                if (selectedPage) {
                  createRegionMutation.mutate({ pageId: selectedPage.id, boundingBox, tool: tool === "highlight_ocr" ? "highlight_ocr" : "addText" });
                }
              }}
              mode={mode}
              zoom={zoom}
              comparison={comparison}
              tool={tool}
              isCreatingRegion={createRegionMutation.isPending}
            />

            <RegionPanel
              regions={displayRegions}
              selectedRegionId={selectedRegionId}
              onSelect={(regionId) => dispatchEditor({ type: "patch", patch: { selectedRegionId: regionId } })}
              onSave={handleSaveRegion}
              onRunOcr={(regionId) => ocrMutation.mutate(regionId)}
              onRetranslate={(regionId, sourceText, source) => retranslateMutation.mutate({ regionId, sourceText, source })}
              onDelete={(regionId) => deleteMutation.mutate(regionId)}
              onDraftChange={(regionId) => dispatchEditor({ type: "markRegionDirty", regionId })}
              onStyleDraftChange={(regionId, renderStyle) => {
                dispatchEditor({ type: "setStyleDraft", regionId, renderStyle });
              }}
              saveFeedback={regionSaveFeedback}
              ocrFeedback={regionOcrFeedback}
              retranslateFeedback={regionRetranslateFeedback}
              isDeleting={deleteMutation.isPending}
            />
          </div>

          <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-t border-ink-border bg-background px-4 text-xs font-semibold text-text-muted">
            <span className="shrink-0">{regions.length} regions · Page {selectedPage.page_number}</span>
            <span aria-live="polite" className="min-w-0 flex-1 truncate text-secondary">
              Zoom {zoomLabel}{comparison ? " · Compare split on" : ""} · {workspaceStatus}
            </span>
            <button
              type="button"
              disabled={!selectedRegionId || saveMutation.isPending}
              onClick={() => {
                if (selectedRegionId) {
                  handleSaveRegion(selectedRegionId, workspaceSavePayload(selectedRegionId), "workspace");
                }
              }}
              className="inline-flex shrink-0 items-center gap-2 rounded-instrument border border-ink-border px-3 py-1.5 text-text-main transition hover:bg-surface-high disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" />
              {saveMutation.isPending && saveMutation.variables?.action === "workspace" ? "Saving" : "Save workspace"}
            </button>
          </div>
        </div>
      ) : null}
    </WorkspaceShell>
  );
}
