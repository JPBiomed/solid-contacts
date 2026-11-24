/**
 * The list: everyone, or everyone with one label. Starred people first, then
 * A to Z under letter headings, as in Google Contacts. Search filters as you
 * type. "Select" turns on checkboxes for acting on several people at once:
 * star, label, export, delete.
 */
import { displayName, letterOf, matchesQuery, sortKey, type Person } from "../model";
import { registerRoute, type Ctx } from "../routes";
import { ICON } from "../icons";
import { $, active, avatar, busy, chips, esc, personHref, renderFrame, toast } from "../ui";

/** Who is selected survives re-renders of the list, not navigation. */
let selected = new Set<string>();
let selecting = false;

function secondLine(p: Person): string {
  return [p.title && p.company ? `${p.title}, ${p.company}` : p.title || p.company, p.emails[0]?.value, p.phones[0]?.value].filter(Boolean).slice(0, 2).join(" · ");
}

function row(p: Person): string {
  const sel = selected.has(p.id);
  return `
    <li class="person-row${sel ? " is-row-selected" : ""}" data-id="${esc(p.id)}">
      ${
        selecting
          ? `<label class="row-check"><input type="checkbox" class="pick"${sel ? " checked" : ""} aria-label="Select ${esc(displayName(p))}" /></label>`
          : ""
      }
      <a class="person-link" href="${esc(personHref(p))}">
        ${avatar(p)}
        <span class="person-text">
          <span class="person-name">${esc(displayName(p))}</span>
          <span class="person-sub">${esc(secondLine(p))}</span>
        </span>
        <span class="person-email">${esc(p.emails[0]?.value ?? "")}</span>
        <span class="person-phone">${esc(p.phones[0]?.value ?? "")}</span>
        <span class="person-labels">${chips(p.labels, false)}</span>
      </a>
    </li>`;
}

function renderRows(ctx: Ctx, people: Person[]): string {
  const q = ctx.query.get("q") ?? "";
  const by = ctx.data.settings.sortBy;
  const shown = people.filter((p) => matchesQuery(p, q)).sort((a, b) => sortKey(a, by).localeCompare(sortKey(b, by)));
  if (people.length === 0) return "";
  if (shown.length === 0) return `<p class="hint">Nobody matches “${esc(q)}”.</p>`;
  const starred = q ? [] : shown.filter((p) => p.starred);
  const parts: string[] = [];
  if (starred.length) parts.push(`<h2 class="list-heading">Starred contacts (${starred.length})</h2><ul class="people">${starred.map(row).join("")}</ul>`);
  parts.push(`<h2 class="list-heading">${q ? `Results (${shown.length})` : `Contacts (${shown.length})`}</h2>`);
  let letter = "";
  let open = false;
  for (const p of shown) {
    const l = q ? "" : letterOf(p, by);
    if (l !== letter || !open) {
      if (open) parts.push("</ul>");
      if (l) parts.push(`<h3 class="letter">${esc(l)}</h3>`);
      parts.push(`<ul class="people">`);
      letter = l;
      open = true;
    }
    parts.push(row(p));
  }
  if (open) parts.push("</ul>");
  return parts.join("");
}

function bulkBar(): string {
  if (!selecting) return "";
  return `
    <div class="bulk-bar" role="toolbar" aria-label="Selected people">
      <button type="button" class="ghost icon-button" data-bulk="done" aria-label="Stop selecting">${ICON.close}</button>
      <span class="bulk-count" aria-live="polite">${selected.size} selected</span>
      <button type="button" class="ghost small" data-bulk="all">All</button>
      <span class="bulk-spacer"></span>
      <button type="button" class="ghost small" data-bulk="star"${selected.size ? "" : " disabled"}>${ICON.star}<span>Star</span></button>
      <button type="button" class="ghost small" data-bulk="labels"${selected.size ? "" : " disabled"}>${ICON.label}<span>Labels</span></button>
      <button type="button" class="ghost small" data-bulk="export"${selected.size ? "" : " disabled"}>${ICON.export}<span>Export</span></button>
      <button type="button" class="ghost small" data-bulk="delete"${selected.size ? "" : " disabled"}>${ICON.trash}<span>Delete</span></button>
    </div>`;
}

function labelsDialog(ctx: Ctx, label: string): string {
  const all = [...new Set([...active(ctx.data.people).flatMap((p) => p.labels), ...(label ? [label] : [])])].sort();
  return `
    <dialog class="sheet" id="bulk-labels">
      <form method="dialog" class="stack">
        <h2>Labels</h2>
        <p class="hint">Ticked: everyone selected gets it. Unticked: removed from everyone selected. Half: left as it is.</p>
        <div class="label-picks">
          ${all
            .map((l) => {
              const sel = active(ctx.data.people).filter((p) => selected.has(p.id));
              const n = sel.filter((p) => p.labels.includes(l)).length;
              const state = n === 0 ? "" : n === sel.length ? " checked" : ' data-mixed="1"';
              return `<label class="check-row"><input type="checkbox" name="label" value="${esc(l)}"${state} /> ${esc(l)}</label>`;
            })
            .join("")}
        </div>
        <div class="field"><label for="bulk-new-label">New label</label><input id="bulk-new-label" name="new" /></div>
        <div class="sheet-actions"><button type="button" class="ghost" data-close>Cancel</button><button type="submit">Apply</button></div>
      </form>
    </dialog>`;
}

async function saveWithUndo(ctx: Ctx, before: Person[], after: Person[], message: string): Promise<void> {
  await ctx.store.saveMany(after);
  toast(message, {
    undo: () =>
      void (async () => {
        await ctx.store.saveMany(before);
        await ctx.refresh();
      })(),
  });
  await ctx.refresh();
}

function renderList(ctx: Ctx, label = ""): void {
  const people = active(ctx.data.people).filter((p) => !label || p.labels.includes(label));
  const empty =
    ctx.data.people.length === 0
      ? `<div class="empty-state stack">
          <h2>No contacts yet</h2>
          <p class="lead">Bring in everyone from your Google accounts, your phone or a contacts file, or add someone by hand.</p>
          <p><a class="button-link" href="#/import">Import contacts</a> <a class="button-link ghost" href="#/new">Create contact</a></p>
        </div>`
      : label && people.length === 0
        ? `<div class="empty-state stack"><h2>No one has this label yet</h2><p class="lead">In Contacts, tap Select, tick people, then Labels, and tick “${esc(label)}”.</p></div>`
        : "";
  renderFrame(ctx, {
    title: label || "Contacts",
    titleHidden: !label,
    section: label ? `label:${label}` : "contacts",
    fab: true,
    actions:
      people.length > 0
        ? `<button type="button" class="ghost small" id="select-toggle">${selecting ? "Done" : "Select"}</button>${
            label ? `<button type="button" class="ghost small" id="rename-label">Rename</button><button type="button" class="ghost small" id="delete-label">Delete label</button>` : ""
          }`
        : "",
    body: `
      ${bulkBar()}
      ${empty}
      <div id="rows">${renderRows(ctx, people)}</div>
      ${labelsDialog(ctx, label)}`,
  });

  const app = ctx.app;
  const rerender = () => renderList(ctx, label);
  // On the search form, not on #app: #app outlives every screen and would collect one listener per visit.
  $(app, "#top-search").addEventListener("contacts-search", () => ($(app, "#rows").innerHTML = renderRows(ctx, people)));

  app.querySelector("#select-toggle")?.addEventListener("click", () => {
    selecting = !selecting;
    selected = new Set();
    rerender();
  });

  $(app, "#rows").addEventListener("change", (e) => {
    const box = e.target as HTMLInputElement;
    if (!box.classList.contains("pick")) return;
    const id = box.closest<HTMLElement>("[data-id]")!.dataset.id!;
    if (box.checked) selected.add(id);
    else selected.delete(id);
    box.closest("li")?.classList.toggle("is-row-selected", box.checked);
    const count = app.querySelector(".bulk-count");
    if (count) count.textContent = `${selected.size} selected`;
    app.querySelectorAll<HTMLButtonElement>("[data-bulk]").forEach((b) => {
      if (!["done", "all"].includes(b.dataset.bulk!)) b.disabled = selected.size === 0;
    });
  });

  const chosen = () => people.filter((p) => selected.has(p.id));
  app.querySelectorAll<HTMLButtonElement>("[data-bulk]").forEach((b) =>
    b.addEventListener("click", () => {
      const act = b.dataset.bulk;
      if (act === "done") {
        selecting = false;
        selected = new Set();
        return rerender();
      }
      if (act === "all") {
        const q = ctx.query.get("q") ?? "";
        const all = people.filter((p) => matchesQuery(p, q));
        selected = selected.size === all.length ? new Set() : new Set(all.map((p) => p.id));
        return rerender();
      }
      if (act === "export") {
        ctx.go(`/export?ids=${encodeURIComponent(chosen().map((p) => p.id.split("#")[1]).join(","))}`);
        return;
      }
      if (act === "labels") {
        app.querySelector<HTMLDialogElement>("#bulk-labels")?.showModal();
        return;
      }
      const before = chosen();
      if (act === "star") {
        const star = before.some((p) => !p.starred);
        void busy(b, () => saveWithUndo(ctx, before, before.map((p) => ({ ...p, starred: star })), star ? `Starred ${before.length}.` : `Unstarred ${before.length}.`));
      }
      if (act === "delete") {
        const now = new Date();
        selecting = false;
        selected = new Set();
        void busy(b, () => saveWithUndo(ctx, before, before.map((p) => ({ ...p, trashedAt: now })), `Moved ${before.length} to the trash.`));
      }
    })
  );

  const dialog = app.querySelector<HTMLDialogElement>("#bulk-labels");
  dialog?.querySelector("[data-close]")?.addEventListener("click", () => dialog.close());
  dialog?.querySelectorAll<HTMLInputElement>("input[data-mixed]").forEach((i) => (i.indeterminate = true));
  dialog?.querySelector("form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const boxes = [...form.querySelectorAll<HTMLInputElement>('input[name="label"]')];
    const add = boxes.filter((x) => x.checked && !x.indeterminate).map((x) => x.value);
    const remove = boxes.filter((x) => !x.checked && !x.indeterminate).map((x) => x.value);
    const fresh = String(new FormData(form).get("new") ?? "").trim();
    if (fresh) add.push(fresh);
    dialog.close();
    const before = chosen();
    const after = before.map((p) => ({ ...p, labels: [...new Set([...p.labels.filter((l) => !remove.includes(l)), ...add])] }));
    void busy(null, () => saveWithUndo(ctx, before, after, `Labels changed for ${before.length}.`));
  });

  app.querySelector("#rename-label")?.addEventListener("click", () => {
    const next = prompt(`Rename “${label}” to`, label)?.trim();
    if (!next || next === label) return;
    const before = people;
    const after = before.map((p) => ({ ...p, labels: [...new Set(p.labels.map((l) => (l === label ? next : l)))] }));
    void busy(null, async () => {
      await ctx.store.saveMany(after);
      ctx.go(`/label/${encodeURIComponent(next)}`);
    });
  });
  app.querySelector("#delete-label")?.addEventListener("click", () => {
    if (!confirm(`Delete the label “${label}”? The ${people.length} people keep everything else.`)) return;
    const before = people;
    const after = before.map((p) => ({ ...p, labels: p.labels.filter((l) => l !== label) }));
    void busy(null, async () => {
      await ctx.store.saveMany(after);
      toast(`Label “${label}” deleted.`, { undo: () => void ctx.store.saveMany(before).then(() => ctx.go(`/label/${encodeURIComponent(label)}`)) });
      ctx.go("/");
    });
  });
}

registerRoute({ pattern: "/", render: (ctx) => renderList(ctx) });
registerRoute({ pattern: "/label/:name", render: (ctx) => renderList(ctx, ctx.params.name) });
