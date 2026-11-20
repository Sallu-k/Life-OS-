"use client";

// How Today answers an input: a sound, a small animation, "+XP", and the bigger moments (all habits
// done, a streak kept, a level or milestone reached). Nothing here changes data.
import { funKind, parseFun, type FunKind } from "@/lib/fun";
import { feel, type Feeling } from "@/lib/feel/sounds";
import { celebrate, floatText, replay, sparkle } from "@/lib/feel/motion";
import { dayXp, levelOf, milestoneOf } from "@/lib/vault/game";
import type { GameSnapshot } from "@/lib/vault/gameData";
import type { Day, Mark, Task } from "./types";

const MARK_FEEL: Record<Mark, Feeling> = { done: "markDone", half: "markHalf", partial: "markPartial", missed: "markMissed", na: "markNa" };
const GOOD = new Set<Mark | null>(["done", "half", "partial", "na"]);
const SEEN = "lifeos-seen-level";

// XP the day earns on Today's own terms (habits, finished tasks, fun).
export function liveXp(day: Day): number {
  const tasks = day.tasks.filter((t) => t.done);
  return dayXp(day.habits) + tasks.length * 5 + tasks.filter((t) => t.priority === "high").length * 5 + day.fun.reduce((sum, f) => sum + parseFun(f).kind.xp, 0);
}

const allLogged = (day: Day) => {
  const due = day.habits.filter((h) => h.due && h.active);
  return due.length > 0 && due.every((h) => GOOD.has(h.state));
};

export interface FeelContext {
  game: boolean;
  snapshot?: GameSnapshot;
  extra: { xp: number }; // XP gained on this page since it loaded
  streaked: Set<string>; // habits whose streak was cheered today
}

function seenLevel(): number {
  try {
    return Number(localStorage.getItem(SEEN) ?? -1);
  } catch {
    return -1;
  }
}
export function markSeen(level: number): void {
  try {
    if (level > seenLevel()) localStorage.setItem(SEEN, String(level));
  } catch {
    // Not stored; the reveal may show again.
  }
}

// After any change: +XP near the control, and a level-up or milestone when the running total crosses one.
function reward(before: Day, after: Day, anchor: Element | null, ctx: FeelContext): void {
  if (!ctx.game) return;
  const gain = liveXp(after) - liveXp(before);
  if (gain > 0) floatText(anchor, `+${gain} XP`);
  if (!ctx.snapshot) return;
  const oldLevel = levelOf(ctx.snapshot.xp + ctx.extra.xp).level;
  ctx.extra.xp += gain;
  const newLevel = levelOf(ctx.snapshot.xp + ctx.extra.xp).level;
  if (newLevel > oldLevel && newLevel > seenLevel()) {
    const milestone = milestoneOf(newLevel) !== milestoneOf(oldLevel);
    setTimeout(() => {
      feel(milestone ? "milestone" : "levelUp");
      celebrate(`Level ${newLevel}`, milestone ? "Milestone" : "Level up");
    }, 450);
    markSeen(newLevel);
  }
}

export function reactMark(before: Day, after: Day, id: string, state: Mark | null, button: Element | null, ctx: FeelContext): void {
  feel(state ? MARK_FEEL[state] : "unmark");
  replay(button, "feel-pop");
  if (state === "done" || state === "half") replay(button?.closest("li") ?? null, "feel-glow");
  reward(before, after, button, ctx);

  // A streak kept (only for days counted as good, once per habit per page).
  const streak = ctx.snapshot?.streaks[id] ?? 0;
  if (ctx.game && (state === "done" || state === "half") && streak >= 2 && !ctx.streaked.has(id)) {
    ctx.streaked.add(id);
    setTimeout(() => {
      feel("streak");
      floatText(button?.closest("li") ?? button, `🔥 ${streak + 1} days`);
    }, 380);
  }
  // Every habit due today logged: the big daily moment.
  if (!allLogged(before) && allLogged(after)) {
    setTimeout(() => {
      feel("allDone");
      sparkle(document.getElementById("habits-heading"), 16, 110);
    }, 300);
  }
}

export function reactTask(before: Day, after: Day, task: Task, changes: Record<string, unknown>, row: Element | null, ctx: FeelContext): void {
  if (changes.remove) feel("remove");
  else if (changes.moveTo) feel("taskMove");
  else if (changes.done === true) {
    feel("taskDone");
    replay(row?.querySelector("[data-task-text]") ?? null, "feel-strike");
  } else if (changes.done === false) feel("taskUndo");
  else feel("saved");
  reward(before, after, row?.querySelector("input[type=checkbox]") ?? row, ctx);
}

export function reactTaskAdd(before: Day, after: Day, ctx: FeelContext): void {
  feel("taskAdd");
  reward(before, after, null, ctx);
}

const FUN_FEEL: Record<FunKind, Feeling> = { story: "funStory", competitive: "funCompetitive", series: "funSeries", movie: "funMovie", other: "funOther" };
export function reactFun(before: Day, after: Day, ctx: FeelContext): void {
  const added = after.fun.length > before.fun.length ? after.fun.at(-1) : null;
  if (!added) return feel("remove");
  feel(FUN_FEEL[parseFun(added).kind.id] ?? FUN_FEEL[funKind("other").id]);
  reward(before, after, document.getElementById("fun-heading"), ctx);
}

export function reactSaved(button: Element | null): void {
  feel("saved");
  replay(button, "feel-saved");
}
