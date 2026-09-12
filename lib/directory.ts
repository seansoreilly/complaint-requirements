/**
 * Firm lookup. The model only ever proposes a name string; this module decides
 * which directory record (if any) it refers to and supplies the member number
 * and complaint contact. That keeps invented firm details structurally
 * impossible rather than merely discouraged by the prompt.
 */
import firmsData from "@/data/firms.json";

export interface ComplaintContact {
  phone: string;
  email: string;
  url: string;
}

export type Sector = "superannuation" | "banking" | "credit" | "insurance";

export interface Firm {
  name: string;
  abn: string;
  afca_member_no: string;
  aliases: string[];
  sector: Sector;
  complaint_contact: ComplaintContact;
}

/** What a firm in this sector is presumed to be providing, absent better evidence. */
export const SECTOR_SERVICE_TYPE: Record<Sector, string> = {
  superannuation: "Superannuation",
  banking: "Banking deposits and payments",
  credit: "Credit",
  insurance: "General insurance",
};

export const FIRMS: Firm[] = firmsData as Firm[];

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Digits only, so "65 714 394 898" and "65714394898" compare equal. */
function digits(value: string): string {
  return value.replace(/\D+/g, "");
}

const STOPWORDS = new Set(["the", "of", "and", "australia", "australian", "group", "ltd", "limited", "pty"]);

/**
 * Words that appear across many firm names. Matching only on these says nothing
 * about which firm is meant, so a candidate needs at least one distinctive hit.
 */
const GENERIC = new Set(["bank", "banking", "super", "superannuation", "financial", "services", "insurance", "fund", "finance", "corporation"]);

function tokens(value: string): string[] {
  return normalise(value).split(" ").filter((t) => t.length > 0);
}

/** 0-1. Token overlap, ignoring stopwords, with a bonus for prefix matches. */
function score(query: string, candidate: string): number {
  const q = tokens(query);
  const c = tokens(candidate);
  if (q.length === 0 || c.length === 0) return 0;

  const meaningful = q.filter((t) => !STOPWORDS.has(t));
  const probe = meaningful.length > 0 ? meaningful : q;

  let hits = 0;
  let distinctiveHits = 0;
  for (const token of probe) {
    let hit = 0;
    if (c.includes(token)) hit = 1;
    else if (c.some((ct) => ct.startsWith(token) || token.startsWith(ct))) hit = 0.6;
    hits += hit;
    if (hit > 0 && !GENERIC.has(token)) distinctiveHits += hit;
  }
  // "Bank of Nowhere" overlaps every bank on the word "bank" alone; that is not
  // evidence of which firm is meant. A query made up entirely of generic words
  // ("australian super") is exempt — there is nothing more distinctive to want,
  // and the unmatched-token penalty below still separates the candidates.
  const allGeneric = probe.every((t) => GENERIC.has(t));
  if (distinctiveHits === 0 && !allGeneric) return 0;

  // Tokens in the query that match nothing are evidence against this candidate.
  const misses = probe.length - probe.filter((t) =>
    c.includes(t) || c.some((ct) => ct.startsWith(t) || t.startsWith(ct)),
  ).length;
  if (misses > 0 && distinctiveHits === 0) return 0;

  const overlap = hits / probe.length;

  // A query that is a contiguous substring of the name is a strong signal
  // ("commbank" vs "Commonwealth Bank of Australia" is not, but "westpac" is).
  const substring = normalise(candidate).includes(normalise(query)) ? 0.25 : 0;
  return Math.min(1, overlap * 0.85 + substring);
}

export interface FirmMatch {
  firm: Firm;
  confidence: number;
}

export type LookupResult =
  | { status: "matched"; firm: Firm }
  | { status: "ambiguous"; candidates: FirmMatch[] }
  | { status: "not_found"; query: string };

const CONFIDENT = 0.75;
const PLAUSIBLE = 0.35;

/**
 * Resolve a free-text firm reference. An ABN/ACN match short-circuits; otherwise
 * a clear leader wins and a cluster of near-ties comes back for disambiguation.
 */
export function lookupFirm(query: string): LookupResult {
  const trimmed = query.trim();
  if (trimmed.length === 0) return { status: "not_found", query };

  const queryDigits = digits(trimmed);
  if (queryDigits.length >= 9) {
    const byNumber = FIRMS.find(
      (f) => digits(f.abn) === queryDigits || f.afca_member_no === queryDigits,
    );
    if (byNumber) return { status: "matched", firm: byNumber };
  }

  const ranked = FIRMS.map((firm) => {
    const best = Math.max(score(trimmed, firm.name), ...firm.aliases.map((a) => score(trimmed, a)));
    return { firm, confidence: best };
  })
    .filter((m) => m.confidence >= PLAUSIBLE)
    .sort((a, b) => b.confidence - a.confidence);

  if (ranked.length === 0) return { status: "not_found", query: trimmed };

  const [top, second] = ranked;

  // A query whose words are ALL generic, and which matches the leader on nothing
  // but those generic words, must not settle on one firm. "super fund" scores
  // 1.0 against "Hesta Super Fund" — both its words are in that name — so it
  // came back matched, and the route stamped Hesta's member number onto a
  // complaint where the person had named no firm at all.
  //
  // The test is the MATCH, not the query. "australian super" is also all
  // stopwords and generic words, but it covers AustralianSuper's name entirely,
  // which is a real signal; "super fund" covers only part of Hesta's. So the
  // leader still wins when the query accounts for its whole name, and otherwise
  // the candidates go back for disambiguation.
  const queryTokens = tokens(trimmed).filter((t) => !STOPWORDS.has(t));
  const allGenericQuery = queryTokens.length > 0 && queryTokens.every((t) => GENERIC.has(t));
  // Does the query account for the leader's whole name? Compared with spacing
  // removed, so "australian super" covers "AustralianSuper" — the case the
  // generic-word exemption was written for — while "super fund" covers only
  // part of "Hesta Super Fund" and so cannot settle it.
  const squash = (v: string): string => normalise(v).replace(/ /g, "");
  const coversLeaderName =
    squash(top.firm.name) === squash(trimmed) ||
    tokens(top.firm.name)
      .filter((t) => !STOPWORDS.has(t))
      .every((t) => queryTokens.some((q) => t === q || t.startsWith(q) || q.startsWith(t)));

  if (
    (!allGenericQuery || coversLeaderName) &&
    top.confidence >= CONFIDENT &&
    (!second || top.confidence - second.confidence >= 0.15)
  ) {
    return { status: "matched", firm: top.firm };
  }

  return { status: "ambiguous", candidates: ranked.slice(0, 4) };
}
