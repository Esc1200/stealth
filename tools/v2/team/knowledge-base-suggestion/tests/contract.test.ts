/**
 * contract.test.ts — Knowledge Base Suggestion (execution contract)
 *
 * Verifies the non-UI execution contract: typed inputs/outputs, relevance
 * scoring/ranking, limit, filtering, warnings, and the edge/error paths
 * (empty query, no match, invalid corpus). No UI is exercised.
 */

import { describe, it, expect } from "vitest";
import { createKbSuggestionService } from "../services/kb-suggestion.service";
import {
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
  type KbResult,
  type KbContractOutput,
  type KbCorpusFilter,
} from "../core/engine";
import { KB_ARTICLES, publicFilter, enLocaleFilter } from "../fixtures";

function makeContract() {
  return createKbSuggestionService();
}

describe("kb contract — result helpers", () => {
  it("ok() produces a typed success result", () => {
    expect(ok("v")).toEqual({ ok: true, value: "v" });
  });

  it("fail() produces a typed error result with code + message", () => {
    const r = fail(KbErrorCode.NoMatch, "none");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe(KbErrorCode.NoMatch);
      expect(r.message).toBe("none");
    }
  });
});

describe("kb contract — tokenize/normalize", () => {
  it("tokenize splits and lowercases", () => {
    expect(tokenize("Invoice Billing")).toEqual(["invoice", "billing"]);
  });

  it("normalizeText lowercases and trims", () => {
    expect(normalizeText("  Security  ")).toBe("security");
  });
});

describe("kb contract — scoreArticle", () => {
  it("scores tag matches higher than title matches", () => {
    const result = scoreArticle(KB_ARTICLES[1], ["billing", "faq", "invoices"]);
    expect(result).not.toBeNull();
    expect(result!.suggestion.score).toBeGreaterThan(0);
    expect(result!.reasons.some((r) => r.type === "tag-match")).toBe(true);
    expect(result!.reasons.some((r) => r.type === "title-keyword")).toBe(true);
  });

  it("returns null for non-matching article", () => {
    const result = scoreArticle(KB_ARTICLES[0], ["quantum", "banana"]);
    expect(result).toBeNull();
  });
});

describe("kb contract — rankArticles", () => {
  it("sorts by score desc then title asc", () => {
    const scored = [
      { suggestion: { articleId: "a", title: "A", score: 1 } as any, reasons: [] as any[] },
      { suggestion: { articleId: "b", title: "B", score: 2 } as any, reasons: [] as any[] },
    ];
    const ranked = rankArticles(scored);
    expect(ranked[0].articleId).toBe("b");
    expect(ranked[1].articleId).toBe("a");
  });

  it("respects limit", () => {
    const scored = [
      { suggestion: { articleId: "a", title: "A", score: 1 } as any, reasons: [] as any[] },
      { suggestion: { articleId: "b", title: "B", score: 2 } as any, reasons: [] as any[] },
      { suggestion: { articleId: "c", title: "C", score: 3 } as any, reasons: [] as any[] },
    ];
    const ranked = rankArticles(scored, 2);
    expect(ranked.length).toBe(2);
  });
});

describe("kb contract — filterCorpus", () => {
  it("filters corpus and returns warnings", () => {
    const result = filterCorpus(KB_ARTICLES, [publicFilter]);
    expect(result.filtered.length).toBeLessThan(KB_ARTICLES.length);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.appliedFilters).toContain("public-access");
  });

  it("handles empty filters", () => {
    const result = filterCorpus(KB_ARTICLES, []);
    expect(result.filtered.length).toBe(KB_ARTICLES.length);
    expect(result.warnings.length).toBe(0);
  });

  it("returns warning for invalid corpus", () => {
    const result = filterCorpus(null as any, []);
    expect(result.filtered.length).toBe(0);
    expect(result.warnings).toContain("corpus must be an array");
  });
});

describe("kb contract — validateInput", () => {
  it("rejects empty query", () => {
    expect(validateInput({ query: "   " }, KB_ARTICLES)).not.toBeNull();
  });

  it("rejects invalid corpus", () => {
    expect(validateInput({ query: "invoice" }, null as any)).not.toBeNull();
  });

  it("accepts valid input", () => {
    expect(validateInput({ query: "billing" }, KB_ARTICLES)).toBeNull();
  });
});

describe("kb contract — suggestKb", () => {
  it("returns suggestions and warnings", () => {
    const result = suggestKb("invoice billing", KB_ARTICLES);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions[0].articleId).toBe("kb-billing");
  });

  it("applies filters", () => {
    const result = suggestKb("billing", KB_ARTICLES, 5, [publicFilter]);
    expect(result.suggestions.length).toBe(0); // billing is team-only
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("returns empty for no-match query", () => {
    const result = suggestKb("quantum banana spaceship", KB_ARTICLES);
    expect(result.suggestions.length).toBe(0);
  });
});

describe("kb contract — execute", () => {
  it("ranks billing query to the billing article", () => {
    const contract = makeContract();
    const res = contract.execute(
      { operation: "suggest", input: { query: "invoice billing" } },
      KB_ARTICLES,
    );
    expect(res.ok).toBe(true);
    if (res.ok && res.value.operation === "suggest") {
      expect(res.value.suggestions[0].articleId).toBe("kb-billing");
      expect(res.value.suggestions[0].score).toBeGreaterThan(0);
    }
  });

  it("respects the limit", () => {
    const contract = makeContract();
    const res = contract.execute(
      { operation: "suggest", input: { query: "team security billing onboarding", limit: 1 } },
      KB_ARTICLES,
    );
    if (res.ok && res.value.operation === "suggest") {
      expect(res.value.suggestions.length).toBe(1);
    }
  });

  it("applies filters via execute", () => {
    const contract = makeContract();
    const res = contract.execute(
      { operation: "suggest", input: { query: "security" } },
      KB_ARTICLES,
      [publicFilter],
    );
    expect(res.ok).toBe(true);
    if (res.ok && res.value.operation === "suggest") {
      expect(res.value.suggestions[0].articleId).toBe("kb-security");
      expect(res.value.warnings).toBeDefined();
    }
  });

  it("returns NoMatch for an unrelated query (no throw)", () => {
    const contract = makeContract();
    const res: KbResult<KbContractOutput> = contract.execute(
      { operation: "suggest", input: { query: "quantum banana spaceship" } },
      KB_ARTICLES,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe(KbErrorCode.NoMatch);
  });

  it("rejects an empty query (no throw)", () => {
    const contract = makeContract();
    const res: KbResult<KbContractOutput> = contract.execute(
      { operation: "suggest", input: { query: "   " } },
      KB_ARTICLES,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe(KbErrorCode.InvalidInput);
  });
});