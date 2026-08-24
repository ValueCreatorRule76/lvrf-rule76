-- Postgres restricts reading, comparing, or casting a newly added
-- enum value inside the transaction that added it. This migration is
-- separated so the enum add can commit alone if applied on its own.
-- Note: drizzle-kit migrate wraps ALL pending files in one outer
-- transaction, so a combined run leaves 0010 and 0011 in the same
-- transaction regardless. This is safe here only because nothing in
-- 0011 references 'vendor_publication'. Verified against
-- drizzle-orm/pg-core/dialect.js.
ALTER TYPE "public"."evidence_kind" ADD VALUE 'vendor_publication';
