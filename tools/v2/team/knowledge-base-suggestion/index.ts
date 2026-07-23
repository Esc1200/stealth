/**
 * index.ts — Knowledge Base Suggestion
 *
 * Folder-local API surface. Zero dependencies on the main app.
 */

// Types
export type {
  KbArticle,
  KbSuggestion,
  SuggestInput,
  KbMatchReason,
  KbCorpusFilter,
  KbCorpusFilterResult,
} from "./types";

// Contract
export {
  KbErrorCode,
  ok,
  fail,
  tokenize,
  normalizeText,
  scoreArticle,
  rankArticles,
  filterCorpus,
  validateInput,
  suggestKb,
} from "./core/engine";

export type {
  KbResult,
  KbOperation,
  KbContractOutput,
  KbContract,
} from "./core/engine";

// Service
export { createKbSuggestionService } from "./services/kb-suggestion.service";

// Fixtures
export { KB_ARTICLES } from "./fixtures";
