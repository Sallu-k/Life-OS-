// Weekly vault backup: the whole vault zipped into a backup folder (OneDrive if there is one, so it is
// also off this PC), keeping the last 8. Checked when the server starts and every few hours; runs when
// the last backup is 7 or more days old (or on "Back up now" in Settings).
// Uses Windows' own tar.exe (it writes .zip files); the old per-change copies (.lifeos-backup) are left out.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { vaultRoot } from "./vault-write.mjs";

const STATE = join(process.env.LOCALAPPDATA || homedir(), "LifeOS", "backup.json");
const KEEP = 8;
const WEEK = 7 * 864e5;

function state() {
  try {
    return existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
  } catch {
    return {};
  }
}
function saveState(s) {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, JSON.stringify(s, null, 2));
}

export function backupDir() {
  const chosen = state().dir;
  if (chosen) return chosen;
  const oneDrive = process.env.OneDrive || process.env.OneDriveConsumer;
  return join(oneDrive && existsSync(oneDrive) ? oneDrive : join(homedir(), "Documents"), "LifeOS-backups");
}

export function backupStatus() {
  const dir = backupDir();
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^LifeOS-Vault-.*\.zip$/.test(f)).sort() : [];
  const s = state();
  return { dir, last: s.last ?? null, lastSize: s.lastSize ?? null, error: s.error ?? null, count: files.length };
}

export function setBackupDir(dir) {
  const s = state();
  s.dir = String(dir || "").trim() || undefined;
  saveState(s);
  return backupStatus();
}

export function runBackup() {
  const vault = vaultRoot();
  const dir = backupDir();
  const s = state();
  try {
    mkdirSync(dir, { recursive: true });
    const now = new Date();
    const stamp = now.toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const name = `LifeOS-Vault-${stamp}.zip`;
    const zip = join(dir, name);
    // tar runs inside the backup folder with just the file name: a "C:" in -f would be read as a host name.
    // Windows' own tar (bsdtar) by full path: another tar on the PATH (e.g. Git's) cannot write zips.
    const tar = join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
    const r = spawnSync(tar, ["-c", "--format", "zip", "-f", name, "--exclude", ".lifeos-backup", "--exclude", ".obsidian/workspace*", "-C", dirname(vault), basename(vault)], { cwd: dir, encoding: "utf8", windowsHide: true });
    if (r.status !== 0 || !existsSync(zip)) throw new Error((r.stderr || "tar failed").trim().slice(0, 300));
    // Keep the newest KEEP zips.
    const zips = readdirSync(dir).filter((f) => /^LifeOS-Vault-.*\.zip$/.test(f)).sort();
    for (const old of zips.slice(0, -KEEP)) rmSync(join(dir, old), { force: true });
    Object.assign(s, { last: now.toISOString(), lastSize: statSync(zip).size, error: null });
    saveState(s);
    console.log(`Vault backed up to ${zip}`);
  } catch (err) {
    Object.assign(s, { error: err.message });
    saveState(s);
    console.log(`Vault backup failed: ${err.message}`);
  }
  return backupStatus();
}

// Called at start and every 6 hours: back up when the last one is a week old.
export function startBackups() {
  if (process.env.LIFEOS_NO_BACKUP) return;
  const check = () => {
    const last = state().last;
    if (!last || Date.now() - new Date(last).getTime() >= WEEK) runBackup();
  };
  setTimeout(check, 60_000); // a minute after start, so starting stays quick
  setInterval(check, 6 * 3600_000);
}
