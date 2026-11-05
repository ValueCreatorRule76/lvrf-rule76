-- B3 (P6; LVRF_PLAN §19, approved by Brad 5 Nov 2026). Changes: governance_act gains 'record_rate', 'plan' and 'share';
-- document_disclosure gains 'shared_for_review' (D-M21). Enum values only, in a migration of their own: Postgres cannot use a
-- new value inside the transaction that adds it, and drizzle-kit applies pending migrations in one transaction, so 0048
-- names none of them (hardening section 33's functions do, at run time). Writes no row and orphans nothing.
ALTER TYPE "public"."document_disclosure" ADD VALUE 'shared_for_review';--> statement-breakpoint
ALTER TYPE "public"."governance_act" ADD VALUE 'record_rate';--> statement-breakpoint
ALTER TYPE "public"."governance_act" ADD VALUE 'plan';--> statement-breakpoint
ALTER TYPE "public"."governance_act" ADD VALUE 'share';