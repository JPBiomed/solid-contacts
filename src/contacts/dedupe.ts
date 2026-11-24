/**
 * Finding the same person twice, and merging them.
 *
 * Two people are the same when they share an email (Gmail's dots and +tags
 * ignored), a phone number (its last nine digits), a LinkedIn profile or an
 * id from an import. A name alone is not enough to merge on its own, but it is
 * enough to *suggest* a merge, which is what "Merge & fix" shows.
 *
 * Merging only adds: whatever either side has is kept, and where both have a
 * single value (a company, a birthday) the one kept is the target's.
 */
import { composeName, displayName, fold, type Labeled, type Person } from "./model";

const GMAIL = /^(gmail|googlemail)\.com$/;

/** `Jane.Doe+news@GoogleMail.com` → `janedoe@gmail.com`; other domains only lower-cased. */
export function emailKey(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return e;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (GMAIL.test(domain)) return `${local.split("+")[0].replace(/\./g, "")}@gmail.com`;
  return e;
}

/**
 * The last nine digits: `+32 475 12 34 56`, `0032475123456` and `0475/12.34.56`
 * are the same Belgian mobile. Under six digits is not a phone number.
 */
export function phoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length < 6 ? "" : digits.slice(-9);
}

/** "Doe, Jane" and "jane doe" → "doe jane". */
export function nameKey(name: string): string {
  return fold(name).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean).sort().join(" ");
}

/** Every key that says "this is the same person". */
export function keysOf(p: Person): string[] {
  return [
    ...p.emails.map((e) => `e:${emailKey(e.value)}`),
    ...p.phones.map((t) => phoneKey(t.value)).filter(Boolean).map((k) => `p:${k}`),
    ...(p.linkedin ? [`l:${p.linkedin}`] : []),
    ...p.externalIds.map((x) => `x:${x}`),
  ];
}

/** Groups people that share any key, transitively. Singletons are left out. */
export function duplicateGroups(people: Person[], byName = true): Person[][] {
  const parent = people.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map<string, number>();
  people.forEach((p, i) => {
    const keys = keysOf(p);
    // A full name (two words or more) joins too; one word ("Marc") is too common.
    const n = nameKey(displayName(p));
    if (byName && n.includes(" ")) keys.push(`n:${n}`);
    for (const k of keys) {
      const j = owner.get(k);
      if (j === undefined) owner.set(k, i);
      else parent[find(i)] = find(j);
    }
  });
  const groups = new Map<number, Person[]>();
  people.forEach((p, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), p]));
  return [...groups.values()].filter((g) => g.length > 1);
}

function addValues(into: Labeled[], from: Labeled[], key: (v: string) => string): Labeled[] {
  const out = [...into];
  const seen = new Set(out.map((x) => key(x.value) || x.value));
  for (const x of from) {
    const k = key(x.value) || x.value;
    if (x.value.trim() && !seen.has(k)) {
      seen.add(k);
      out.push(x);
    }
  }
  return out;
}

function addStrings(into: string[], from: string[], key: (v: string) => string = (v) => v.toLowerCase()): string[] {
  const out = [...into];
  const seen = new Set(out.map(key));
  for (const v of from) {
    if (v.trim() && !seen.has(key(v))) {
      seen.add(key(v));
      out.push(v);
    }
  }
  return out;
}

const pick = (a: string, b: string) => (a.trim() ? a : b);

/** `into` with everything `from` has that it lacks. Keeps `into`'s id. */
export function mergePeople(into: Person, from: Person): Person {
  const hasParts = Boolean(composeName(into));
  const merged: Person = {
    ...into,
    prefix: hasParts ? into.prefix : from.prefix,
    given: hasParts ? into.given : from.given,
    middle: hasParts ? into.middle : from.middle,
    family: hasParts ? into.family : from.family,
    suffix: hasParts ? into.suffix : from.suffix,
    // A real name beats an email address standing in for one.
    name: into.name.trim() && !into.name.includes("@") ? into.name : from.name.trim() && !from.name.includes("@") ? from.name : into.name || from.name,
    nickname: pick(into.nickname, from.nickname),
    company: pick(into.company, from.company),
    title: pick(into.title, from.title),
    department: pick(into.department, from.department),
    emails: addValues(into.emails, from.emails, emailKey),
    phones: addValues(into.phones, from.phones, phoneKey),
    addresses: [...into.addresses, ...from.addresses.filter((a) => !into.addresses.some((b) => fold(b.street) === fold(a.street) && fold(b.city) === fold(a.city)))],
    birthday: pick(into.birthday, from.birthday),
    websites: addStrings(into.websites, from.websites),
    linkedin: pick(into.linkedin, from.linkedin),
    labels: addStrings(into.labels, from.labels),
    note: into.note.includes(from.note) ? into.note : from.note && into.note ? `${into.note}\n\n${from.note}` : pick(into.note, from.note),
    starred: into.starred || from.starred,
    trashedAt: into.trashedAt && from.trashedAt ? into.trashedAt : null,
    source: pick(into.source, from.source),
    externalIds: addStrings(into.externalIds, from.externalIds, (v) => v),
  };
  return merged;
}

/** What merging `from` into `into` would add, in words: "2 emails", "a phone"… Empty when nothing. */
export function whatMergeAdds(into: Person, from: Person): string[] {
  const m = mergePeople(into, from);
  const out: string[] = [];
  const n = (a: unknown[], b: unknown[], one: string, many: string) => {
    const d = a.length - b.length;
    if (d > 0) out.push(d === 1 ? one : `${d} ${many}`);
  };
  if (!displayName(into) || displayName(into) === "(no name)") if (displayName(m) !== "(no name)") out.push("the name");
  n(m.emails, into.emails, "an email", "emails");
  n(m.phones, into.phones, "a phone", "phones");
  n(m.addresses, into.addresses, "an address", "addresses");
  n(m.websites, into.websites, "a website", "websites");
  n(m.labels, into.labels, "a label", "labels");
  if (m.company !== into.company) out.push("the company");
  if (m.title !== into.title) out.push("the job title");
  if (m.birthday !== into.birthday) out.push("the birthday");
  if (m.linkedin !== into.linkedin) out.push("LinkedIn");
  if (m.note !== into.note) out.push("a note");
  return out;
}

/** An index of people by every key, to match imports against. */
export class PeopleIndex {
  private byKey = new Map<string, Person>();
  private byName = new Map<string, Person>();

  constructor(people: Person[]) {
    for (const p of people) {
      for (const k of keysOf(p)) if (!this.byKey.has(k)) this.byKey.set(k, p);
      const n = nameKey(displayName(p));
      if (n.includes(" ") && !this.byName.has(n)) this.byName.set(n, p);
    }
  }

  /** Who `p` already is: by an import id, email, LinkedIn or phone, else a full-name suggestion. */
  match(p: Person): { person: Person; byNameOnly: boolean } | null {
    const ordered = [
      ...p.externalIds.map((x) => `x:${x}`),
      ...p.emails.map((e) => `e:${emailKey(e.value)}`),
      ...(p.linkedin ? [`l:${p.linkedin}`] : []),
      ...p.phones.map((t) => phoneKey(t.value)).filter(Boolean).map((k) => `p:${k}`),
    ];
    for (const k of ordered) {
      const person = this.byKey.get(k);
      if (person) return { person, byNameOnly: false };
    }
    const person = this.byName.get(nameKey(displayName(p)));
    return person ? { person, byNameOnly: true } : null;
  }
}
