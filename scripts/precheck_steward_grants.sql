-- Band A deploy B — the lockout pre-check, run by lvrf-deploy.sh BEFORE it
-- restarts the service (and by verify_grant_enforcement.sh).
--
-- From deploy B, sign-in needs a current access grant. If a tenant's
-- steward has no current grant (or no current password), nobody can grant
-- one through the app's rules except over SSH — so a restart into that
-- state is refused rather than discovered.
--
-- Prints one number: the tenants that have people with current passwords
-- but whose steward is missing, or lacks a current grant or a current
-- password. The deploy requires 0. Read-only.
SELECT count(*)
  FROM tenants t
 WHERE t.deleted_at IS NULL
   AND EXISTS (
         SELECT 1 FROM persons p
           JOIN person_credentials c ON c.person_id = p.id AND c.revoked_at IS NULL
          WHERE p.tenant_id = t.id)
   AND NOT EXISTS (
         SELECT 1 FROM access_grants g
           JOIN person_credentials c ON c.person_id = g.person_id AND c.revoked_at IS NULL
          WHERE g.person_id = t.steward_person_id AND g.revoked_at IS NULL);
