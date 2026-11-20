import { existingAsset, once, readFolder } from "./read";
import type { Achievement, LoadResult } from "./types";
import { areaId, optString, reqDate, reqString } from "./validate";

// Reads every note in Collections/Achievements and returns valid achievements plus readable warnings.
// A note with a broken REQUIRED field (title, date) is skipped; other problems only warn.
export function loadAchievements(): LoadResult<Achievement> {
  return once("achievements", readAchievements);
}

function readAchievements(): LoadResult<Achievement> {
  const warnings: string[] = [];
  const items: Achievement[] = [];
  for (const { rel, slug, data } of readFolder("Collections/Achievements", "achievement", warnings)) {
    const required: string[] = [];
    const optional: string[] = [];
    const title = reqString(data, "title", required);
    const date = reqDate(data, "date", required);
    if (required.length > 0) {
      warnings.push(`${rel}: skipped. ${required.join("; ")}`);
      continue;
    }

    items.push({
      slug,
      title,
      date,
      why: optString(data, "why", optional),
      image: existingAsset(data, "image", optional),
      area: areaId(data, optional),
    });
    for (const p of optional) warnings.push(`${rel}: ${p}`);
  }

  // Newest first; ties by title.
  items.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  return { items, warnings };
}
