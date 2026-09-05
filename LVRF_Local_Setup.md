# LVRF — Local Development Setup

**Machine:** MacBook Air (macOS) · **Editor:** VS Code + Claude Code + Copilot
**Repo:** `ValueCreatorRule76/lvrf-rule76` · **Prod:** `srv1862778` / `lvrf-rule76.com`

Run one phase at a time. Verify before moving on. All commands run in **Terminal**
unless noted (`Cmd + Space`, type `terminal`).

---

## FINDING — a local database without `hardening.sql` has NO governance

Discovered 5 September 2026, while building the industry-pack accept/reject routes:
this repo's local dev database had been recreated via `drizzle-kit migrate` alone at
some point, and `db/hardening.sql` (Phase 8, below) had never been run against it. It
was caught only because a trigger-stamped column (`research_results.reviewed_at`)
stayed `NULL` and a CHECK constraint downstream of it fired — a symptom, not the
cause. `\d` on any table showed the columns and CHECK constraints from `schema.ts`
looking completely normal; nothing about a plain `psql \d` or a passing `drizzle-kit
migrate` run reveals that the triggers are missing.

**`schema.ts` (via drizzle migrations) and `hardening.sql` are two separate, both
required layers.** Migrations create tables, columns and CHECK constraints.
`hardening.sql` is the **only** source of every trigger in this system: audit
logging, `reviewed_at`/`updated_at` stamping, the no-hard-delete guards, the
supersession-sanity checks, the AI-actual-value blocks — all of it (see
`CLAUDE.md`'s non-negotiable rules 2–4, all trigger-enforced). Skip it, and:

- Hard deletes on governed tables silently succeed instead of being refused.
- No row in `audit_log` ever gets written — no actor trail, ever.
- Server-set columns (`reviewed_at`, `updated_at`) stay `NULL` forever, which can
  itself make an otherwise-correct CHECK constraint fail in a way that looks like
  an application bug.
- Every one of the "must FAIL" acceptance tests at the end of Phase 8 will
  **succeed** instead — the exact false-confidence failure mode this system is
  built to prevent (see `CLAUDE.md`'s governing AI principle).

**Every test run against a database in this state is weaker than it looks** — it
proves the code path executes, not that governance holds. If you did the setup
phases out of order, restored a dump, or ran `drizzle-kit migrate` after a fresh
`createdb` without immediately following it with `hardening.sql`, assume this has
happened to you. Verify with:

```sql
SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal;
```

Zero (or noticeably fewer than the count logged at the end of `hardening.sql`'s own
run) means governance is off. Re-run `psql -d lvrf -f db/hardening.sql` — it is
idempotent (`DROP TRIGGER IF EXISTS` / `CREATE OR REPLACE FUNCTION`) and safe to run
again at any time, including after every later migration that touches a governed
table.

---

## Phase 0 — What you already have

Check before installing anything:

```
git --version; node -v; brew --version; code --version
```

Note which of the four are missing. Everything below is conditional on that.

---

## Phase 1 — Homebrew

Skip if `brew --version` returned a version.

```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

On Apple Silicon it will print two `echo` commands to add brew to your PATH. **Run them** —
the installer does not do it for you. Then:

```
brew --version
```

---

## Phase 2 — Node ✅ done

Both machines are on **Node 24.18.0 / npm 11.16.0**. Nothing to install.

**Standing rule, same as the VPS: never `npm audit fix --force`.**

---

## Phase 3 — Local Postgres 16

```
brew install postgresql@16
brew services start postgresql@16
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
psql --version
```

Expect `16.x`. Create the local database and role — same names as production so the
connection string differs only by host:

```
createuser --createdb lvrf_app
createdb --owner=lvrf_app lvrf
psql -d lvrf -c "ALTER ROLE lvrf_app WITH PASSWORD 'localdevonly';"
psql -d lvrf -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

If the `vector` extension fails, run `brew install pgvector` and retry. It is not needed
for the first migration.

Verify the app role connects over TCP the way the app will:

```
psql "postgresql://lvrf_app:localdevonly@localhost:5432/lvrf" -c "select current_database(), current_user;"
```

Expect `lvrf | lvrf_app`.

> `localdevonly` is a **local-only** password. It never appears in production, never gets
> committed, and the real VPS password stays in your password manager.

---

## Phase 4 — VS Code extensions

Install from the command line so it is reproducible:

```
code --install-extension anthropic.claude-code
code --install-extension GitHub.copilot
code --install-extension GitHub.copilot-chat
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension bradlc.vscode-tailwindcss
```

Then in VS Code: **Settings → Format On Save → on**, and set Prettier as the default
formatter. Copilot and Claude Code coexist fine; Copilot handles inline completion,
Claude Code handles multi-file work.

---

## Phase 5 — GitHub repo

Create it empty on GitHub first — **private**, no README, no .gitignore, no license
(you are supplying your own):

- Owner: `ValueCreatorRule76`
- Name: `lvrf-rule76`
- Visibility: **Private**

Then locally:

```
mkdir -p ~/dev && cd ~/dev
git clone git@github.com:ValueCreatorRule76/lvrf-rule76.git
cd lvrf-rule76
```

If the clone fails on authentication, your SSH key needs to be on your GitHub account —
`pbcopy < ~/.ssh/id_ed25519.pub`, then GitHub → Settings → SSH and GPG keys → New.

---

## Phase 6 — Drop in the constitutional files

From the three files I produced:

```
lvrf-rule76/
├── CLAUDE.md            ← repo root, exactly this name
└── db/
    ├── schema.ts
    └── hardening.sql
```

```
mkdir -p db
# move CLAUDE.md to the repo root and the other two into db/
```

Then the ignore file — **before** the first commit, so nothing sensitive is ever in history:

```
cat > .gitignore <<'EOF'
node_modules/
dist/
build/
.env
.env.*
!.env.example
*.local
.DS_Store
drizzle/meta/_journal.json.bak
records/out/
*.pdf
!docs/**/*.pdf
.vscode/settings.json
EOF
```

And the environment template, which **is** committed:

```
cat > .env.example <<'EOF'
DATABASE_URL=postgresql://lvrf_app:localdevonly@localhost:5432/lvrf
PORT=3001
NODE_ENV=development
SESSION_SECRET=replace-me
EOF

cp .env.example .env
```

Commit the foundation before any code exists:

```
git add -A
git commit -m "LVRF foundation: working constitution, canonical schema, db hardening"
git push -u origin main
```

Committing CLAUDE.md first matters — it is what every future Claude Code session
inherits.

---

## Phase 7 — Hand off to Claude Code

Open the repo in VS Code (`code .` from the repo root), start Claude Code, and run
`/memory` to confirm CLAUDE.md is loaded. **Do not run `/init`** — it would generate a
competing CLAUDE.md.

Then paste the kickoff prompt in the appendix below.

---

## Phase 8 — First migration (local only)

After Claude Code has scaffolded, and reading its output rather than trusting it:

```
npx drizzle-kit generate
```

Read the generated SQL in `drizzle/` **before** applying it. Specifically confirm:
every foreign key says `ON DELETE RESTRICT`, and all nine CHECK constraints appear.

```
npx drizzle-kit migrate
psql -d lvrf -f db/hardening.sql
```

**Both commands, every time — `drizzle-kit migrate` alone is not enough.** It
applies tables, columns and CHECK constraints only; every trigger in this system
(audit, delete guards, `reviewed_at`/`updated_at` stamping, supersession checks) is
declared solely in `hardening.sql` and does not exist until it is run. A database
that only ever saw `drizzle-kit migrate` looks identical to `\d` and passes a naive
smoke test, but has zero governance — see the FINDING at the top of this document.
Re-run `hardening.sql` after every later migration that touches a governed table
too; it is idempotent.

Expect 22 triggers in the verification output, and no `UPDATE`/`DELETE` privileges for
`lvrf_app` on `audit_log` or `heartbeat_events`.

Then prove the constraints actually bite — this is the acceptance test, not a formality:

```
psql "postgresql://lvrf_app:localdevonly@localhost:5432/lvrf"
```

```sql
-- must FAIL: hard delete on a governed table
DELETE FROM tenants;

-- must FAIL: person scoped to neither tenant nor institution
INSERT INTO persons (full_name, email) VALUES ('No Scope', 'x@example.com');

-- must FAIL: currency impact with no stated basis
-- (after seeding a tenant/institution/capability/metric/engagement)
```

If any of those succeed, stop and tell me. A constraint that does not fire is worse than
no constraint, because it produces false confidence.

---

## Phase 9 — Production deploy (not yet)

For reference, when the schema is stable:

1. `pg_dump -Fc lvrf > pre-migration.dump` **on the VPS**, always
2. Push to GitHub first, then pull on the VPS
3. Apply migrations with `drizzle-kit migrate`, never `push`
4. Run `hardening.sql` as the postgres superuser
5. Verify trigger count before pointing traffic at it

`drizzle-kit push` is for local iteration only. It diffs and applies without a migration
file, which is exactly what you do not want against a database holding real data.

---

# Appendix — Claude Code kickoff prompt

Paste this as your first Claude Code message in the repo.

---

Read `CLAUDE.md` at the repo root in full before writing anything. It is normative — if
anything I ask conflicts with it, flag the conflict rather than resolving it silently.

Scaffold the LVRF project. Flat layout, single `package.json` at the root (no workspaces
— this is a solo project and I want fewer moving parts):

```
db/          schema.ts (exists, do not modify), hardening.sql (exists), drizzle output
server/      Express API — index.ts, routes/, middleware/, db client
client/      Vite + React + TypeScript, Tailwind
records/     WeasyPrint templates and the record generator
```

Requirements:

1. **Do not modify `db/schema.ts`.** It is the Canonical Object Constitution. If you
   believe it contains an error, tell me and stop.
2. `drizzle.config.ts` pointing at `db/schema.ts`, output to `db/drizzle/`, reading
   `DATABASE_URL` from `.env`.
3. Express on `PORT` (3001), `pg` Pool, TypeScript throughout, ESM.
4. **Pin the Node version in the repo.** Add `.nvmrc` containing `24.18.0` and an
   `engines` field in `package.json` requiring `>=24 <25`. Both the dev Mac and the
   production VPS run 24.18.0; the repo should declare that rather than inherit whatever
   the shell provides.
5. **Actor context middleware.** Every mutating request must set the Postgres session
   variable used by the audit trigger:
   `SET LOCAL lvrf.actor_person_id = '<uuid>'` inside the transaction. Without this,
   audit rows record a null actor. Read `db/hardening.sql` to see how it is consumed.
6. **Do not scaffold any learner-facing UI.** This product's user is a value engineer.
   Learners are subjects of measurement, not users.
7. Health route only for now: `GET /api/health` returning db connectivity. No CRUD yet.
8. Do not run any migration or touch the database. I will run migrations myself after
   reading the generated SQL.

When done, list every file you created and tell me what you deliberately left out.
