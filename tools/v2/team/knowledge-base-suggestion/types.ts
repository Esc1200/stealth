/**
 * types.ts — Knowledge Base Suggestion (non-UI execution contract)
 *
 * Domain types for suggesting internal documentation articles. No imports from
 * the main app; presentation-free.
 */

/** A knowledge base article. */
export interface KbArticle {
  id: string;
  title: string;
  /** Tags used for relevance matching. */
  tags: string[];
  /** Short summary shown to the user. */
  summary?: string;
  /** Locale code (e.g., "en", "fr"). */
  locale?: string;
  /** Access metadata (e.g., "public", "team"). */
  access?: string;
}

/** A ranked suggestion. */
export interface KbSuggestion {
  articleId: string;
  title: string;
  summary?: string;
  /** Relevance score (higher = better). */
  score: number;
}

/** Input for suggesting KB articles. */
export interface SuggestInput {
  /** Free-text query to match against the corpus. */
  query: string;
  /** Maximum number of suggestions to return. */
  limit?: number;
  /** Optional team or product context for filtering. */
  team?: string;
  /** Optional product context for filtering. */
  product?: string;
}

/** Match reason for explainability. */
export type KbMatchReason =
  | { type: "tag-match"; token: string; matchedValue: string }
  | { type: "title-keyword"; token: string; matchedValue: string };

/** A filter function applied to the corpus. */
export interface KbCorpusFilter {
  name: string;
  (article: KbArticle): boolean;
}

/** Result of corpus filtering with warnings. */
export interface KbCorpusFilterResult {
  /** Articles that passed all filters. */
  filtered: KbArticle[];
  /** Warnings about removed articles. */
  warnings: string[];
  /** Filter names that were applied. */
  appliedFilters: string[];
}
