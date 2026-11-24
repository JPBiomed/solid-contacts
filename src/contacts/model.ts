/**
 * A person, and how they map to and from RDF.
 *
 * Pure functions only, no I/O: `store.ts` reads and writes.
 *
 * A person is a Thing at `people.ttl#<id>`. Each email, phone and address is a
 * Thing of its own at `people.ttl#<id>-e0`, `-t0`, `-a0`…, carrying its value
 * and its kind (home, work, mobile…). That is how vCard in RDF and SolidOS
 * Contacts write them, so another Solid app can read these people, and it is
 * what lets one email be "work" and another "home". The person's own id is a
 * prefix of all of them, so replacing or removing a person replaces or
 * removes everything that is theirs.
 */
import {
  buildThing,
  createThing,
  getBoolean,
  getDatetime,
  getStringNoLocaleAll,
  getThing,
  getThingAll,
  getUrl,
  getUrlAll,
  type SolidDataset,
  type Thing,
} from "@inrupt/solid-client";
import { readLiteral } from "../lib/literal";
import { DCT, RDF_TYPE, RDFS_LABEL, SC, SCHEMA, VCARD } from "./vocab";

// ---------------------------------------------------------------- types

/** An email or phone with its kind: "mobile", "home", "work", "other", or a word of the person's own. */
export interface Labeled {
  value: string;
  type: string;
}

export interface Address {
  street: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
  type: string;
}

export interface Person {
  /** The IRI. Empty on someone not yet saved. */
  id: string;
  created?: Date;
  modified?: Date;
  prefix: string;
  given: string;
  middle: string;
  family: string;
  suffix: string;
  nickname: string;
  /**
   * The name as shown. Composed from the parts when there are any; kept as
   * typed otherwise (an import that only had "Jane Doe", a company name).
   */
  name: string;
  company: string;
  title: string;
  department: string;
  emails: Labeled[];
  phones: Labeled[];
  addresses: Address[];
  /** `YYYY-MM-DD`, or `--MM-DD` when the year is unknown. */
  birthday: string;
  websites: string[];
  /** Normalized `https://www.linkedin.com/in/<slug>/`. */
  linkedin: string;
  /** Google-style labels: "Friends", "Fix My MedTech". As typed, not lower-cased. */
  labels: string[];
  note: string;
  starred: boolean;
  /** Set when moved to the trash; emptied for good after 30 days. */
  trashedAt: Date | null;
  /** Where the person first came from: "manual", "google", "linkedin", "phone", "file"… */
  source: string;
  /** Ids elsewhere, `<system>:<account>:<id>`, so a re-import recognises someone. */
  externalIds: string[];
}

export const PHONE_TYPES = ["mobile", "home", "work", "main", "other"] as const;
export const EMAIL_TYPES = ["home", "work", "other"] as const;
export const ADDRESS_TYPES = ["home", "work", "other"] as const;

export function emptyPerson(): Person {
  return {
    id: "", prefix: "", given: "", middle: "", family: "", suffix: "", nickname: "", name: "",
    company: "", title: "", department: "", emails: [], phones: [], addresses: [], birthday: "",
    websites: [], linkedin: "", labels: [], note: "", starred: false, trashedAt: null,
    source: "manual", externalIds: [],
  };
}

export function emptyAddress(type = "home"): Address {
  return { street: "", city: "", region: "", postcode: "", country: "", type };
}

// ---------------------------------------------------------------- names and display

/** "Dr Jane A. Doe Jr" from the parts, or "" when there are none. */
export function composeName(p: Pick<Person, "prefix" | "given" | "middle" | "family" | "suffix">): string {
  return [p.prefix, p.given, p.middle, p.family, p.suffix].map((s) => s.trim()).filter(Boolean).join(" ");
}

/** What the list shows: the name, else the nickname, company, email or phone. */
export function displayName(p: Person): string {
  return (
    composeName(p) || p.name.trim() || p.nickname || p.company || p.emails[0]?.value || p.phones[0]?.value || "(no name)"
  );
}

/** The sort key: by first name (Google's default) or by last name. */
export function sortKey(p: Person, by: "first" | "last" = "first"): string {
  const name = by === "last" && p.family ? `${p.family} ${p.given}` : displayName(p);
  return fold(name);
}

/** "Jane Doe" → "JD"; a single word gives its first letter. */
export function initials(p: Person): string {
  const words = displayName(p).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/** One of eight avatar colours, the same for the same person every time. */
export function avatarHue(p: Person): number {
  const s = displayName(p);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 8;
}

/** The letter a person is filed under in the list: A–Z, or "#". */
export function letterOf(p: Person, by: "first" | "last" = "first"): string {
  const c = sortKey(p, by)[0]?.toUpperCase() ?? "#";
  return /[A-Z]/.test(c) ? c : "#";
}

/** Lower-case, accent-folded, for search and sorting. "Élodie" → "elodie". */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** True when every word of the query is somewhere in the person. */
export function matchesQuery(p: Person, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const digits = (s: string) => s.replace(/\D/g, "");
  const text = fold(
    [
      displayName(p), p.nickname, p.company, p.title, p.department, p.note, p.linkedin,
      ...p.emails.map((e) => e.value), ...p.labels, ...p.websites,
      ...p.addresses.map((a) => `${a.street} ${a.city} ${a.country}`),
    ].join(" ")
  );
  const phoneDigits = p.phones.map((t) => digits(t.value)).join(" ");
  return words.every((w) => text.includes(w) || (digits(w).length >= 3 && phoneDigits.includes(digits(w))));
}

// ---------------------------------------------------------------- normalizers

/**
 * `linkedin.com/in/Jane-Doe-123?utm=x` → `https://www.linkedin.com/in/jane-doe-123/`.
 * "" for anything that is not a profile or company page, so a bad paste never
 * becomes a dedup key.
 */
export function normalizeLinkedIn(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return "";
  }
  if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return "";
  const m = url.pathname.match(/^\/(in|company)\/([^/]+)/i);
  if (!m) return "";
  return `https://www.linkedin.com/${m[1].toLowerCase()}/${decodeURIComponent(m[2]).toLowerCase()}/`;
}

/** The first LinkedIn profile URL in free text ("Check out Jane's profile https://…"). */
export function extractLinkedIn(text: string): string {
  for (const candidate of text.match(/(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/[^\s"'<>]+/gi) ?? []) {
    const url = normalizeLinkedIn(candidate);
    if (url) return url;
  }
  return "";
}

/** A web address with a scheme, or "" when it is not one. */
export function normalizeUrl(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`).href;
  } catch {
    return "";
  }
}

/** For a `tel:` link: digits and a leading +, nothing else. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/(?!^\+)[^\d]/g, "")}`;
}

/**
 * For wa.me: international digits without +. A number written nationally
 * (0475…) cannot be turned into one without knowing the country, so it gives "".
 */
export function whatsappNumber(phone: string): string {
  const p = phone.trim();
  if (p.startsWith("+")) return p.replace(/\D/g, "");
  if (p.startsWith("00")) return p.replace(/\D/g, "").slice(2);
  return "";
}

/** "1990-05-01" → "1 May 1990", "--05-01" → "1 May". */
export function formatBirthday(b: string): string {
  const m = b.match(/^(\d{4}|-)-(\d{2})-(\d{2})$/);
  if (!m) return b;
  const d = new Date(m[1] === "-" ? 2000 : Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", ...(m[1] === "-" ? {} : { year: "numeric" }) });
}

/** One line for an address: "Rue X 1, 1000 Brussels, Belgium". */
export function formatAddress(a: Address): string {
  return [a.street, [a.postcode, a.city].filter(Boolean).join(" "), a.region, a.country].map((s) => s.trim()).filter(Boolean).join(", ");
}

// ---------------------------------------------------------------- RDF

export const PERSON_TYPE = VCARD("Individual");

/** vCard's classes for the kinds it has; any other kind is kept as a label. */
const KIND_CLASS: Record<string, string> = {
  home: VCARD("Home"),
  work: VCARD("Work"),
  mobile: VCARD("Cell"),
  main: VCARD("Pref"),
  fax: VCARD("Fax"),
  other: VCARD("Other"),
};
const CLASS_KIND = Object.fromEntries(Object.entries(KIND_CLASS).map(([k, v]) => [v, k]));

const str = (t: Thing, p: string) => readLiteral(t, p) ?? "";

function kindOf(t: Thing): string {
  for (const type of getUrlAll(t, RDF_TYPE)) if (CLASS_KIND[type]) return CLASS_KIND[type];
  return str(t, RDFS_LABEL) || "other";
}

function withKind(url: string, kind: string) {
  let b = buildThing(createThing({ url }));
  const cls = KIND_CLASS[kind];
  if (cls) b = b.addUrl(RDF_TYPE, cls);
  else if (kind) b = b.addStringNoLocale(RDFS_LABEL, kind);
  return b;
}

/** Every Thing that makes up one person: theirs, and their emails, phones and addresses. */
export function personToThings(p: Person, now = new Date()): Thing[] {
  const id = p.id;
  const parts: Thing[] = [];
  let b = buildThing(createThing({ url: id }))
    .addUrl(RDF_TYPE, PERSON_TYPE)
    .addUrl(RDF_TYPE, SCHEMA("Person"))
    .addStringNoLocale(VCARD("fn"), composeName(p) || p.name.trim() || displayName(p))
    .addDatetime(DCT("created"), p.created ?? now)
    .addDatetime(DCT("modified"), now);
  const lit = (pred: string, v: string) => {
    if (v.trim()) b = b.addStringNoLocale(pred, v.trim());
  };
  lit(VCARD("honorific-prefix"), p.prefix);
  lit(VCARD("given-name"), p.given);
  lit(VCARD("additional-name"), p.middle);
  lit(VCARD("family-name"), p.family);
  lit(VCARD("honorific-suffix"), p.suffix);
  lit(VCARD("nickname"), p.nickname);
  lit(VCARD("organization-name"), p.company);
  lit(VCARD("title"), p.title);
  lit(VCARD("organization-unit"), p.department);
  lit(VCARD("bday"), p.birthday);
  lit(VCARD("note"), p.note);
  lit(DCT("source"), p.source);
  for (const l of p.labels) lit(VCARD("category"), l);
  for (const w of p.websites) b = b.addUrl(VCARD("url"), w);
  if (p.linkedin) b = b.addUrl(SCHEMA("sameAs"), p.linkedin);
  for (const x of p.externalIds) lit(SCHEMA("identifier"), x);
  if (p.starred) b = b.addBoolean(SC("starred"), true);
  if (p.trashedAt) b = b.addDatetime(SC("trashedAt"), p.trashedAt);

  p.emails.forEach((e, i) => {
    const url = `${id}-e${i}`;
    b = b.addUrl(VCARD("hasEmail"), url);
    parts.push(withKind(url, e.type).addUrl(VCARD("value"), `mailto:${e.value.trim()}`).build());
  });
  p.phones.forEach((t, i) => {
    const url = `${id}-t${i}`;
    b = b.addUrl(VCARD("hasTelephone"), url);
    parts.push(withKind(url, t.type).addUrl(VCARD("value"), telHref(t.value)).addStringNoLocale(SC("asTyped"), t.value.trim()).build());
  });
  p.addresses.forEach((a, i) => {
    const url = `${id}-a${i}`;
    b = b.addUrl(VCARD("hasAddress"), url);
    let ab = withKind(url, a.type);
    const put = (pred: string, v: string) => {
      if (v.trim()) ab = ab.addStringNoLocale(VCARD(pred), v.trim());
    };
    put("street-address", a.street);
    put("locality", a.city);
    put("region", a.region);
    put("postal-code", a.postcode);
    put("country-name", a.country);
    parts.push(ab.build());
  });
  return [b.build(), ...parts];
}

/** True for the Things `personToThings` wrote for `id` (the person and their parts). */
export function belongsTo(thingUrl: string, id: string): boolean {
  return thingUrl === id || (thingUrl.startsWith(`${id}-`) && /^-[eta]\d+$/.test(thingUrl.slice(id.length)));
}

function valueOf(ds: SolidDataset, url: string, scheme: string): { value: string; type: string } | null {
  const t = getThing(ds, url);
  if (!t) {
    // Older writers (and the CRM) put the address straight on the person.
    return url.startsWith(scheme) ? { value: decodeURIComponent(url.slice(scheme.length)), type: "other" } : null;
  }
  const asTyped = str(t, SC("asTyped"));
  const raw = getUrl(t, VCARD("value")) ?? str(t, VCARD("value"));
  const value = asTyped || (raw.startsWith(scheme) ? decodeURIComponent(raw.slice(scheme.length)) : raw);
  return value ? { value, type: kindOf(t) } : null;
}

export function thingToPerson(ds: SolidDataset, t: Thing): Person | null {
  if (!getUrlAll(t, RDF_TYPE).includes(PERSON_TYPE)) return null;
  const sameAs = getUrlAll(t, SCHEMA("sameAs"));
  const emails = getUrlAll(t, VCARD("hasEmail")).map((u) => valueOf(ds, u, "mailto:")).filter((x): x is Labeled => !!x);
  const phones = getUrlAll(t, VCARD("hasTelephone")).map((u) => valueOf(ds, u, "tel:")).filter((x): x is Labeled => !!x);
  const addresses = getUrlAll(t, VCARD("hasAddress"))
    .map((u) => getThing(ds, u))
    .filter((a): a is Thing => !!a)
    .map((a) => ({
      street: str(a, VCARD("street-address")),
      city: str(a, VCARD("locality")),
      region: str(a, VCARD("region")),
      postcode: str(a, VCARD("postal-code")),
      country: str(a, VCARD("country-name")),
      type: kindOf(a),
    }));
  const given = str(t, VCARD("given-name"));
  const family = str(t, VCARD("family-name"));
  return {
    id: t.url,
    created: getDatetime(t, DCT("created")) ?? undefined,
    modified: getDatetime(t, DCT("modified")) ?? undefined,
    prefix: str(t, VCARD("honorific-prefix")),
    given,
    middle: str(t, VCARD("additional-name")),
    family,
    suffix: str(t, VCARD("honorific-suffix")),
    nickname: str(t, VCARD("nickname")),
    name: str(t, VCARD("fn")),
    company: str(t, VCARD("organization-name")),
    title: str(t, VCARD("title")),
    department: str(t, VCARD("organization-unit")),
    emails,
    phones,
    addresses,
    birthday: str(t, VCARD("bday")),
    websites: getUrlAll(t, VCARD("url")),
    linkedin: sameAs.map(normalizeLinkedIn).find(Boolean) ?? "",
    labels: getStringNoLocaleAll(t, VCARD("category")),
    note: str(t, VCARD("note")),
    starred: getBoolean(t, SC("starred")) ?? false,
    trashedAt: getDatetime(t, SC("trashedAt")),
    source: str(t, DCT("source")),
    externalIds: getStringNoLocaleAll(t, SCHEMA("identifier")),
  };
}

export function datasetToPeople(ds: SolidDataset): Person[] {
  return getThingAll(ds)
    .map((t) => thingToPerson(ds, t))
    .filter((p): p is Person => p !== null);
}

// ---------------------------------------------------------------- ids

/** Short, URL-safe, random. */
export function newId(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** Every label in use, sorted, with how many people (not in the trash) carry it. */
export function labelCounts(people: Person[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const p of people) if (!p.trashedAt) for (const l of p.labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts].sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }));
}
