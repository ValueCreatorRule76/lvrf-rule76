-- ------------------------------------------------------------------
-- Fact supersession: institution_facts.supersession_reason.
--
-- WHAT IT CHANGES. Additive: one nullable column and one CHECK on
-- institution_facts. A fact is corrected by a NEW fact; the old row gets
-- superseded_by_id (already present since 0024) and, now, the reason —
-- in the same UPDATE. The CHECK holds the pair together: superseded <=>
-- a reason of at least 12 characters. The old row is never edited
-- otherwise and never deleted (_no_delete); _supersession_sane (0024)
-- already refuses a self-link, a missing or retired successor, a
-- successor not newer than the row it replaces, and a fork.
--
-- WHAT IT COULD ORPHAN. Nothing. The CHECK must hold for every existing
-- row, so it was checked before writing it: prod 1 fact / 0 superseded,
-- lvrf_prodcopy 0 / 0, local lvrf 0 / 0 (11 October 2026). No new
-- trigger: 84 stays 84. BACK UP FIRST (CLAUDE.md rule 8).
--
-- Generated with `drizzle-kit generate --name fact_supersession`;
-- statements are drizzle-kit's own output, unedited.
-- ------------------------------------------------------------------
ALTER TABLE "institution_facts" ADD COLUMN "supersession_reason" text;--> statement-breakpoint
ALTER TABLE "institution_facts" ADD CONSTRAINT "institution_facts_supersession_reason" CHECK (("institution_facts"."superseded_by_id" IS NULL) = ("institution_facts"."supersession_reason" IS NULL)
        AND ("institution_facts"."supersession_reason" IS NULL OR length(btrim("institution_facts"."supersession_reason")) >= 12));