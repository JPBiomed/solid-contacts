/**
 * Import: everyone from Google accounts, the phone, contact files and the CRM.
 *
 * Each source adds to one list where the same person seen in several places
 * is already one, and each row says what happens: a new person, details added
 * to someone already here, or nothing. Everyone is ticked (Jason's choice:
 * bring everyone in); untick to leave someone out.
 *
 * Loaded sources live in this module, not in the screen, so a re-render or a
 * save never drops an account you just signed in to.
 */
import { getSolidDataset, getStringNoLocale, getStringNoLocaleAll, getThingAll, getUrlAll } from "@inrupt/solid-client";
import { authFetch } from "../../lib/auth";
import { GOOGLE_CLIENT_ID } from "../../config";
import { displayName, emptyPerson } from "../model";
import { finish, isUsable, parseContactsFile } from "../files";
import { readGoogleAccount, requestToken } from "../google";
import { canPickFromPhone, pickFromPhone } from "../phone";
import { importWrites, planImport, type ImportOptions, type PlanRow, type RowStatus, type Source } from "../plan";
import { registerRoute, type Ctx } from "../routes";
import { ICON } from "../icons";
import { $, active, avatar, busy, chips, esc, personHref, renderFrame, toast } from "../ui";
import { thingToPerson } from "../model";
import { RDF_TYPE } from "../vocab";

const state = {
  sources: new Map<string, Source>(),
  options: { prefixLabels: true, includeOther: true } as ImportOptions,
  skip: new Set<string>(),
  mergeByName: new Set<string>(),
  filter: { q: "", status: "" as "" | RowStatus },
};

const ACCOUNTS_KEY = "contacts:google-accounts";
function rememberedAccounts(): string[] {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}
function setRemembered(list: string[]): void {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([...new Set(list)]));
  } catch {
    // Storage blocked: accounts just aren't offered again next time.
  }
}

/** A personal Gmail is labelled "personal"; a work account by its domain's name. */
export function accountLabel(account: string): string {
  const domain = account.split("@")[1] ?? "";
  if (!domain || /^(gmail|googlemail)\.com$/.test(domain)) return "personal";
  return domain.split(".").slice(0, -1).join(".") || domain;
}

const STATUS_TEXT: Record<RowStatus, string> = {
  new: "New",
  update: "Adds to",
  same: "Already here as",
  name: "Same name as",
};

// ---------------------------------------------------------------- sources

async function addGoogle(ctx: Ctx, clientId: string, account = ""): Promise<void> {
  const token = await requestToken(clientId, account);
  toast("Reading your Google contacts…");
  const data = await readGoogleAccount(token);
  const id = `google:${data.account}`;
  state.sources.set(id, { id, name: data.account, kind: "google", people: data.people, label: state.sources.get(id)?.label ?? accountLabel(data.account) });
  setRemembered([...rememberedAccounts(), data.account]);
  toast(`${data.people.length} from ${data.account}.`);
  renderImport(ctx);
}

async function addPhone(ctx: Ctx): Promise<void> {
  const people = await pickFromPhone();
  if (people.length === 0) return;
  const prev = state.sources.get("phone");
  state.sources.set("phone", { id: "phone", name: "This phone", kind: "phone", people: [...(prev?.people ?? []), ...people], label: prev?.label ?? "" });
  renderImport(ctx);
}

async function addFiles(ctx: Ctx, files: File[]): Promise<void> {
  for (const file of files) {
    const people = parseContactsFile(await file.text(), "file");
    if (people.length === 0) {
      toast(`No contacts found in ${file.name}. Is it a vCard (.vcf) or CSV export?`, { durationMs: 8000 });
      continue;
    }
    const id = `file:${file.name}`;
    state.sources.set(id, { id, name: file.name, kind: "file", people, label: state.sources.get(id)?.label ?? "" });
  }
  renderImport(ctx);
}

/**
 * The CRM's people (`<pod>/crm/contacts.ttl`), from before Contacts was its
 * own app. Its tags become labels and its organizations the company.
 */
async function addCrm(ctx: Ctx): Promise<void> {
  const base = new URL("crm/", ctx.podUrl).href;
  const read = async (doc: string) => {
    try {
      return await getSolidDataset(`${base}${doc}.ttl`, { fetch: authFetch });
    } catch {
      return null;
    }
  };
  const [contacts, orgs] = await Promise.all([read("contacts"), read("organizations")]);
  if (!contacts) {
    toast("No CRM contacts found in your pod.");
    return;
  }
  const orgName = new Map((orgs ? getThingAll(orgs) : []).map((t) => [t.url, getStringNoLocale(t, "http://www.w3.org/2006/vcard/ns#fn") ?? ""]));
  const people = getThingAll(contacts)
    .filter((t) => getUrlAll(t, RDF_TYPE).includes("http://www.w3.org/2006/vcard/ns#Individual"))
    .map((t) => {
      const p = thingToPerson(contacts, t) ?? emptyPerson();
      return finish({
        ...p,
        id: "",
        source: "crm",
        externalIds: [...p.externalIds, `crm:${t.url}`],
        labels: getStringNoLocaleAll(t, "https://schema.org/keywords"),
        company: getUrlAll(t, "https://schema.org/worksFor").map((o) => orgName.get(o) ?? "").find(Boolean) ?? "",
      });
    })
    .filter(isUsable);
  state.sources.set("crm", { id: "crm", name: "Maps of Making CRM", kind: "crm", people, label: state.sources.get("crm")?.label ?? "" });
  renderImport(ctx);
}

// ---------------------------------------------------------------- render

function filtered(rows: PlanRow[]): PlanRow[] {
  const words = state.filter.q.toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((r) => {
    if (state.filter.status && r.status !== state.filter.status) return false;
    if (!words.length) return true;
    const text = [displayName(r.person), ...r.person.emails.map((e) => e.value), r.person.company, ...r.person.labels].join(" ").toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

const SHOWN = 200;

function renderRow(r: PlanRow): string {
  const p = r.person;
  const sub = [p.company, p.emails[0]?.value ?? p.phones[0]?.value].filter(Boolean).join(" · ");
  const link = r.match ? `<a href="${esc(personHref(r.match))}">${esc(displayName(r.match))}</a>` : "";
  let what = `<span class="import-status import-${r.status}">${STATUS_TEXT[r.status]}</span>`;
  if (r.status !== "new") what += ` ${link}`;
  if (r.status === "update" && r.adds.length) what += `: ${esc(r.adds.join(", "))}`;
  if (r.status === "name") {
    what += `
      <select class="name-choice" aria-label="What to do with ${esc(displayName(p))}">
        <option value="new"${state.mergeByName.has(r.key) ? "" : " selected"}>Add as someone else</option>
        <option value="merge"${state.mergeByName.has(r.key) ? " selected" : ""}>Same person: merge</option>
      </select>`;
  }
  const sources = r.sources.map((s) => state.sources.get(s)?.name ?? s).join(", ");
  return `
    <li class="import-row" data-key="${esc(r.key)}">
      <input type="checkbox" class="import-pick" aria-label="Import ${esc(displayName(p))}"${r.status === "same" ? " disabled" : state.skip.has(r.key) ? "" : " checked"} />
      ${avatar(p)}
      <div class="import-body">
        <span class="person-name">${esc(displayName(p))}</span>
        ${sub ? `<span class="person-sub">${esc(sub)}</span>` : ""}
        <span class="hint">${what}</span>
        <span class="hint">From ${esc(sources)}</span>
        ${chips(p.labels, false)}
      </div>
    </li>`;
}

function renderRows(rows: PlanRow[]): string {
  const shown = filtered(rows);
  if (shown.length === 0) return `<p class="hint">Nobody matches.</p>`;
  return `
    <p class="hint">${shown.length} shown${shown.length > SHOWN ? `, the first ${SHOWN} listed (search to find others)` : ""}.
      <button type="button" class="link-button" data-pick="all">Tick all shown</button> ·
      <button type="button" class="link-button" data-pick="none">Untick all shown</button></p>
    <ul class="import-list">${shown.slice(0, SHOWN).map(renderRow).join("")}</ul>`;
}

function renderSummary(rows: PlanRow[]): string {
  const n = (s: RowStatus) => rows.filter((r) => r.status === s).length;
  const chosen = rows.filter((r) => r.status !== "same" && !state.skip.has(r.key)).length;
  return `
    <p class="lead">${rows.length} people: ${n("new")} new, ${n("update")} with details to add, ${n("same")} already here.</p>
    ${
      n("name")
        ? `<p class="notice">${n("name") === 1 ? "1 person has" : `${n("name")} people have`} the same name as someone already here, and nothing else in common. ${n("name") === 1 ? "They're" : "They're"} added as someone else unless you say they're the same.
            <button type="button" class="link-button" data-status="name">Check them</button> ·
            <button type="button" class="link-button" id="merge-names">They're the same: merge all</button></p>`
        : ""
    }
    <div class="import-go"><button type="button" id="import-run"${chosen ? "" : " disabled"}>Import ${chosen} ${chosen === 1 ? "person" : "people"}</button><span class="hint" id="progress" role="status"></span></div>`;
}

function sourceIcon(kind: Source["kind"]): string {
  return kind === "google" ? ICON.google : kind === "phone" ? ICON.mobile : kind === "crm" ? ICON.work : ICON.file;
}

function renderImport(ctx: Ctx): void {
  const clientId = GOOGLE_CLIENT_ID || ctx.data.settings.googleClientId;
  const sources = [...state.sources.values()];
  const rows = sources.length ? planImport(sources, active(ctx.data.people), state.options) : [];
  const again = rememberedAccounts().filter((a) => !state.sources.has(`google:${a}`));
  renderFrame(ctx, {
    title: "Import contacts",
    section: "import",
    body: `
      <p class="lead">Bring in everyone. The same person found in several places becomes one contact, and someone already here only gets what's missing.</p>
      <div class="source-grid">
        <button type="button" class="source-card" id="add-google"${clientId ? "" : " disabled"}>${ICON.google}<strong>Google account</strong><span class="hint">${clientId ? "Contacts, labels and Other contacts. One account at a time: personal and work." : "Set up Google sign-in in Settings first."}</span></button>
        <button type="button" class="source-card" id="add-phone"${canPickFromPhone() ? "" : " disabled"}>${ICON.mobile}<strong>This phone</strong><span class="hint">${canPickFromPhone() ? "Pick people from the phone's contacts." : "Open this app in Chrome on Android to pick from the phone's contacts."}</span></button>
        <label class="source-card" id="drop">${ICON.file}<strong>Files</strong><span class="hint">Drop or choose .vcf or .csv files, from Google, a phone or Outlook.</span>
          <input type="file" id="file" accept=".vcf,.vcard,.csv,text/vcard,text/x-vcard,text/csv" multiple class="visually-hidden" /></label>
        <button type="button" class="source-card" id="add-crm">${ICON.work}<strong>The CRM</strong><span class="hint">The people already in your Maps of Making CRM.</span></button>
      </div>
      ${again.length ? `<p class="hint">Check again: ${again.map((a) => `<button type="button" class="link-button again" data-account="${esc(a)}">${esc(a)}</button>`).join(" · ")}</p>` : ""}
      ${
        sources.length
          ? `<section class="card-section stack" aria-labelledby="sources-h">
              <h2 id="sources-h">Sources</h2>
              <ul class="sources">${sources
                .map(
                  (s) => `
                <li data-source="${esc(s.id)}">
                  ${sourceIcon(s.kind)}
                  <span class="source-name"><strong>${esc(s.name)}</strong> <span class="hint">${s.people.length}</span></span>
                  <label class="source-label">Label everyone <input type="text" class="source-label-input" value="${esc(s.label)}" placeholder="none" /></label>
                  <button type="button" class="ghost icon-button source-remove" aria-label="Remove ${esc(s.name)}">${ICON.close}</button>
                </li>`
                )
                .join("")}</ul>
              <label class="check-row"><input type="checkbox" id="opt-prefix"${state.options.prefixLabels ? " checked" : ""} /> Keep where labels come from: “Friends” from a source labelled “personal” becomes “personal/Friends”</label>
              <label class="check-row"><input type="checkbox" id="opt-other"${state.options.includeOther ? " checked" : ""} /> Include Google's Other contacts (people saved because you emailed them), labelled “Other contacts”</label>
            </section>
            <section class="card-section stack" aria-labelledby="review-h">
              <h2 id="review-h">Review</h2>
              <div id="summary">${renderSummary(rows)}</div>
              <form class="import-filter" role="search">
                <input type="search" name="q" value="${esc(state.filter.q)}" placeholder="Search the import" aria-label="Search the import" />
                <select name="status" aria-label="Show">
                  <option value="">Everyone</option>
                  ${(["new", "update", "name", "same"] as RowStatus[]).map((s) => `<option value="${s}"${state.filter.status === s ? " selected" : ""}>${{ new: "New", update: "Adds details", name: "Same name only", same: "Already here" }[s]}</option>`).join("")}
                </select>
              </form>
              <div id="rows">${renderRows(rows)}</div>
            </section>`
          : ""
      }`,
  });
  wire(ctx, clientId, rows);
}

function wire(ctx: Ctx, clientId: string, rows: PlanRow[]): void {
  const app = ctx.app;
  const refreshRows = () => {
    app.querySelector("#rows")!.innerHTML = renderRows(rows);
    app.querySelector("#summary")!.innerHTML = renderSummary(rows);
  };
  app.querySelector("#add-google")?.addEventListener("click", (e) => void busy(e.currentTarget as HTMLButtonElement, () => addGoogle(ctx, clientId)));
  app.querySelectorAll<HTMLButtonElement>(".again").forEach((b) =>
    b.addEventListener("click", () => (clientId ? void busy(b, () => addGoogle(ctx, clientId, b.dataset.account!)) : toast("Set up Google sign-in in Settings first.")))
  );
  app.querySelector("#add-phone")?.addEventListener("click", (e) => void busy(e.currentTarget as HTMLButtonElement, () => addPhone(ctx)));
  app.querySelector("#add-crm")?.addEventListener("click", (e) => void busy(e.currentTarget as HTMLButtonElement, () => addCrm(ctx)));
  const file = app.querySelector<HTMLInputElement>("#file")!;
  file.addEventListener("change", () => file.files?.length && void busy(null, () => addFiles(ctx, [...file.files!])));
  const drop = $(app, "#drop");
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("is-drop-over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-drop-over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("is-drop-over");
    if (e.dataTransfer?.files.length) void busy(null, () => addFiles(ctx, [...e.dataTransfer!.files]));
  });

  app.querySelectorAll<HTMLElement>("[data-source]").forEach((li) => {
    const id = li.dataset.source!;
    li.querySelector<HTMLInputElement>(".source-label-input")?.addEventListener("change", (e) => {
      const s = state.sources.get(id);
      if (s) s.label = (e.target as HTMLInputElement).value.trim();
      renderImport(ctx);
    });
    li.querySelector(".source-remove")?.addEventListener("click", () => {
      state.sources.delete(id);
      if (id.startsWith("google:")) setRemembered(rememberedAccounts().filter((a) => `google:${a}` !== id));
      renderImport(ctx);
    });
  });
  app.querySelector<HTMLInputElement>("#opt-prefix")?.addEventListener("change", (e) => {
    state.options.prefixLabels = (e.target as HTMLInputElement).checked;
    renderImport(ctx);
  });
  app.querySelector<HTMLInputElement>("#opt-other")?.addEventListener("change", (e) => {
    state.options.includeOther = (e.target as HTMLInputElement).checked;
    renderImport(ctx);
  });

  const filter = app.querySelector<HTMLFormElement>(".import-filter");
  const apply = () => {
    const f = new FormData(filter!);
    state.filter = { q: String(f.get("q") ?? ""), status: String(f.get("status") ?? "") as "" | RowStatus };
    refreshRows();
  };
  filter?.addEventListener("input", apply);
  filter?.addEventListener("submit", (e) => {
    e.preventDefault();
    apply();
  });

  const review = app.querySelector("#review-h")?.parentElement;
  review?.addEventListener("change", (e) => {
    const t = e.target as HTMLElement;
    const key = t.closest<HTMLElement>("[data-key]")?.dataset.key;
    if (!key) return;
    if (t.classList.contains("import-pick")) {
      if ((t as HTMLInputElement).checked) state.skip.delete(key);
      else state.skip.add(key);
      app.querySelector("#summary")!.innerHTML = renderSummary(rows);
    }
    if (t.classList.contains("name-choice")) {
      if ((t as HTMLSelectElement).value === "merge") state.mergeByName.add(key);
      else state.mergeByName.delete(key);
    }
  });
  review?.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const pick = t.closest<HTMLElement>("[data-pick]")?.dataset.pick;
    if (pick) {
      for (const r of filtered(rows)) pick === "all" ? state.skip.delete(r.key) : state.skip.add(r.key);
      refreshRows();
    }
    const status = t.closest<HTMLElement>("[data-status]")?.dataset.status as RowStatus | undefined;
    if (status) {
      state.filter.status = status;
      const sel = filter?.querySelector<HTMLSelectElement>("select");
      if (sel) sel.value = status;
      refreshRows();
    }
    if (t.id === "merge-names") {
      for (const r of rows) if (r.status === "name") state.mergeByName.add(r.key);
      toast("They'll be merged into the people with the same name.");
      refreshRows();
    }
    if (t.id === "import-run") void busy(t as HTMLButtonElement, () => run(ctx));
  });
}

async function run(ctx: Ctx): Promise<void> {
  const progress = ctx.app.querySelector("#progress");
  // Plan against the pod as it is now, not as the screen loaded it.
  const fresh = await ctx.store.load();
  const rows = planImport([...state.sources.values()], active(fresh.people), state.options);
  const { people, created, updated } = importWrites(rows, state.skip, state.mergeByName);
  await ctx.store.saveMany(people, (done) => {
    if (progress) progress.textContent = `Saved ${done} of ${people.length}…`;
  });
  toast(`Imported: ${created} new, ${updated} updated.`, { durationMs: 8000 });
  state.skip.clear();
  await ctx.refresh();
}

registerRoute({ pattern: "/import", render: renderImport });
