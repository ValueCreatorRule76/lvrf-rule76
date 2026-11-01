-- B1 (LVRF_3.0_CRITICAL_PATH item 1; Brad, 1 Nov 2026). Changes: governance_act gains 'add_industry', a steward adds an
-- industry so a pack can be researched for it. Writes no row and orphans nothing.
ALTER TYPE "public"."governance_act" ADD VALUE 'add_industry';