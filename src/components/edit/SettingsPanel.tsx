"use client";

import { useEffect, useState } from "react";
import { api, getServerUrls, getToken, setServerUrls, setToken, useIsApp, useServer } from "@/lib/api";
import { connectToPc } from "@/lib/connect";
import { feel } from "@/lib/feel/sounds";
import { appVersion, applyUpdate, checkForUpdate } from "@/lib/liveUpdate";
import { flush } from "@/lib/offline";
import { openUsageSettings, pinWidget, usageAccess } from "@/lib/device";
import { DaySettings } from "./DaySettings";
import { RewardSettings } from "./RewardSettings";
import { ReadingGoal } from "./ReadingGoal";
import { BackupSettings } from "./BackupSettings";
import { allowExactReminders, exactReminders } from "@/lib/phoneReminders";

// Shows whether editing is available, the game switch, and lets the phone app enter the PC addresses and token.
export function SettingsPanel() {
  const server = useServer();
  const app = useIsApp();
  const [wifi, setWifi] = useState("");
  const [tailscale, setTailscale] = useState("");
  const [token, setTokenState] = useState("");
  const [check, setCheck] = useState("");
  useEffect(() => {
    setTokenState(getToken());
    const urls = getServerUrls();
    setWifi(urls.find((u) => !/\/\/100\./.test(u)) ?? "");
    setTailscale(urls.find((u) => /\/\/100\./.test(u)) ?? "");
  }, []);

  async function test() {
    setToken(token);
    if (app) setServerUrls([wifi, tailscale]);
    try {
      await api("books", { retry: true });
      const { sent } = await flush(true);
      feel("saved");
      setCheck(`Connected. You can edit from this device.${sent ? ` Sent ${sent} waiting change${sent > 1 ? "s" : ""}.` : ""}`);
    } catch (e) {
      setCheck((e as Error).message);
    }
  }

  // One tap: the addresses built into the app, then a search of the home network.
  async function connect() {
    setCheck("Looking for your PC…");
    const url = await connectToPc(setCheck);
    if (!url) return setCheck("Could not find the PC. Is it on, with LifeOS running, and is the phone on the same Wi-Fi?");
    setWifi(/\/\/100\./.test(url) ? wifi : url);
    setTokenState(getToken());
    try {
      await api("books", { retry: true }); // the token works too
      const { sent } = await flush(true);
      feel("saved");
      setCheck(`Connected to ${url}.${sent ? ` Sent ${sent} waiting change${sent > 1 ? "s" : ""}.` : ""}`);
    } catch (e) {
      setCheck(`Found the PC at ${url}, but: ${(e as Error).message}`);
    }
  }

  const canEdit = server && server.token !== false;
  return (
    <div className="flex flex-col gap-6">
      <div className="card flex flex-col gap-5 p-5 text-sm">
        {server === null && <p className="text-ink-dim">Checking for the LifeOS server…</p>}
        {server === false && !app && (
          <p className="text-ink-dim">
            This copy of the site is read-only. To edit, start LifeOS on your PC (the LifeOS shortcut, or <code>npm start</code>).
          </p>
        )}
        {server === false && app && <p className="text-ink-dim">The PC is not reachable right now. Today still works offline and sends changes later.</p>}
        {canEdit && (
          <p>
            Connected to the LifeOS server · vault <strong>{server.vault}</strong>
            {server.building ? " · rebuilding…" : ""}
          </p>
        )}
        {canEdit && server.lastBuild && !server.lastBuild.ok && (
          <p className="text-copper">The last rebuild failed, so pages show the previous version (your edits are saved in the vault). Details: %LOCALAPPDATA%\LifeOS\build.log</p>
        )}
        {server && server.local && !app && <PhoneHelp addresses={server.addresses ?? []} />}
        {app && (
          <div className="flex flex-col gap-2">
            <button type="button" className="chip edit-primary w-fit px-5 py-2 text-base" onClick={connect}>
              Connect to my PC
            </button>
            <span className="text-ink-dim" role="status">
              {check || (getServerUrls()[0] ? `PC: ${getServerUrls()[0]}` : "")}
            </span>
          </div>
        )}
        {app && <ExactReminders />}
        {app && <PhoneScreenTime />}
        {app && <WidgetButton />}
        {app && <AppVersion />}
        {(app || (server && !server.local)) && (
          <details className="manual-connect">
            <summary className="cursor-pointer text-ink-dim">Enter the address by hand</summary>
            <div className="mt-3 flex flex-col gap-4">
              {app && (
                <>
                  <Field label="PC address on home Wi-Fi (e.g. http://192.168.1.20:4173)" value={wifi} onChange={setWifi} placeholder="http://192.168.x.x:4173" />
                  <Field label="PC address over Tailscale, for away from home (optional)" value={tailscale} onChange={setTailscale} placeholder="http://100.x.y.z:4173" />
                </>
              )}
              <label className="edit-field">
                <span>Token (LIFEOS_TOKEN in .env.local on the PC)</span>
                <input type="password" value={token} onChange={(e) => setTokenState(e.target.value)} autoComplete="off" />
              </label>
              <div className="flex items-center gap-3">
                <button type="button" className="chip" onClick={test}>
                  Save and test
                </button>
                {!app && <span className="text-ink-dim">{check}</span>}
              </div>
            </div>
          </details>
        )}
      </div>
      {canEdit && server.day && <DaySettings setup={server.day} />}
      {canEdit && <RewardSettings />}
      {canEdit && <ReadingGoal />}
      {server && server.local && !app && <BackupSettings />}
      {canEdit && typeof server.game === "boolean" && <GameSwitch on={server.game} />}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange(v: string): void; placeholder: string }) {
  return (
    <label className="edit-field">
      <span>{label}</span>
      <input type="url" inputMode="url" value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" placeholder={placeholder} />
    </label>
  );
}

function PhoneHelp({ addresses }: { addresses: string[] }) {
  return (
    <div className="flex flex-col gap-2 text-ink-dim">
      <p>This is the PC itself, so editing works without a token.</p>
      <p>The phone app connects to this PC by itself (the address and token are built into it). If it ever cannot, tap &ldquo;Connect to my PC&rdquo; in the app&rsquo;s Settings. This PC can be reached at:</p>
      {addresses.length ? (
        <ul className="flex flex-col gap-1">
          {addresses.map((a) => (
            <li key={a}>
              <code className="text-ink">{a}</code> {/\/\/100\./.test(a) ? "· Tailscale (works away from home)" : "· home Wi-Fi"}
            </li>
          ))}
        </ul>
      ) : (
        <p>No network address yet: connect the PC to Wi-Fi (or start Tailscale) and restart LifeOS.</p>
      )}
    </div>
  );
}

// Turns the game layer (XP, levels, rank, streaks, reviews) on or off. Saved in _system/settings.md.
function GameSwitch({ on }: { on: boolean }) {
  const [value, setValue] = useState(on);
  const [msg, setMsg] = useState("");
  async function toggle(next: boolean) {
    setValue(next);
    try {
      await api("settings", { method: "PUT", body: { game: next } });
      setMsg("Saved. The site is rebuilding; reload in a minute.");
    } catch (e) {
      setValue(!next);
      setMsg((e as Error).message);
    }
  }
  return (
    <div className="card flex flex-col gap-3 p-5 text-sm">
      <label className="flex items-center gap-3">
        <input type="checkbox" className="h-5 w-5 accent-[var(--brass)]" checked={value} onChange={(e) => toggle(e.target.checked)} />
        <span className="text-ink">Game layer: XP, levels, rank, streaks and weekly reviews</span>
      </label>
      <p className="text-ink-dim">Turning it off only hides it; your habit data and the Life areas graph stay the same, and you can turn it back on any time.</p>
      {msg && <p className="text-ink-dim">{msg}</p>}
    </div>
  );
}

// Phone app: which version it runs and a manual "Check for updates" (it also checks by itself).
function AppVersion() {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof appVersion>>>(null);
  const [msg, setMsg] = useState("");
  const refresh = () => void appVersion().then(setInfo);
  useEffect(refresh, []);
  async function check() {
    setMsg("Checking the PC for a newer LifeOS…");
    setMsg(await checkForUpdate(true));
    refresh();
  }
  return (
    <div className="flex flex-col gap-2 border-t border-ink-dim/15 pt-4">
      <p className="text-ink-dim">
        App version {info?.version || "?"}
        {info?.fromApk ? " (as installed)" : info?.built ? " (updated from the PC)" : ""}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="chip" onClick={check}>
          Check for updates
        </button>
        {info?.ready && (
          <button type="button" className="chip edit-primary" onClick={() => void applyUpdate()}>
            Restart to update
          </button>
        )}
      </div>
      {msg && <p className="text-ink-dim">{msg}</p>}
    </div>
  );
}

// Phone app: reminders exactly on time need Android's "Alarms & reminders" permission (asked once, here).
function ExactReminders() {
  const [exact, setExact] = useState<boolean | null>(null);
  useEffect(() => void exactReminders().then(setExact, () => setExact(null)), []);
  if (exact === null) return null;
  return (
    <div className="flex flex-col gap-2 border-t border-ink-dim/15 pt-4">
      <p className="text-ink-dim">
        {exact ? "Reminders come exactly on time." : "Reminders may come a few minutes late. Allow exact times to get them on the minute."}
      </p>
      {!exact && (
        <button type="button" className="chip w-fit" onClick={async () => setExact(await allowExactReminders())}>
          Allow exact reminder times
        </button>
      )}
    </div>
  );
}

// Phone app: screen time measured by Android (needs "Usage access" for LifeOS, allowed once).
function PhoneScreenTime() {
  const [granted, setGranted] = useState<boolean | null>(null);
  useEffect(() => {
    const check = () => void usageAccess().then(setGranted);
    check();
    document.addEventListener("visibilitychange", check); // re-check after coming back from Android settings
    return () => document.removeEventListener("visibilitychange", check);
  }, []);
  if (granted === null) return null;
  return (
    <div className="flex flex-col gap-2 border-t border-ink-dim/15 pt-4">
      <p className="text-ink-dim">
        {granted
          ? "Phone screen time is measured and added to the day (with the PC's)."
          : "Let LifeOS measure your phone's screen time: allow Usage access for LifeOS in the Android screen that opens."}
      </p>
      {!granted && (
        <button type="button" className="chip w-fit" onClick={() => void openUsageSettings()}>
          Allow usage access
        </button>
      )}
    </div>
  );
}

// Phone app: put the habits widget or the tasks widget on the home screen.
function WidgetButton() {
  const [msg, setMsg] = useState("");
  const pin = async (kind?: "tasks") => setMsg((await pinWidget(kind)) ? "Confirm on the prompt to add it." : "Add it from the home screen: long-press, Widgets, LifeOS.");
  return (
    <div className="flex flex-col gap-2 border-t border-ink-dim/15 pt-4">
      <p className="text-ink-dim">Home-screen widgets: today&rsquo;s habits, or your tasks (overdue, today, this week) with + to plan one. One tap ticks, without opening the app.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="chip w-fit" onClick={() => void pin()}>
          Add habits widget
        </button>
        <button type="button" className="chip w-fit" onClick={() => void pin("tasks")}>
          Add tasks widget
        </button>
      </div>
      {msg && <p className="text-ink-dim">{msg}</p>}
    </div>
  );
}
