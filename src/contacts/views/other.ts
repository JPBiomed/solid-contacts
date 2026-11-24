/**
 * The smaller screens: Export, Trash and Settings.
 */
import { APP_NAME, GOOGLE_CLIENT_ID } from "../../config";
import { logout } from "../../lib/auth";
import { toGoogleCsv, toVcards } from "../files";
import { bookmarkletSource, shortcutUrlPrefix } from "../capture";
import { displayName, labelCounts, type Person } from "../model";
import { registerRoute, type Ctx } from "../routes";
import { TRASH_DAYS } from "../store";
import { ICON } from "../icons";
import { $, active, avatar, busy, download, esc, renderFrame, toast } from "../ui";

// ---------------------------------------------------------------- export

function renderExport(ctx: Ctx): void {
  const people = active(ctx.data.people);
  const ids = (ctx.query.get("ids") ?? "").split(",").filter(Boolean);
  const labels = labelCounts(ctx.data.people);
  renderFrame(ctx, {
    title: "Export contacts",
    section: "export",
    body: `
      <form id="export" class="stack card-section">
        <fieldset class="stack">
          <legend class="group-label">Who</legend>
          ${ids.length ? `<label class="check-row"><input type="radio" name="who" value="selected" checked /> The ${ids.length} selected</label>` : ""}
          <label class="check-row"><input type="radio" name="who" value="all"${ids.length ? "" : " checked"} /> Everyone (${people.length})</label>
          <label class="check-row"><input type="radio" name="who" value="starred" /> Starred (${people.filter((p) => p.starred).length})</label>
          ${labels.length ? `<label class="check-row"><input type="radio" name="who" value="label" /> Label <select name="label" aria-label="Label">${labels.map(([l, n]) => `<option value="${esc(l)}">${esc(l)} (${n})</option>`).join("")}</select></label>` : ""}
        </fieldset>
        <fieldset class="stack">
          <legend class="group-label">Format</legend>
          <label class="check-row"><input type="radio" name="format" value="vcf" checked /> vCard (.vcf): for phones, iCloud, Outlook and Google</label>
          <label class="check-row"><input type="radio" name="format" value="csv" /> Google CSV: to import into a Google account, or open as a spreadsheet</label>
        </fieldset>
        <div><button type="submit">${ICON.export}<span>Export</span></button></div>
      </form>`,
  });
  const form = $(ctx.app, "#export") as HTMLFormElement;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const who = String(f.get("who"));
    const label = String(f.get("label") ?? "");
    const chosen: Person[] =
      who === "selected" ? people.filter((p) => ids.includes(p.id.split("#")[1])) : who === "starred" ? people.filter((p) => p.starred) : who === "label" ? people.filter((p) => p.labels.includes(label)) : people;
    if (chosen.length === 0) return toast("Nobody to export.");
    const date = new Date().toISOString().slice(0, 10);
    if (f.get("format") === "csv") download(`contacts-${date}.csv`, toGoogleCsv(chosen), "text/csv");
    else download(`contacts-${date}.vcf`, toVcards(chosen), "text/vcard");
    toast(`Exported ${chosen.length}.`);
  });
}

// ---------------------------------------------------------------- trash

function daysLeft(p: Person, now = Date.now()): number {
  return Math.max(0, TRASH_DAYS - Math.floor((now - (p.trashedAt?.getTime() ?? now)) / 86_400_000));
}

function renderTrash(ctx: Ctx): void {
  const trashed = ctx.data.people.filter((p) => p.trashedAt).sort((a, b) => b.trashedAt!.getTime() - a.trashedAt!.getTime());
  renderFrame(ctx, {
    title: "Trash",
    section: "trash",
    actions: trashed.length ? `<button type="button" class="ghost small" id="empty">Empty trash</button>` : "",
    body: `
      <p class="hint">People in the trash are deleted for good after ${TRASH_DAYS} days.</p>
      ${
        trashed.length === 0
          ? `<div class="empty-state"><h2>The trash is empty</h2></div>`
          : `<ul class="people">${trashed
              .map(
                (p) => `
            <li class="person-row" data-id="${esc(p.id)}">
              <div class="person-link">${avatar(p)}<span class="person-text"><span class="person-name">${esc(displayName(p))}</span><span class="person-sub">${daysLeft(p)} days left</span></span></div>
              <button type="button" class="ghost small" data-act="restore">${ICON.restore}<span>Restore</span></button>
              <button type="button" class="ghost small" data-act="forever">Delete forever</button>
            </li>`
              )
              .join("")}</ul>`
      }`,
  });
  ctx.app.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((b) =>
    b.addEventListener("click", () => {
      const p = trashed.find((x) => x.id === b.closest<HTMLElement>("[data-id]")!.dataset.id)!;
      if (b.dataset.act === "restore") {
        void busy(b, async () => {
          await ctx.store.save({ ...p, trashedAt: null });
          toast(`${displayName(p)} is back.`);
          await ctx.refresh();
        });
      } else if (confirm(`Delete ${displayName(p)} for good? This can't be undone.`)) {
        void busy(b, async () => {
          await ctx.store.removeMany([p.id]);
          await ctx.refresh();
        });
      }
    })
  );
  ctx.app.querySelector("#empty")?.addEventListener("click", (e) => {
    if (!confirm(`Delete all ${trashed.length} for good? This can't be undone.`)) return;
    void busy(e.currentTarget as HTMLButtonElement, async () => {
      await ctx.store.removeMany(trashed.map((p) => p.id));
      await ctx.refresh();
    });
  });
}

// ---------------------------------------------------------------- settings

function renderSettings(ctx: Ctx): void {
  const s = ctx.data.settings;
  const origin = location.origin;
  renderFrame(ctx, {
    title: "Settings",
    section: "settings",
    body: `
      <form id="settings" class="stack card-section">
        <h2>List</h2>
        <fieldset class="stack">
          <legend class="group-label">Sort by</legend>
          <label class="check-row"><input type="radio" name="sortBy" value="first"${s.sortBy === "first" ? " checked" : ""} /> First name</label>
          <label class="check-row"><input type="radio" name="sortBy" value="last"${s.sortBy === "last" ? " checked" : ""} /> Last name</label>
        </fieldset>
        <h2>Google sign-in</h2>
        <p class="hint">To bring in contacts from your Google accounts, Contacts needs a Google client ID. You create it once (about 10 minutes):</p>
        <ol class="steps">
          <li>In <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">Google Cloud</a>, create a project, e.g. "My contacts".</li>
          <li>Turn on the <a href="https://console.cloud.google.com/apis/library/people.googleapis.com" target="_blank" rel="noopener">People API</a> for it.</li>
          <li>In <a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noopener">Google Auth Platform</a>: audience <strong>External</strong>, status <strong>Testing</strong>, and add each Google account you'll connect as a <strong>test user</strong>.</li>
          <li>Under <strong>Clients</strong>, create an OAuth client of type <strong>Web application</strong>, and add <code>${esc(origin)}</code> to <strong>Authorized JavaScript origins</strong>. Google can take 5 minutes to accept a new origin.</li>
          <li>Paste its client ID here.</li>
        </ol>
        <p class="hint">A work account on Google Workspace may say "access blocked" until its admin allows this client ID (Admin console, Security, API controls, App access control).</p>
        ${
          GOOGLE_CLIENT_ID
            ? `<p class="hint">This build has a client ID built in.</p>`
            : `<div class="field"><label for="f-client">Google client ID</label><input id="f-client" name="client" value="${esc(s.googleClientId)}" placeholder="1234567890-abc….apps.googleusercontent.com" /></div>`
        }
        <div><button type="submit">Save settings</button></div>
      </form>
      <section class="card-section stack" aria-labelledby="capture-h">
        <h2 id="capture-h">Add people from anywhere</h2>
        <details class="steps-details"><summary>Android phone</summary>
          <ol class="steps">
            <li>Open ${esc(APP_NAME)} in Chrome, menu ⋮, <strong>Install app</strong> (or Add to home screen).</li>
            <li>In LinkedIn, a browser, Messages or any app, choose <strong>Share</strong>, then <strong>${esc(APP_NAME)}</strong>. The new-contact form opens, filled in.</li>
            <li>To bring in the phone's own contacts: Import, then This phone.</li>
          </ol></details>
        <details class="steps-details"><summary>iPhone</summary>
          <ol class="steps">
            <li>In Safari, Share, <strong>Add to Home Screen</strong>.</li>
            <li>iOS keeps web apps out of the share menu, so make a Shortcut named "Add to Contacts app": Show in Share Sheet (URLs and Text), then URL Encode the input, then Text with <code>${esc(shortcutUrlPrefix(origin))}</code> followed by the encoded text, then Open URLs.</li>
          </ol></details>
        <details class="steps-details"><summary>Computer</summary>
          <p>Drag this to your bookmarks bar, then click it on a LinkedIn profile: <a class="button-link ghost small" id="bookmarklet" href="${esc(bookmarkletSource(origin))}">Add to Contacts</a></p>
        </details>
      </section>
      <section class="card-section stack" aria-labelledby="pod-h">
        <h2 id="pod-h">Your pod</h2>
        <p class="hint">Signed in as <code>${esc(ctx.webId)}</code>. Your contacts are in <code>${esc(ctx.store.docUrl("people"))}</code>, in vCard terms other Solid apps can read.</p>
        <div><button type="button" class="ghost" id="logout">Sign out</button></div>
      </section>`,
  });
  const form = $(ctx.app, "#settings") as HTMLFormElement;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const client = String(f.get("client") ?? s.googleClientId).trim();
    if (client && !/\.apps\.googleusercontent\.com$/.test(client)) return toast("A Google client ID ends in .apps.googleusercontent.com.");
    void busy(form.querySelector('button[type="submit"]'), async () => {
      await ctx.store.saveSettings({ sortBy: f.get("sortBy") === "last" ? "last" : "first", googleClientId: client });
      toast("Saved.");
      await ctx.refresh();
    });
  });
  ctx.app.querySelector("#bookmarklet")?.addEventListener("click", (e) => {
    e.preventDefault();
    toast("Drag this button to your bookmarks bar, then use it on a LinkedIn profile.");
  });
  ctx.app.querySelector("#logout")?.addEventListener("click", async () => {
    await logout();
    location.href = "/";
  });
}

registerRoute({ pattern: "/export", render: renderExport });
registerRoute({ pattern: "/trash", render: renderTrash });
registerRoute({ pattern: "/settings", render: renderSettings });
