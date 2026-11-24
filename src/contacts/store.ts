/**
 * Reading and writing people in the pod.
 *
 * Layout: `<pod>/contacts/people.ttl` holds everyone, `settings.ttl` this
 * app's settings. One document for everyone because a contacts list is read
 * whole every time it opens: a few thousand people are one request, not a few
 * thousand. The folder is the app's own, not the CRM's: other apps (the CRM,
 * an inbox) read people from it and link to them by IRI.
 *
 * The kit's two rules hold:
 * - Screens read through `readTurtle` (ETag revalidation, ADR 007).
 * - Writes never start from what a screen showed: each reads the document
 *   fresh, changes only the people concerned, and saves the difference.
 */
import {
  buildThing,
  createSolidDataset,
  createThing,
  FetchError,
  getSolidDataset,
  getStringNoLocale,
  getThing,
  getThingAll,
  removeThing,
  saveSolidDatasetAt,
  setThing,
  type SolidDataset,
} from "@inrupt/solid-client";
import { authFetch } from "../lib/auth";
import { readTurtle } from "../lib/read";
import { belongsTo, datasetToPeople, newId, personToThings, type Person } from "./model";
import { SC } from "./vocab";

export type Doc = "people" | "settings";

export interface Settings {
  sortBy: "first" | "last";
  googleClientId: string;
}

export interface Book {
  /** Everyone, trash included; screens filter. */
  people: Person[];
  settings: Settings;
}

/** How long someone stays in the trash, as in Google Contacts. */
export const TRASH_DAYS = 30;

const displayFetch: typeof fetch = async (input) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const res = await readTurtle(url);
  // readTurtle hands back `new Response(body)`, whose `url` is "": solid-client
  // resolves IRIs against it and would throw "Invalid base URL".
  if (!res.url) Object.defineProperty(res, "url", { value: url });
  return res;
};

function isNotFound(err: unknown): boolean {
  return err instanceof FetchError && err.statusCode === 404;
}

export class ContactsStore {
  /** Container URL, ending in `/`. */
  readonly root: string;

  constructor(podRoot: string, folder = "contacts/") {
    this.root = new URL(folder, podRoot).href;
  }

  docUrl(doc: Doc): string {
    return `${this.root}${doc}.ttl`;
  }

  protected async read(doc: Doc): Promise<SolidDataset> {
    try {
      return await getSolidDataset(this.docUrl(doc), { fetch: displayFetch });
    } catch (err) {
      if (isNotFound(err)) return createSolidDataset();
      throw err;
    }
  }

  protected async readFresh(doc: Doc): Promise<SolidDataset> {
    try {
      return await getSolidDataset(this.docUrl(doc), { fetch: authFetch });
    } catch (err) {
      if (isNotFound(err)) return createSolidDataset();
      throw err;
    }
  }

  protected async write(doc: Doc, ds: SolidDataset): Promise<void> {
    await saveSolidDatasetAt(this.docUrl(doc), ds, { fetch: authFetch });
  }

  async load(): Promise<Book> {
    const [people, settings] = await Promise.all([this.read("people"), this.read("settings")]);
    const s = getThing(settings, `${this.docUrl("settings")}#settings`);
    return {
      people: datasetToPeople(people),
      settings: {
        sortBy: s && getStringNoLocale(s, SC("sortBy")) === "last" ? "last" : "first",
        googleClientId: (s && getStringNoLocale(s, SC("googleClientId"))) ?? "",
      },
    };
  }

  /** The IRI a new person gets. */
  newPersonId(): string {
    return `${this.docUrl("people")}#${newId()}`;
  }

  private static put(ds: SolidDataset, p: Person): SolidDataset {
    for (const t of getThingAll(ds)) if (belongsTo(t.url, p.id)) ds = removeThing(ds, t);
    for (const t of personToThings(p)) ds = setThing(ds, t);
    return ds;
  }

  /** Saves one person; a person without an id gets one. Returns them as saved. */
  async save(p: Person): Promise<Person> {
    const [saved] = await this.saveMany([p]);
    return saved;
  }

  /**
   * Saves several people in writes of `chunk`: a first import of a few
   * thousand is a handful of PATCHes instead of one a server may refuse.
   */
  async saveMany(people: Person[], onProgress?: (done: number) => void, chunk = 250): Promise<Person[]> {
    const saved = people.map((p) => ({ ...p, id: p.id || this.newPersonId() }));
    for (let i = 0; i < saved.length; i += chunk) {
      let ds = await this.readFresh("people");
      for (const p of saved.slice(i, i + chunk)) ds = ContactsStore.put(ds, p);
      await this.write("people", ds);
      onProgress?.(Math.min(i + chunk, saved.length));
    }
    return saved;
  }

  /** Removes people for good (emptying the trash, or the losing side of a merge). */
  async removeMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    let ds = await this.readFresh("people");
    for (const t of getThingAll(ds)) if (ids.some((id) => belongsTo(t.url, id))) ds = removeThing(ds, t);
    await this.write("people", ds);
  }

  async saveSettings(settings: Settings): Promise<void> {
    let ds = await this.readFresh("settings");
    const t = buildThing(createThing({ url: `${this.docUrl("settings")}#settings` }))
      .addStringNoLocale(SC("sortBy"), settings.sortBy)
      .addStringNoLocale(SC("googleClientId"), settings.googleClientId.trim())
      .build();
    ds = setThing(ds, t);
    await this.write("settings", ds);
  }

  /** Empties people trashed more than TRASH_DAYS ago. Returns how many. */
  async purgeTrash(people: Person[], now = new Date()): Promise<number> {
    const cutoff = now.getTime() - TRASH_DAYS * 86_400_000;
    const old = people.filter((p) => p.trashedAt && p.trashedAt.getTime() < cutoff).map((p) => p.id);
    await this.removeMany(old);
    return old.length;
  }
}

/** The same app with nothing leaving the tab: `?demo`. Gone on reload. */
export class DemoStore extends ContactsStore {
  private docs = new Map<Doc, SolidDataset>();

  constructor() {
    super("https://demo.invalid/");
  }

  protected async read(doc: Doc): Promise<SolidDataset> {
    return this.docs.get(doc) ?? createSolidDataset();
  }

  protected async readFresh(doc: Doc): Promise<SolidDataset> {
    return this.read(doc);
  }

  protected async write(doc: Doc, ds: SolidDataset): Promise<void> {
    this.docs.set(doc, ds);
  }
}
