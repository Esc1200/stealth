/**
 * engine.ts — Knowledge Base Suggestion (modular core engine)
 *
 * Expandable, presentation-free core logic. All ranking, filtering, and
 * validation lives here. No imports from the main app.
 */

import type {
  KbArticle,
  KbSuggestion,
  SuggestInput,
  KbMatchReason,
} from "../types";

/** Explicit, machine-readable error codes for contract operations. */
export enum KbErrorCode {
  InvalidInput = "INVALID_INPUT",
  NoMatch = "NO_MATCH",
}

/** Typed success outcome. */
export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

/** Typed error outcome. */
export function fail<T = never>(
  error: KbErrorCode,
  message: string
): { ok: false; error: KbErrorCode; message: string } {
  return { ok: false, error, message };
}

/** Tokenize a query into lowercase alphanumeric terms. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length > 0);
}

/** Normalize text for comparison (lowercase, trimmed). */
export function normalizeText(text: string): string {
  return text.toLowerCase().trim();
}

/**
 * Build match reasons for an article given query tokens.
 * Expandable: contributors can add new reason types in KbMatchReason.
 */
export function scoreArticle(
  article: KbArticle,
  queryTokens: string[],
  limit = 5
): { suggestion: KbSuggestion; reasons: KbMatchReason[] } | null {
  let score = 0;
  const reasons: KbMatchReason[] = [];
  const titleLower = normalizeText(article.title);

  for (const term of queryTokens) {
    // Tag overlap scoring (+2 per matched tag)
    const matchedTag = article.tags.find((t) => normalizeText(t) === term);
    if (matchedTag) {
      score += 2;
      reasons.push({
        type: "tag-match",
        token: term,
        matchedValue: matchedTag,
      });
    }

    // Title keyword scoring (+1 per query token found in title)
    if (titleLower.includes(term)) {
      score += 1;
      reasons.push({
        type: "title-keyword",
        token: term,
        matchedValue: article.title,
      });
    }
  }

  if (score > 0) {
    return {
      suggestion: {
        articleId: article.id,
        title: article.title,
        summary: article.summary,
        score,
      },
      reasons,
    };
  }
  return null;
}

/**
 * Rank articles deterministically by score desc, then title asc for tie-breaking.
 * Expandable: add secondary sort criteria here.
 */
export function rankArticles(
  scored: { suggestion: KbSuggestion; reasons: KbMatchReason[] }[],
  limit = 5
): KbSuggestion[] {
  return scored
    .sort((a, b) => b.suggestion.score - a.suggestion.score || a.suggestion.title.localeCompare(b.suggestion.title))
    .slice(0, limit)
    .map((s) => s.suggestion);
}

/**
 * Filter corpus using optional contributor-provided filter functions.
 * Expandable: add new filter criteria without touching core logic.
 */
export function filterCorpus(
  corpus: KbArticle[],
  filters: KbCorpusFilter[] = []
): KbCorpusFilterResult {
  if (!Array.isArray(corpus)) {
    return {
      filtered: [],
      warnings: ["corpus must be an array"],
      appliedFilters: [],
    };
  }

  let working = [...corpus];
  const warnings: string[] = [];
  const appliedFilters: string[] = [];

  for (const filter of filters) {
    const before = working.length;
    working = working.filter(filter);
    const removed = before - working.length;
    if (removed > 0) {
      warnings.push(`Filter '${filter.name}' removed ${removed} articles`);
    }
    appliedFilters.push(filter.name);
  }

  return {
    filtered: working,
    warnings,
    appliedFilters,
  };
}

/**
 * Validate inputs before processing. Expandable with new validation rules.
 */
export function validateInput(input: SuggestInput, corpus: KbArticle[]): string | null {
  if (!Array.isArray(corpus)) return "corpus must be an array";
  if (!input || typeof input.query !== "string" || input.query.trim().length === 0) {
    return "query is required";
  }
  return null;
}

/**
 * Pure suggestion reducer. Deterministic given the same inputs.
 * Orchestrates filter -> score -> rank pipeline.
 */
export function suggestKb(
  query: string,
  corpus: KbArticle[],
  limit = 5,
  filters: KbCorpusFilter[] = []
): { suggestions: KbSuggestion[]; warnings: string[] } {
  const terms = tokenize(query);
  if (terms.length === 0) {
    return { suggestions: [], warnings: ["query produced no tokens"] };
  }

  // 1. Filter corpus
  const filterResult = filterCorpus(corpus, filters);
  const workingCorpus = filterResult.filtered;

  // 2. Score each article
  const scored = workingCorpus
    .map((article) => scoreArticle(article, terms, limit))
    .filter((result): result is NonNullable<typeof result> => result !== null);

  // 3. Rank and limit
  const suggestions = rankArticles(scored, limit);

  return {
    suggestions,
    warnings: filterResult.warnings,
  };
}

// Contract types

/** Discriminated outcome returned by every operation. */
export type KbResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: KbErrorCode; message: string };

/** Operations supported by the contract. */
export type KbOperation = { operation: "suggest"; input: SuggestInput };

/** A filter function applied to the corpus. */
export type KbCorpusFilter = {
  name: string;
  (article: KbArticle): boolean;
};

/** Result of corpus filtering with warnings. */
export type KbCorpusFilterResult = {
  filtered: KbArticle[];
  warnings: string[];
  appliedFilters: string[];
};

/** Output produced by the contract. */
export type KbContractOutput = {
  operation: "suggest";
  suggestions: KbSuggestion[];
  /** Warnings from the suggestion pipeline. */
  warnings?: string[];
};

/** Backend-facing entry point for KB suggestions. */
export interface KbContract {
  execute(input: KbOperation, corpus: KbArticle[], filters?: KbCorpusFilter[]): KbResult<KbContractOutput>;
}