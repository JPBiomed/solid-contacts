/**
 * Contact files in and out: vCard (.vcf) and CSV.
 *
 * In: what contacts.google.com, Android, iPhone and Outlook export. vCard 2.1,
 * 3.0 and 4.0; Google's CSV (current and older layouts) and Outlook's. CSV
 * columns are found by name, so their order does not matter.
 *
 * Out: vCard 3.0 (what Android, iPhone and Google all read back) and Google
 * CSV, the same two formats Google Contacts exports.
 *
 * Pure functions, no I/O.
 */
import { composeName, displayName, emptyAddress, emptyPerson, extractLinkedIn, normalizeLinkedIn, type Address, type Labeled, type Person } from "./model";

/**
 * Google's built-in groups that say nothing about the person: everyone is in
 * "myContacts", and "Imported on 3/4/21" is a leftover of an earlier import.
 */
export function isNoiseLabel(label: string): boolean {
  const l = label.replace(/^\*\s*/, "").trim();
  return !l || /^(my ?contacts|all|chat ?buddies|blocked)$/i.test(l) || /^imported on\b/i.test(l);
}

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  return values.map((v) => v.trim()).filter((v) => v && !seen.has(v.toLowerCase()) && seen.add(v.toLowerCase()));
}

/** "Starred" is Google's way of saying favourite: it becomes the star, not a label. */
export function finish(p: Person): Person {
  const rawLabels = uniq(p.labels.map((l) => l.replace(/^\*\s*/, ""))).filter((l) => !isNoiseLabel(l));
  const starred = p.starred || rawLabels.some((l) => /^starred$/i.test(l));
  const websites = uniq(p.websites);
  const linkedin = p.linkedin || websites.map(extractLinkedIn).find(Boolean) || "";
  const seenE = new Set<string>();
  const seenT = new Set<string>();
  return {
    ...p,
    name: p.name.replace(/\s+/g, " ").trim(),
    emails: p.emails
      .map((e) => ({ ...e, value: e.value.replace(/^mailto:/i, "").trim() }))
      .filter((e) => e.value.includes("@") && !seenE.has(e.value.toLowerCase()) && seenE.add(e.value.toLowerCase())),
    phones: p.phones
      .map((t) => ({ ...t, value: t.value.replace(/^tel:/i, "").trim() }))
      .filter((t) => t.value && !seenT.has(t.value) && seenT.add(t.value)),
    websites: websites.filter((w) => !extractLinkedIn(w)),
    linkedin,
    labels: rawLabels.filter((l) => !/^starred$/i.test(l)),
    starred,
    note: p.note.trim(),
  };
}

export function isUsable(p: Person): boolean {
  return Boolean(composeName(p) || p.name || p.emails.length || p.phones.length || p.company);
}

/** vCard TYPE parameters (and Google's CSV labels) → our kinds. */
export function kindFrom(raw: string, fallback = "other"): string {
  const t = raw.toLowerCase();
  if (/cell|mobile/.test(t)) return "mobile";
  if (/work|business|office/.test(t)) return "work";
  if (/home|personal|private/.test(t)) return "home";
  if (/main|pref/.test(t)) return "main";
  if (/fax/.test(t)) return "fax";
  const custom = raw.replace(/^\*\s*/, "").trim();
  return custom && !/^(internet|voice|other|x-)/i.test(custom) ? custom.toLowerCase() : fallback;
}

/** "1990-05-01", "19900501", "--0501", "1990-05-01T00:00:00Z" → our birthday format. */
export function normalizeBirthday(raw: string): string {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^--(\d{2})-?(\d{2})$/);
  if (m) return `--${m[1]}-${m[2]}`;
  return "";
}

// ---------------------------------------------------------------- vCard in

function decodeQuotedPrintable(value: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "=" && /^[0-9A-F]{2}$/i.test(value.slice(i + 1, i + 3))) {
      bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(value.charCodeAt(i) & 0xff);
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function unescapeV(value: string): string {
  return value.replace(/\\([nN,;:\\])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

function splitUnescaped(value: string, sep: string): string[] {
  const parts: string[] = [];
  let cur = "";
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "\\" && i + 1 < value.length) {
      cur += value[i] + value[i + 1];
      i++;
    } else if (value[i] === sep) {
      parts.push(cur);
      cur = "";
    } else cur += value[i];
  }
  parts.push(cur);
  return parts;
}

interface VLine {
  group: string;
  name: string;
  params: string;
  value: string;
}

function parseVLine(line: string): VLine | null {
  let inQuote = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuote = !inQuote;
    else if (line[i] === ":" && !inQuote) {
      colon = i;
      break;
    }
  }
  if (colon === -1) return null;
  const [nameWithGroup, ...params] = line.slice(0, colon).split(";");
  const dot = nameWithGroup.indexOf(".");
  const paramText = params.join(";");
  let value = line.slice(colon + 1);
  if (/QUOTED-PRINTABLE/i.test(paramText)) value = decodeQuotedPrintable(value);
  return {
    group: dot === -1 ? "" : nameWithGroup.slice(0, dot).toLowerCase(),
    name: (dot === -1 ? nameWithGroup : nameWithGroup.slice(dot + 1)).toUpperCase(),
    params: paramText,
    value,
  };
}

function unfold(text: string): string[] {
  const raw = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/=\n/g, "");
  const lines: string[] = [];
  for (const line of raw.split("\n")) {
    if (/^[ \t]/.test(line) && lines.length) lines[lines.length - 1] += line.slice(1);
    else lines.push(line);
  }
  return lines;
}

/** The kind in a vCard line's parameters: `TYPE=WORK`, `TYPE=work,voice`, or 2.1's bare `WORK`. */
function typeParam(params: string): string {
  const types = params
    .split(";")
    .flatMap((p) => (p.includes("=") ? (/^type=/i.test(p) ? p.slice(5).split(",") : []) : [p]))
    .map((t) => t.replace(/"/g, ""));
  return types.join(" ");
}

export function parseVcards(text: string, source = "file"): Person[] {
  const people: Person[] = [];
  let p: Person | null = null;
  let fn = "";
  // Apple and Google name a value's kind on a separate line: item1.X-ABLabel:Partner.
  let groupLabels = new Map<string, string>();
  let groupTargets: { group: string; list: Labeled[]; index: number }[] = [];
  for (const line of unfold(text)) {
    const l = parseVLine(line);
    if (!l) continue;
    if (l.name === "BEGIN" && /^vcard$/i.test(l.value.trim())) {
      p = { ...emptyPerson(), source };
      fn = "";
      groupLabels = new Map();
      groupTargets = [];
      continue;
    }
    if (!p) continue;
    const v = l.value;
    const kind = kindFrom(typeParam(l.params));
    switch (l.name) {
      case "END":
        for (const t of groupTargets) {
          const label = groupLabels.get(t.group);
          if (label) t.list[t.index].type = kindFrom(label.replace(/^_\$!<(.*)>!\$_$/, "$1"));
        }
        if (!composeName(p)) p.name = fn;
        else if (fn && fn !== composeName(p)) p.name = fn;
        people.push(finish(p));
        p = null;
        break;
      case "FN":
        fn = unescapeV(v);
        break;
      case "N": {
        const [family = "", given = "", middle = "", prefix = "", suffix = ""] = splitUnescaped(v, ";").map(unescapeV);
        Object.assign(p, { family, given, middle, prefix, suffix });
        break;
      }
      case "NICKNAME":
        p.nickname = unescapeV(splitUnescaped(v, ",")[0] ?? "");
        break;
      case "EMAIL":
        p.emails.push({ value: unescapeV(v), type: kind === "other" ? "home" : kind });
        if (l.group) groupTargets.push({ group: l.group, list: p.emails, index: p.emails.length - 1 });
        break;
      case "TEL":
        p.phones.push({ value: unescapeV(v), type: kind === "other" ? "mobile" : kind });
        if (l.group) groupTargets.push({ group: l.group, list: p.phones, index: p.phones.length - 1 });
        break;
      case "ADR": {
        const [, , street = "", city = "", region = "", postcode = "", country = ""] = splitUnescaped(v, ";").map(unescapeV);
        const a: Address = { ...emptyAddress(kind === "other" ? "home" : kind), street, city, region, postcode, country };
        if (street || city || country) p.addresses.push(a);
        break;
      }
      case "ORG": {
        const [company = "", department = ""] = splitUnescaped(v, ";").map(unescapeV);
        p.company = company;
        p.department = department;
        break;
      }
      case "TITLE":
        if (!p.title) p.title = unescapeV(v);
        break;
      case "BDAY":
        p.birthday = normalizeBirthday(v);
        break;
      case "URL":
      case "X-SOCIALPROFILE":
        p.websites.push(unescapeV(v));
        break;
      case "NOTE":
        p.note = p.note ? `${p.note}\n${unescapeV(v)}` : unescapeV(v);
        break;
      case "CATEGORIES":
        p.labels.push(...splitUnescaped(v, ",").map(unescapeV));
        break;
      case "X-ABLABEL":
        if (l.group) groupLabels.set(l.group, unescapeV(v));
        break;
    }
  }
  return people.filter(isUsable);
}

// ---------------------------------------------------------------- CSV in

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** Google puts several values in one cell separated by " ::: ". */
const multi = (cell: string) => cell.split(":::").map((x) => x.trim()).filter(Boolean);

export function parseContactsCsv(text: string, source = "file"): Person[] {
  const [header, ...rows] = parseCsvRows(text);
  if (!header) return [];
  const cols = header.map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => names.map((n) => cols.indexOf(n)).find((i) => i >= 0) ?? -1;
  const get = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
  const one = (...names: string[]) => {
    const i = col(...names);
    return (row: string[]) => get(row, i);
  };
  /** Numbered columns: "E-mail 1 - Label" / "E-mail 1 - Value", "Phone 2 - …". */
  const numbered = (prefix: RegExp, fallbackType: string) => {
    const pairs: { value: number; label: number }[] = [];
    cols.forEach((c, i) => {
      const m = c.match(prefix);
      if (m && / - value$/.test(c)) pairs.push({ value: i, label: cols.indexOf(c.replace(/ - value$/, " - label")) });
    });
    return (row: string[]): Labeled[] =>
      pairs.flatMap(({ value, label }) => multi(get(row, value)).map((v) => ({ value: v, type: kindFrom(get(row, label), fallbackType) })));
  };
  // Outlook: one column per kind.
  const outlook = (re: RegExp, typeOf: (c: string) => string) => {
    const idx = cols.map((c, i) => (re.test(c) ? i : -1)).filter((i) => i >= 0);
    return (row: string[]): Labeled[] => idx.flatMap((i) => multi(get(row, i)).map((v) => ({ value: v, type: typeOf(cols[i]) })));
  };

  const fullName = one("name", "display name", "full name");
  const first = one("first name", "given name");
  const middle = one("middle name", "additional name");
  const last = one("last name", "family name");
  const prefix = one("name prefix", "title");
  const suffix = one("name suffix", "suffix");
  const nickname = one("nickname");
  const emails = numbered(/^e-?mail \d+ - /, "home");
  const phones = numbered(/^phone \d+ - /, "mobile");
  const outlookEmails = outlook(/^e-?mail( \d)? address$/, (c) => (/2|3/.test(c) ? "other" : "home"));
  const outlookPhones = outlook(/(mobile|home|business|other|primary|car) phone( \d)?$/, (c) => kindFrom(c, "other"));
  const company = one("organization name", "organization 1 - name", "company");
  const jobTitle = one("organization title", "organization 1 - title", "job title");
  const department = one("organization department", "organization 1 - department", "department");
  const birthday = one("birthday");
  const sites = outlook(/^website \d+ - value$|^web page$|^website$/, () => "");
  const labels = one("labels", "group membership", "categories");
  const notes = one("notes", "note");
  const addrIdx: { street: number; city: number; region: number; postcode: number; country: number; label: number }[] = [];
  for (let n = 1; n <= 5; n++) {
    const base = `address ${n} - `;
    if (cols.includes(`${base}street`) || cols.includes(`${base}city`)) {
      addrIdx.push({
        street: cols.indexOf(`${base}street`),
        city: cols.indexOf(`${base}city`),
        region: cols.indexOf(`${base}region`),
        postcode: cols.indexOf(`${base}postal code`),
        country: cols.indexOf(`${base}country`),
        label: cols.indexOf(`${base}label`),
      });
    }
  }

  return rows
    .map((row) => {
      const p: Person = { ...emptyPerson(), source };
      p.given = first(row);
      p.middle = middle(row);
      p.family = last(row);
      p.prefix = cols.includes("name prefix") ? prefix(row) : "";
      p.suffix = suffix(row);
      p.nickname = nickname(row);
      if (!composeName(p)) p.name = fullName(row);
      p.emails = [...emails(row), ...outlookEmails(row)];
      p.phones = [...phones(row), ...outlookPhones(row)];
      p.company = company(row);
      p.title = jobTitle(row);
      p.department = department(row);
      p.birthday = normalizeBirthday(birthday(row));
      p.websites = sites(row).map((s) => s.value);
      p.labels = multi(labels(row));
      p.note = notes(row);
      p.addresses = addrIdx
        .map((a) => ({
          street: get(row, a.street), city: get(row, a.city), region: get(row, a.region),
          postcode: get(row, a.postcode), country: get(row, a.country), type: kindFrom(get(row, a.label), "home"),
        }))
        .filter((a) => a.street || a.city || a.country);
      return finish(p);
    })
    .filter(isUsable);
}

/** Reads a file of either format, chosen by its content. */
export function parseContactsFile(text: string, source = "file"): Person[] {
  return /^\s*BEGIN:VCARD/i.test(text.replace(/^\uFEFF/, "")) ? parseVcards(text, source) : parseContactsCsv(text, source);
}

// ---------------------------------------------------------------- out

function escapeV(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\;");
}

/** Lines over 75 octets are folded, as vCard requires. */
function fold75(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    out.push(rest.slice(0, 75));
    rest = ` ${rest.slice(75)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

const VCARD_TYPE: Record<string, string> = { mobile: "CELL", home: "HOME", work: "WORK", main: "PREF", fax: "FAX" };

export function toVcard(p: Person): string {
  const lines = ["BEGIN:VCARD", "VERSION:3.0"];
  lines.push(`FN:${escapeV(displayName(p))}`);
  lines.push(`N:${[p.family, p.given, p.middle, p.prefix, p.suffix].map(escapeV).join(";")}`);
  if (p.nickname) lines.push(`NICKNAME:${escapeV(p.nickname)}`);
  if (p.company || p.department) lines.push(`ORG:${escapeV(p.company)}${p.department ? `;${escapeV(p.department)}` : ""}`);
  if (p.title) lines.push(`TITLE:${escapeV(p.title)}`);
  p.emails.forEach((e) => lines.push(`EMAIL;TYPE=INTERNET${VCARD_TYPE[e.type] ? `,${VCARD_TYPE[e.type]}` : ""}:${e.value}`));
  p.phones.forEach((t, i) => {
    if (VCARD_TYPE[t.type] || t.type === "other") lines.push(`TEL${VCARD_TYPE[t.type] ? `;TYPE=${VCARD_TYPE[t.type]}` : ""}:${t.value}`);
    else lines.push(`item${i + 1}.TEL:${t.value}`, `item${i + 1}.X-ABLabel:${escapeV(t.type)}`);
  });
  p.addresses.forEach((a) =>
    lines.push(`ADR${VCARD_TYPE[a.type] ? `;TYPE=${VCARD_TYPE[a.type]}` : ""}:;;${[a.street, a.city, a.region, a.postcode, a.country].map(escapeV).join(";")}`)
  );
  if (p.birthday) lines.push(`BDAY:${p.birthday}`);
  for (const w of p.websites) lines.push(`URL:${w}`);
  if (p.linkedin) lines.push(`X-SOCIALPROFILE;TYPE=linkedin:${p.linkedin}`, `URL:${p.linkedin}`);
  if (p.note) lines.push(`NOTE:${escapeV(p.note)}`);
  const cats = [...p.labels, ...(p.starred ? ["starred"] : [])];
  if (cats.length) lines.push(`CATEGORIES:${cats.map(escapeV).join(",")}`);
  lines.push("END:VCARD");
  return lines.map(fold75).join("\r\n");
}

export function toVcards(people: Person[]): string {
  return people.map(toVcard).join("\r\n") + "\r\n";
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Google CSV, the layout contacts.google.com exports and imports. */
export function toGoogleCsv(people: Person[]): string {
  const maxE = Math.max(1, ...people.map((p) => p.emails.length));
  const maxT = Math.max(1, ...people.map((p) => p.phones.length));
  const maxA = Math.max(1, ...people.map((p) => p.addresses.length));
  const maxW = Math.max(1, ...people.map((p) => p.websites.length + (p.linkedin ? 1 : 0)));
  const header = [
    "First Name", "Middle Name", "Last Name", "Name Prefix", "Name Suffix", "Nickname", "Birthday", "Notes",
    "Organization Name", "Organization Title", "Organization Department", "Labels",
    ...Array.from({ length: maxE }, (_, i) => [`E-mail ${i + 1} - Label`, `E-mail ${i + 1} - Value`]).flat(),
    ...Array.from({ length: maxT }, (_, i) => [`Phone ${i + 1} - Label`, `Phone ${i + 1} - Value`]).flat(),
    ...Array.from({ length: maxA }, (_, i) =>
      ["Label", "Street", "City", "Region", "Postal Code", "Country"].map((f) => `Address ${i + 1} - ${f}`)
    ).flat(),
    ...Array.from({ length: maxW }, (_, i) => [`Website ${i + 1} - Label`, `Website ${i + 1} - Value`]).flat(),
  ];
  const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : "");
  const rows = people.map((p) => {
    const given = p.given || (composeName(p) ? "" : displayName(p));
    const sites = [...p.websites.map((w) => ["", w]), ...(p.linkedin ? [["LinkedIn", p.linkedin]] : [])];
    return [
      given, p.middle, p.family, p.prefix, p.suffix, p.nickname, p.birthday, p.note,
      p.company, p.title, p.department,
      ["* myContacts", ...(p.starred ? ["* starred"] : []), ...p.labels].join(" ::: "),
      ...Array.from({ length: maxE }, (_, i) => [cap(p.emails[i]?.type ?? ""), p.emails[i]?.value ?? ""]).flat(),
      ...Array.from({ length: maxT }, (_, i) => [cap(p.phones[i]?.type ?? ""), p.phones[i]?.value ?? ""]).flat(),
      ...Array.from({ length: maxA }, (_, i) => {
        const a = p.addresses[i];
        return a ? [cap(a.type), a.street, a.city, a.region, a.postcode, a.country] : ["", "", "", "", "", ""];
      }).flat(),
      ...Array.from({ length: maxW }, (_, i) => sites[i] ?? ["", ""]).flat(),
    ];
  });
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** The person a LinkedIn share or link describes, before the form is filled in. */
export function fromLinkedIn(url: string, name = "", headline = ""): Person {
  const p = { ...emptyPerson(), source: "linkedin", linkedin: normalizeLinkedIn(url) || extractLinkedIn(url), name, title: headline };
  return p;
}
