export { DraftImproverTool } from "./components";
export { analyzeDraft, validateDraftInput, sanitizeDraft, parseDraft } from "./services";
export type {
  DraftImprovementResult,
  DraftImproverServiceOptions,
  DraftInput,
  DraftInputId,
  DraftIssue,
  DraftIssueCategory,
  DraftIssueSeverity,
  DraftSuggestion,
  DraftSuggestionType,
  DraftScore,
  ParsedDraft,
  SanitizedDraft,
} from "./types";
/**
 * Draft Improver - folder-local public API surface.
 *
 * This is the only entry point other code in this tool folder should import
 * from. The tool is intentionally not wired into the main application; a future
 * integration can decide how, and whether, to surface it in the UI.
 */

export { improveDraft } from "./services/draft-improver";
export { DRAFT_FIXTURES } from "./services/fixtures";
export type { DraftFixture } from "./services/fixtures";
export type {
  DraftAnalysis,
  DraftImproverError,
  DraftImproverErrorCode,
  DraftImproverResult,
  DraftInput,
  DraftMetrics,
  Suggestion,
  SuggestionCategory,
  SuggestionSeverity,
} from "./services/types";
