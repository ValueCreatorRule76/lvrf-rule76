# ops/ — production configuration reference copies

**These are REFERENCE COPIES ONLY.**

The VPS `srv1862778` is **not** deployed from this directory. Editing anything here
changes nothing on the server. To change production, edit the file at its real path
on the box, validate, and reload the relevant service.

They exist so that losing the VPS does not mean reconstructing its configuration
from prose.

---

## Provenance caveat

These three files were **reconstructed from a verified terminal transcript**
(2026-08-03), not copied off the server. Every line was read from the live files
during that session via `cat` / `sudo cat` / `cat -A`, so the content is believed
exact — including tab indentation in the Caddyfile, confirmed by `cat -A`.

They are nonetheless **asserted, not sourced.** Before relying on them for a
rebuild, diff against the real files:

```
ssh brad@72.60.69.221
sudo diff /etc/systemd/system/lvrf-api.service ~/repo/ops/lvrf-api.service
sudo diff /usr/local/bin/lvrf-backup.sh        ~/repo/ops/lvrf-backup.sh
sudo diff /etc/caddy/Caddyfile                 ~/repo/ops/Caddyfile   # hash line will differ
```

Remove this caveat once diffed clean.

---

## Files

### `lvrf-api.service`

| | |
|---|---|
| VPS path | `/etc/systemd/system/lvrf-api.service` |
| Owner / mode | `root:root` `644` |
| Substitutions | none |

Install:

```
sudo cp ops/lvrf-api.service /etc/systemd/system/lvrf-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now lvrf-api
```

`EnvironmentFile=/srv/lvrf/.env` — that file is **not** in this repo and must never
be. It holds `DATABASE_URL` and `SESSION_SECRET`, and lives at mode `600`.

Note: systemd parses `EnvironmentFile` literally, not as a shell. An unquoted `#`
in a password truncates the value; `$` does not behave as it would under `set -a`.

**Known item:** `User=brad` means the API runs as the account that owns
`/srv/lvrf` and holds the GitHub deploy key. A compromised Node process can
rewrite the code it is running from. A dedicated `lvrf` service user with
read-only access to the tree is the correct shape. Open.

---

### `Caddyfile`

| | |
|---|---|
| VPS path | `/etc/caddy/Caddyfile` |
| Owner / mode | `root:root` `644` |
| Substitutions | **`PASTE_BCRYPT_HASH_HERE`** |
| Caddy version | 2.11.4 (`basic_auth`, not `basicauth` — the latter is pre-2.8) |

**The bcrypt hash is redacted and must never be committed.** Generate a new one:

```
caddy hash-password
```

Or without touching the clipboard:

```
read -rsp "password: " PW; echo
HASH=$(caddy hash-password --plaintext "$PW"); unset PW
sudo sed -i "s|^\t\tbrad .*|\t\tbrad ${HASH}|" /etc/caddy/Caddyfile
unset HASH
```

Save the password to a password manager **before** reloading. Then:

```
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Three structural points, each of which caused a real problem:

1. **`basic_auth` sits outside both `handle` blocks deliberately** — it must cover
   the API and the client bundle. A config that authenticates only the bundle
   leaves the API public. This happened; see the deploy record incident section.
2. **Indentation is tabs.** A displaced closing brace on the `basic_auth` line
   produces `wrong argument count or unexpected line ending after '}'`. Verify with
   `cat -A`: line 5 must read `^I^Ibrad` followed by the hash and `$`, with
   line 6 reading `^I}$`.
3. **`try_files {path} /index.html` masks missing assets.** A request for a
   nonexistent static file returns `200 text/html` rather than 404. See DEFECT-006.

**Start order matters.** Reload Caddy *first*, then start `lvrf-api`. Bringing the
API up before auth is in place opens an unauthenticated proxy.

---

### `lvrf-backup.sh`

| | |
|---|---|
| VPS path | `/usr/local/bin/lvrf-backup.sh` |
| Owner / mode | `root:root` **`700`** |
| Schedule | `/etc/cron.d/lvrf-backup` → `0 3 * * * root /usr/local/bin/lvrf-backup.sh` |

The cron entry is **not** in this repo. Recreate it verbatim; note that `cron.d`
files require the user field (`root`), unlike a user crontab. Omit it and the job
fails silently every night.

Backup directory state, not recoverable from file contents:

```
/var/backups/lvrf        700 root:root
/var/backups/lvrf/*.dump 600 root:root
```

`umask 077` in the script is what keeps new dumps at `600`; root's default umask
is `022`.

**Known item (DEFECT-004):** the `>` redirect creates the target before `pg_dump`
writes. A dump that dies partway exits non-zero *and* leaves a truncated file with
a normal name, indistinguishable for 14 days. Fix by dumping to `.partial` and
renaming on success.

**Known item:** dumps live on `/dev/sda1`, the same volume as the database. This
covers a bad migration; it does not cover losing the VPS. No offsite copy exists.

Restore verification — never into `lvrf`:

```
BK=$(sudo ls -t /var/backups/lvrf/*.dump | head -1)
sudo -u postgres createdb lvrf_restore_test
sudo -u postgres pg_restore -d lvrf_restore_test "$BK"
sudo -u postgres psql -d lvrf_restore_test -At -c "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled <> 'O';"
sudo -u postgres dropdb lvrf_restore_test
```

That last query must return `0`. Counting triggers proves they exist; `tgenabled`
proves they fire. A restored database that looks governed while silently accepting
hard deletes is the worst version of this failure.

---

## Not in this repo, by design

| | |
|---|---|
| `/srv/lvrf/.env` | `DATABASE_URL`, `SESSION_SECRET`. Mode `600`. |
| Caddy bcrypt hash | redacted above |
| `/etc/cron.d/lvrf-backup` | one line, documented above |
| `~/.ssh/deploy_lvrf` | read-only deploy key, VPS only |
| `/var/backups/lvrf/*.dump` | database contents |

Confirm `.gitignore` covers `.env` and `*.dump` before committing anything here.

**Expected placeholders, not a leak.** `.env.example` and `LVRF_Local_Setup.md`
intentionally contain a `DATABASE_URL` built from the local-development password
(`localdevonly`) and `SESSION_SECRET=replace-me`. Neither is the production
credential — the real values live only in `/srv/lvrf/.env` on the VPS, never in
this repo. A secret scan matching these two files on a `postgresql://` or
`SESSION_SECRET=` pattern is a template, not a finding.
