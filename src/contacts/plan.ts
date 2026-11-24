/**
 * What an import would do, person by person, and the people to save.
 * Pure: the import screen shows `planImport` and saves `importWrites`.
 */
import { duplicateGroups, mergePeople, PeopleIndex, whatMergeAdds } from "./dedupe";
import { displayName, type Person } from "./model";

export interface Source {
  id: string;
  /** What the screen calls it: an account address, a file name, "Phone". */
  name: string;
  kind: "google" | "file" | "phone" | "crm";
  people: Person[];
  /** Given to everyone from this source as a label, e.g. "personal". Empty for none. */
  label: string;
}

export interface ImportOptions {
  /** "Friends" from a source labelled "personal" becomes "personal/Friends". */
  prefixLabels: boolean;
  includeOther: boolean;
}

export type RowStatus = "new" | "update" | "same" | "name";

export interface PlanRow {
  key: string;
  person: Person;
  match: Person | null;
  status: RowStatus;
  adds: string[];
  sources: string[];
}

const OTHER = "Other contacts";

/** One source's people with its labels applied. */
function labelled(source: Source, opts: ImportOptions): Person[] {
  return source.people
    .filter((p) => opts.includeOther || !p.labels.includes(OTHER))
    .map((p) => {
      const own = opts.prefixLabels && source.label ? p.labels.map((l) => (l === OTHER ? l : `${source.label}/${l}`)) : p.labels;
      return { ...p, labels: [...new Set([...own, ...(source.label ? [source.label] : [])])] };
    });
}

/** The same person across sources, as one, with every source they came from. */
export function joinAcross(sources: Source[], opts: ImportOptions): { person: Person; sources: string[] }[] {
  const from = new Map<Person, string>();
  for (const s of sources) for (const p of labelled(s, opts)) from.set(p, s.id);
  const all = [...from.keys()];
  const groups = duplicateGroups(all, false);
  const grouped = new Set(groups.flat());
  const singles = all.filter((p) => !grouped.has(p)).map((p) => ({ person: p, sources: [from.get(p)!] }));
  const joined = groups.map((g) => {
    // Saved contacts first: their name and labels are the ones chosen, not Gmail's automatic ones.
    const ordered = [...g].sort((a, b) => Number(a.labels.includes(OTHER)) - Number(b.labels.includes(OTHER)));
    const person = ordered.slice(1).reduce(mergePeople, ordered[0]);
    if (!ordered[0].labels.includes(OTHER)) person.labels = person.labels.filter((l) => l !== OTHER);
    return { person, sources: [...new Set(g.map((p) => from.get(p)!))] };
  });
  return [...singles, ...joined];
}

export function planImport(sources: Source[], existing: Person[], opts: ImportOptions): PlanRow[] {
  const index = new PeopleIndex(existing);
  return joinAcross(sources, opts).map(({ person, sources: sourcesOf }) => {
    const key = [...person.externalIds, ...person.emails.map((e) => e.value.toLowerCase()), ...person.phones.map((t) => t.value), displayName(person)].sort()[0] ?? "";
    const m = index.match(person);
    if (!m) return { key, person, match: null, status: "new", adds: [], sources: sourcesOf };
    if (m.byNameOnly) return { key, person, match: m.person, status: "name", adds: [], sources: sourcesOf };
    const adds = whatMergeAdds(m.person, person);
    const idsNew = person.externalIds.some((x) => !m.person.externalIds.includes(x));
    return { key, person, match: m.person, status: adds.length || idsNew ? "update" : "same", adds, sources: sourcesOf };
  });
}

/**
 * The people to save. `skip` holds rows left out; `mergeByName` the name-only
 * matches to merge (the others are added as new people). Several rows that
 * land on the same person are merged into them one after the other.
 */
export function importWrites(rows: PlanRow[], skip: Set<string>, mergeByName: Set<string>): { people: Person[]; created: number; updated: number } {
  const out = new Map<string, Person>();
  const fresh: Person[] = [];
  for (const r of rows) {
    if (skip.has(r.key) || r.status === "same") continue;
    const target = r.match && (r.status !== "name" || mergeByName.has(r.key)) ? r.match : null;
    if (target) out.set(target.id, mergePeople(out.get(target.id) ?? target, r.person));
    else fresh.push({ ...r.person, id: "" });
  }
  return { people: [...out.values(), ...fresh], created: fresh.length, updated: out.size };
}
