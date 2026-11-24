/**
 * The frame every screen sits in, and the small pieces screens share.
 *
 * Laid out like Google Contacts, because that is the address book Jason
 * already knows: a search bar on top, a side menu (Contacts, Merge & fix,
 * labels, Import, Export, Trash) that becomes a drawer on a phone, and a
 * round "+" button for adding someone, always in reach of the thumb.
 */
import { focusView } from "../ui/a11y";
import { esc, toast } from "../ui/patterns";
import { renderThemeButton } from "../ui/theme";
import { APP_NAME } from "../config";
import { duplicateGroups } from "./dedupe";
import { ICON } from "./icons";
import { avatarHue, initials, labelCounts, type Person } from "./model";
import { shortId, type Ctx } from "./routes";

export { esc, toast };

export function $(root: ParentNode, selector: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`Missing ${selector}`);
  return el;
}

export const active = (people: Person[]) => people.filter((p) => !p.trashedAt);

export function personHref(p: Person): string {
  return `#/person/${encodeURIComponent(shortId(p.id))}`;
}

export function byShortId(people: Person[], id: string): Person | undefined {
  return people.find((p) => shortId(p.id) === id);
}

export function avatar(p: Person, size: "s" | "m" | "l" = "s"): string {
  return `<span class="avatar avatar-${size} avatar-hue-${avatarHue(p)}" aria-hidden="true">${esc(initials(p))}</span>`;
}

/** Dismissed "Merge & fix" suggestions, per browser: a suggestion is a convenience, not data. */
const DISMISSED_KEY = "contacts:dismissed-merges";
export function dismissedMerges(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
export function dismissMerge(key: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissedMerges(), key]));
  } catch {
    // Storage blocked: the suggestion comes back next time, which is harmless.
  }
}
export function mergeKey(group: Person[]): string {
  return group.map((p) => p.id).sort().join("|");
}
export function mergeSuggestions(people: Person[]): Person[][] {
  const dismissed = dismissedMerges();
  return duplicateGroups(active(people)).filter((g) => !dismissed.has(mergeKey(g)));
}

function navItem(href: string, icon: string, label: string, current: boolean, count?: number | string): string {
  return `<a class="side-item${current ? " is-side-current" : ""}" href="${esc(href)}"${current ? ' aria-current="page"' : ""}>
    ${icon}<span class="side-label">${esc(label)}</span>${count !== undefined && count !== 0 ? `<span class="side-count">${esc(String(count))}</span>` : ""}</a>`;
}

/**
 * Renders a screen in the app's frame. `section` marks the side-menu entry
 * that is current; `fab` shows the round "+".
 */
export function renderFrame(
  ctx: Ctx,
  opts: { title: string; body: string; section?: string; fab?: boolean; titleHidden?: boolean; actions?: string; back?: string }
): void {
  const people = active(ctx.data.people);
  const trash = ctx.data.people.length - people.length;
  const suggestions = mergeSuggestions(ctx.data.people).length;
  const labels = labelCounts(ctx.data.people);
  const q = ctx.query.get("q") ?? "";
  const s = opts.section ?? "";
  ctx.app.innerHTML = `
    <div class="contacts-shell">
      <header class="top-bar">
        <button type="button" class="ghost icon-button" id="menu-toggle" aria-label="Menu" aria-expanded="false" aria-controls="side">${ICON.menu}</button>
        <a class="brand" href="#/">${ICON.person}<span>${esc(APP_NAME)}</span></a>
        <form class="top-search" role="search" id="top-search">
          ${ICON.search}
          <input type="search" name="q" value="${esc(q)}" placeholder="Search" aria-label="Search contacts" autocomplete="off" />
        </form>
        ${renderThemeButton()}
      </header>
      <nav class="side" id="side" aria-label="Sections">
        <a class="create-button" href="#/new">${ICON.plus}<span>Create contact</span></a>
        ${navItem("#/", ICON.person, "Contacts", s === "contacts", people.length)}
        ${navItem("#/merge", ICON.merge, "Merge & fix", s === "merge", suggestions)}
        <div class="side-heading"><span>Labels</span><button type="button" class="ghost icon-button small" id="new-label" aria-label="Create label">${ICON.plus}</button></div>
        ${labels.map(([l, n]) => navItem(`#/label/${encodeURIComponent(l)}`, ICON.label, l, s === `label:${l}`, n)).join("")}
        <hr />
        ${navItem("#/import", ICON.import, "Import", s === "import")}
        ${navItem("#/export", ICON.export, "Export", s === "export")}
        ${navItem("#/trash", ICON.trash, "Trash", s === "trash", trash)}
        ${navItem("#/settings", ICON.settings, "Settings", s === "settings")}
      </nav>
      <div class="side-scrim" id="side-scrim" hidden></div>
      <main class="contacts-main stack">
        ${
          opts.titleHidden && !opts.actions
            ? `<h1 data-view-title tabindex="-1" class="visually-hidden">${esc(opts.title)}</h1>`
            : `<div class="title-row">
          ${opts.back ? `<a class="ghost icon-button back-link" href="${esc(opts.back)}" aria-label="Back">${ICON.back}</a>` : ""}
          <h1 data-view-title tabindex="-1"${opts.titleHidden ? ' class="visually-hidden"' : ""}>${esc(opts.title)}</h1>
          ${opts.titleHidden ? `<span class="title-spacer"></span>` : ""}
          ${opts.actions ? `<div class="title-actions">${opts.actions}</div>` : ""}
        </div>`
        }
        ${opts.body}
      </main>
      ${opts.fab ? `<a class="fab" href="#/new" aria-label="Create contact">${ICON.plus}</a>` : ""}
      <dialog class="sheet" id="label-dialog">
        <form method="dialog" class="stack" id="label-form">
          <h2>New label</h2>
          <div class="field"><label for="label-name">Name</label><input id="label-name" name="name" required /></div>
          <p class="hint">A label appears in the menu once someone carries it. Pick people for it from the list (Select, then Labels).</p>
          <div class="sheet-actions"><button type="button" class="ghost" value="cancel" data-close>Cancel</button><button type="submit">Create</button></div>
        </form>
      </dialog>
    </div>`;
  wireFrame(ctx);
  focusView(ctx.app);
  // Arriving from a search typed on another screen: keep typing where you were.
  if (ctx.query.get("q")) {
    const input = ctx.app.querySelector<HTMLInputElement>("#top-search input");
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  }
}

function wireFrame(ctx: Ctx): void {
  const app = ctx.app;
  const side = $(app, "#side");
  const scrim = $(app, "#side-scrim");
  const toggle = $(app, "#menu-toggle");
  const setOpen = (open: boolean) => {
    side.classList.toggle("is-side-open", open);
    scrim.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  };
  toggle.addEventListener("click", () => setOpen(!side.classList.contains("is-side-open")));
  scrim.addEventListener("click", () => setOpen(false));

  const search = $(app, "#top-search") as HTMLFormElement;
  const input = search.querySelector("input")!;
  search.addEventListener("submit", (e) => {
    e.preventDefault();
    input.blur();
  });
  input.addEventListener("input", () => {
    const q = input.value.trim();
    // Search always lists everyone; replaceState so typing doesn't fill the history.
    const target = `#/${q ? `?q=${encodeURIComponent(q)}` : ""}`;
    if (!location.hash.startsWith("#/?") && location.hash !== "#/" && location.hash !== "") {
      location.hash = target.slice(1);
      return;
    }
    history.replaceState(null, "", target);
    ctx.query = new URLSearchParams(q ? `q=${q}` : "");
    search.dispatchEvent(new CustomEvent("contacts-search"));
  });

  const dialog = app.querySelector<HTMLDialogElement>("#label-dialog")!;
  app.querySelector("#new-label")?.addEventListener("click", () => dialog.showModal());
  dialog.querySelector("[data-close]")?.addEventListener("click", () => dialog.close());
  dialog.querySelector("form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = String(new FormData(e.target as HTMLFormElement).get("name") ?? "").trim();
    dialog.close();
    if (name) ctx.go(`/label/${encodeURIComponent(name)}`);
  });
}

/** Runs a save, keeps the button busy meanwhile, reports failure in a toast. */
export async function busy(button: HTMLButtonElement | null, work: () => Promise<void>): Promise<void> {
  const label = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  }
  try {
    await work();
  } catch (err) {
    console.error(err);
    toast(err instanceof Error ? err.message : String(err), { durationMs: 10000 });
  } finally {
    if (button && button.isConnected) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      if (label !== undefined) button.innerHTML = label;
    }
  }
}

/** Offers a file to save: an export, one person's vCard. */
export function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function chips(labels: string[], link = true): string {
  if (labels.length === 0) return "";
  return `<span class="label-chips">${labels
    .map((l) => (link ? `<a class="label-chip" href="#/label/${encodeURIComponent(l)}">${esc(l)}</a>` : `<span class="label-chip">${esc(l)}</span>`))
    .join("")}</span>`;
}
