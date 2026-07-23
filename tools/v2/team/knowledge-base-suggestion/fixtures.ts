/**
 * fixtures.ts — Knowledge Base Suggestion (execution contract fixtures)
 *
 * Deterministic local fixtures used by the contract tests and as documentation
 * of the contract shape.
 */

import type { KbArticle, KbCorpusFilter } from "./types";

/** A small deterministic KB corpus. */
export const KB_ARTICLES: KbArticle[] = [
  {
    id: "kb-onboarding",
    title: "Team Onboarding Checklist",
    tags: ["onboarding", "getting-started", "team"],
    summary: "Steps for ramping new team members.",
    locale: "en",
    access: "public",
  },
  {
    id: "kb-billing",
    title: "Billing and Invoices FAQ",
    tags: ["billing", "invoices", "finance"],
    summary: "How to read invoices and handle disputes.",
    locale: "en",
    access: "team",
  },
  {
    id: "kb-security",
    title: "Security Incident Response",
    tags: ["security", "incident", "runbook"],
    summary: "What to do during a security incident.",
    locale: "en",
    access: "public",
  },
];

/** A filter that limits to public articles. */
export function publicFilter(article: KbArticle): boolean {
  return article.access === "public";
}
Object.defineProperty(publicFilter, "name", { value: "public-access" });

/** A filter that limits to English articles. */
export function enLocaleFilter(article: KbArticle): boolean {
  return article.locale === "en";
}
Object.defineProperty(enLocaleFilter, "name", { value: "en-locale" });
