#!/usr/bin/env node
// Encrypted backup of the STARS offline LAN copy's database.
//
//   node lan/scripts/backup.mjs        back up now (inside the sync container;
//                                       `node lan/stars.mjs backup` runs it)
//   import { backupIfDue } …           the nightly run, called by sync.mjs
//
// The copy holds every student's records, so each backup is encrypted with
// BACKUP_PASSPHRASE (made by lan/setup.mjs and kept in lan/.env). Without the
// passphrase a backup cannot be opened: store it somewhere safe, away from
// this machine. Files land in lan/backups; the last 14 are kept.
//
// To restore (lan/README.md has the full steps):
//   openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in FILE | pg_restore …
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = process.env.BACKUP_DIR_IN_CONTAINER || "/backups";
const KEEP = 14;
const NIGHTLY_HOUR = 2; // 2 AM, Manila time

const manilaNow = () => new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
const stamp = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;

export function backupNow() {
  const passphrase = process.env.BACKUP_PASSPHRASE;
  if (!passphrase) throw new Error("BACKUP_PASSPHRASE is not set in lan/.env; refusing to write an unencrypted backup.");
  fs.mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, `stars-lan-${stamp(manilaNow())}.dump.enc`);
  // Written under a temporary name and renamed once checked, so a failed
  // run never leaves a half file behind, nor removes a good backup that
  // happens to carry the same minute in its name.
  const partial = `${file}.partial`;

  // pg_dump's custom format, piped straight into openssl: the unencrypted
  // dump never touches the disk. pipefail matters: without it the pipe
  // reports only openssl's result, so a pg_dump that failed (the database
  // still starting after the laptop boots) left a 32-byte file of encrypted
  // nothing, counted as that day's backup. That happened from Nov 1 to 15.
  const result = spawnSync(
    "sh",
    ["-c", `set -o pipefail; pg_dump "$LAN_DB_URL" --format=custom --no-owner | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -out "${partial}"`],
    { encoding: "utf8", env: process.env },
  );
  if (result.status !== 0 || !fs.existsSync(partial)) {
    fs.rmSync(partial, { force: true });
    throw new Error(`backup failed: ${(result.stderr || "").trim().slice(-300)}`);
  }

  // A backup counts only once it opens: decrypt the whole file and have
  // pg_restore turn every table back into SQL (thrown away). A cut-off or
  // empty file fails this. (`pg_restore --list` would not do: it stops after
  // the table of contents, and openssl then reports a broken pipe.) A file
  // that fails is deleted, so the next pass of the copy loop tries again
  // instead of treating the day as done.
  const check = spawnSync(
    "sh",
    ["-c", `set -o pipefail; openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in "${partial}" | pg_restore -f /dev/null`],
    { encoding: "utf8", env: process.env },
  );
  if (check.status !== 0) {
    fs.rmSync(partial, { force: true });
    throw new Error(`backup did not open when checked, so it was deleted: ${(check.stderr || "").trim().slice(-300)}`);
  }

  fs.renameSync(partial, file);

  const backups = fs.readdirSync(DIR).filter((f) => /^stars-lan-.+\.dump\.enc$/.test(f)).sort();
  for (const old of backups.slice(0, Math.max(0, backups.length - KEEP))) fs.rmSync(path.join(DIR, old));
  return { file, bytes: fs.statSync(file).size };
}

/** The nightly backup: once a day, the first time the copy loop runs after 2 AM. */
export function backupIfDue() {
  const now = manilaNow();
  if (now.getHours() < NIGHTLY_HOUR) return null;
  const today = stamp(now).slice(0, 10);
  // Only finished backups count; a .partial left by a shutdown mid-backup does not.
  const done = fs.existsSync(DIR) && fs.readdirSync(DIR).some((f) => f.startsWith(`stars-lan-${today}_`) && f.endsWith(".dump.enc"));
  return done ? null : backupNow();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { file, bytes } = backupNow();
    console.log(`✓ Backup written: lan/backups/${path.basename(file)} (${(bytes / 1024 / 1024).toFixed(1)} MB, encrypted)`);
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  }
}
