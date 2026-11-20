// PC screen time, measured: once a minute, if the keyboard or mouse was used in the last minute, that
// minute counts as screen time for today. (Windows' own GetLastInputInfo, through a small PowerShell
// helper; a locked or idle PC does not count.) Minutes are kept per day in %LOCALAPPDATA%/LifeOS/pc-usage.json.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(process.env.LOCALAPPDATA || homedir(), "LifeOS");
const FILE = join(DIR, "pc-usage.json");
const pad = (n) => String(n).padStart(2, "0");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function read() {
  try {
    return existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
  } catch {
    return {};
  }
}

// Hours of PC use on a date (null when nothing was measured that day).
export function pcHours(date) {
  const minutes = read()[date];
  return typeof minutes === "number" ? Math.round((minutes / 60) * 10) / 10 : null;
}

// Starts measuring (Windows only). The helper prints how long the PC has been idle, every 60 seconds.
export function startUsage() {
  if (process.platform !== "win32" || process.env.LIFEOS_NO_USAGE) return;
  const script = `
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class Idle {
  [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  public static uint Ms() { var i = new LASTINPUTINFO(); i.cbSize = (uint)Marshal.SizeOf(i); GetLastInputInfo(ref i); return (uint)Environment.TickCount - i.dwTime; }
}
'@
while ($true) { [Console]::Out.WriteLine([Idle]::Ms()); [Console]::Out.Flush(); Start-Sleep -Seconds 60 }`;
  const child = spawn("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", script], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const idle = Number(line.trim());
      if (!Number.isFinite(idle) || idle > 60_000) continue; // idle for the whole minute: not counted
      const data = read();
      const d = today();
      data[d] = (data[d] ?? 0) + 1;
      // Keep the last 400 days.
      for (const k of Object.keys(data).sort().slice(0, -400)) delete data[k];
      mkdirSync(DIR, { recursive: true });
      writeFileSync(FILE, JSON.stringify(data));
    }
  });
  child.on("exit", () => setTimeout(startUsage, 60_000)); // restart the helper if it ever stops
  process.on("exit", () => child.kill());
}
