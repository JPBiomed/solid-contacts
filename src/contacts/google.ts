/**
 * Reading contacts from Google accounts, in the browser, with the People API.
 *
 * No server: this is a static app, so it uses Google Identity Services' token
 * flow. "Connect" opens Google's account picker; the token it hands back lives
 * in the tab's memory for an hour and is never stored. Read-only scopes: this
 * app never writes to Google.
 *
 * It needs an OAuth client ID of type "Web application" whose authorized
 * JavaScript origins include this app's address (docs/google.md).
 */
import { finish, isUsable, kindFrom, normalizeBirthday } from "./files";
import { emptyPerson, type Person } from "./model";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/contacts.other.readonly",
  // Only to name the source after the account that was picked.
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

const API = "https://people.googleapis.com/v1";

interface GValue { value?: string; type?: string; formattedType?: string; canonicalForm?: string }
interface GName { displayName?: string; givenName?: string; familyName?: string; middleName?: string; honorificPrefix?: string; honorificSuffix?: string; unstructuredName?: string }
interface GOrg { name?: string; title?: string; department?: string }
interface GAddress { streetAddress?: string; city?: string; region?: string; postalCode?: string; country?: string; type?: string; formattedValue?: string }
interface GDate { date?: { year?: number; month?: number; day?: number }; text?: string }
interface GMembership { contactGroupMembership?: { contactGroupResourceName?: string } }
export interface GPerson {
  resourceName: string;
  names?: GName[];
  nicknames?: GValue[];
  emailAddresses?: GValue[];
  phoneNumbers?: GValue[];
  organizations?: GOrg[];
  addresses?: GAddress[];
  birthdays?: GDate[];
  urls?: GValue[];
  biographies?: GValue[];
  memberships?: GMembership[];
}
export interface GGroup { resourceName: string; name?: string; formattedName?: string; groupType?: string }

const pad = (n: number) => String(n).padStart(2, "0");

function birthdayOf(g: GPerson): string {
  const b = g.birthdays?.find((x) => x.date) ?? g.birthdays?.[0];
  if (!b) return "";
  const d = b.date;
  if (d?.month && d.day) return d.year ? `${d.year}-${pad(d.month)}-${pad(d.day)}` : `--${pad(d.month)}-${pad(d.day)}`;
  return normalizeBirthday(b.text ?? "");
}

/** One People API person. `groups` maps a contact group to the label shown in Google Contacts. */
export function fromGooglePerson(g: GPerson, account: string, groups: Map<string, string>, other = false): Person {
  const n = g.names?.[0] ?? {};
  const org = g.organizations?.[0] ?? {};
  const p: Person = {
    ...emptyPerson(),
    source: "google",
    externalIds: [`google:${account}:${g.resourceName}`],
    prefix: n.honorificPrefix ?? "",
    given: n.givenName ?? "",
    middle: n.middleName ?? "",
    family: n.familyName ?? "",
    suffix: n.honorificSuffix ?? "",
    name: n.givenName || n.familyName ? "" : (n.displayName ?? n.unstructuredName ?? ""),
    nickname: g.nicknames?.[0]?.value ?? "",
    company: org.name ?? "",
    title: org.title ?? "",
    department: org.department ?? "",
    emails: (g.emailAddresses ?? []).map((e) => ({ value: e.value ?? "", type: kindFrom(e.type ?? "", "home") })),
    phones: (g.phoneNumbers ?? []).map((t) => ({ value: t.value || t.canonicalForm || "", type: kindFrom(t.type ?? "", "mobile") })),
    addresses: (g.addresses ?? []).map((a) => ({
      street: a.streetAddress ?? "", city: a.city ?? "", region: a.region ?? "",
      postcode: a.postalCode ?? "", country: a.country ?? "", type: kindFrom(a.type ?? "", "home"),
    })),
    birthday: birthdayOf(g),
    websites: (g.urls ?? []).map((u) => u.value ?? ""),
    note: (g.biographies ?? []).map((b) => b.value ?? "").join("\n"),
    labels: (g.memberships ?? []).map((m) => groups.get(m.contactGroupMembership?.contactGroupResourceName ?? "") ?? "").filter(Boolean),
  };
  if (other) p.labels.push("Other contacts");
  return finish(p);
}

/** User labels by name; of Google's own groups only Starred, which `finish` turns into the star. */
export function groupLabels(groups: GGroup[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const g of groups) {
    if (g.groupType === "SYSTEM_CONTACT_GROUP" && g.resourceName !== "contactGroups/starred") continue;
    const label = g.formattedName || g.name;
    if (label) map.set(g.resourceName, label);
  }
  return map;
}

// ---------------------------------------------------------------- sign-in

interface TokenResponse { access_token?: string; error?: string; error_description?: string }
interface TokenClient { requestAccessToken(overrides?: { prompt?: string; login_hint?: string }): void }
declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient(config: Record<string, unknown>): TokenClient } } };
  }
}

let gisLoading: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gisLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisLoading = null;
      reject(new Error("Could not load Google sign-in. Check the connection, or an ad blocker."));
    };
    document.head.append(script);
  });
  return gisLoading;
}

/**
 * Explains Google's sign-in errors in words a person can act on. The raw
 * codes ("idpiframe_initialization_failed", "invalid_client") say nothing.
 */
export function explainGoogleError(raw: string, origin: string): string {
  if (/origin|redirect_uri_mismatch|idpiframe/i.test(raw)) {
    return `Google refused this address. Add ${origin} to "Authorized JavaScript origins" of your Google client, wait 5 minutes, and try again.`;
  }
  if (/invalid_client|unauthorized_client|no registered origin/i.test(raw)) return "Google doesn't recognise the client ID. Check it in Settings.";
  if (/access_denied/i.test(raw)) {
    return "Google said no. If it showed \"access blocked\", add this account as a test user in your Google project, or ask your Workspace admin to allow the app.";
  }
  if (/popup_closed/i.test(raw)) return "The Google window was closed before signing in.";
  if (/popup_failed_to_open|popup/i.test(raw)) return "The browser blocked Google's window. Allow pop-ups for this site and try again.";
  return raw || "Google sign-in failed.";
}

/** Opens Google's account picker; with `account`, goes straight to that account ("Check again"). */
export async function requestToken(clientId: string, account = ""): Promise<string> {
  await loadGis();
  return new Promise<string>((resolve, reject) => {
    const fail = (raw: string) => reject(new Error(explainGoogleError(raw, location.origin)));
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPES,
      callback: (r: TokenResponse) => (r.access_token ? resolve(r.access_token) : fail(`${r.error ?? ""} ${r.error_description ?? ""}`.trim())),
      error_callback: (e: { type?: string; message?: string }) => fail(`${e.type ?? ""} ${e.message ?? ""}`.trim()),
    });
    client.requestAccessToken(account ? { prompt: "", login_hint: account } : { prompt: "select_account" });
  });
}

// ---------------------------------------------------------------- reading

async function get<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    let detail = "";
    try {
      detail = ((await res.json()) as { error?: { message?: string } }).error?.message ?? "";
    } catch {
      // Not JSON: the status says enough.
    }
    if (res.status === 403 && /has not been used|is disabled/i.test(detail)) {
      throw new Error("The People API is not turned on in your Google Cloud project. Turn it on, wait a few minutes, then try again.");
    }
    throw new Error(`Google answered ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return (await res.json()) as T;
}

async function pages<T>(token: string, path: string, field: string): Promise<T[]> {
  const out: T[] = [];
  let pageToken = "";
  do {
    const page = await get<Record<string, unknown>>(token, `${path}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
    out.push(...((page[field] as T[] | undefined) ?? []));
    pageToken = (page.nextPageToken as string | undefined) ?? "";
  } while (pageToken);
  return out;
}

const FIELDS = "names,nicknames,emailAddresses,phoneNumbers,organizations,addresses,birthdays,urls,biographies,memberships";

/** Everything in one account: saved contacts (with labels) and "Other contacts". */
export async function readGoogleAccount(token: string): Promise<{ account: string; people: Person[] }> {
  const me = await get<{ emailAddresses?: GValue[] }>(token, "/people/me?personFields=emailAddresses");
  const account = (me.emailAddresses?.[0]?.value ?? "google").toLowerCase();
  const [groups, connections, others] = await Promise.all([
    pages<GGroup>(token, "/contactGroups?pageSize=1000", "contactGroups"),
    pages<GPerson>(token, `/people/me/connections?pageSize=1000&personFields=${FIELDS}`, "connections"),
    pages<GPerson>(token, "/otherContacts?pageSize=1000&readMask=names,emailAddresses,phoneNumbers", "otherContacts"),
  ]);
  const labels = groupLabels(groups);
  const people = [
    ...connections.map((g) => fromGooglePerson(g, account, labels)),
    ...others.map((g) => fromGooglePerson(g, account, labels, true)),
  ].filter(isUsable);
  return { account, people };
}
