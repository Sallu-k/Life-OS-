import { existingAsset, once, readFolder } from "./read";
import type { Certificate, CertificateCategory, LoadResult } from "./types";
import { bool, oneOf, reqDate, reqString } from "./validate";

const CATEGORIES = ["academic", "technical", "event", "other"] as const;

// Reads every note in Collections/Certificates and returns valid certificates plus readable warnings.
// A note with a broken REQUIRED field (title, issuer, date, category) is skipped; other problems only warn.
export function loadCertificates(): LoadResult<Certificate> {
  return once("certificates", readCertificates);
}

function readCertificates(): LoadResult<Certificate> {
  const warnings: string[] = [];
  const certs: Certificate[] = [];
  for (const { rel, slug, data } of readFolder("Collections/Certificates", "certificate", warnings)) {
    const required: string[] = [];
    const optional: string[] = [];
    const title = reqString(data, "title", required);
    const issuer = reqString(data, "issuer", required);
    const date = reqDate(data, "date", required);
    const category = oneOf<CertificateCategory>(data, "category", CATEGORIES, required);
    if (required.length > 0 || category === null) {
      warnings.push(`${rel}: skipped. ${required.join("; ")}`);
      continue;
    }

    certs.push({
      slug,
      title,
      issuer,
      date,
      file: existingAsset(data, "file", optional),
      category,
      highlight: bool(data, "highlight", optional),
    });
    for (const p of optional) warnings.push(`${rel}: ${p}`);
  }

  // Highlights first, then newest first; ties by title.
  certs.sort((a, b) => Number(b.highlight) - Number(a.highlight) || b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  return { items: certs, warnings };
}
