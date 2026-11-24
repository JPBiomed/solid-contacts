/**
 * Merge & fix: people who look like the same person. Shared email, phone,
 * LinkedIn or import id, or the same full name. Merging keeps everything both
 * had, in the card with the most details, so the fuller card absorbs the
 * thinner one.
 */
import { mergePeople, whatMergeAdds } from "../dedupe";
import { displayName, type Person } from "../model";
import { registerRoute, type Ctx } from "../routes";
import { avatar, busy, dismissMerge, esc, mergeKey, mergeSuggestions, personHref, renderFrame, toast } from "../ui";

/** How much a card holds: the fuller one is kept and the others merged into it. */
function richness(p: Person): number {
  return p.emails.length + p.phones.length + p.addresses.length + p.labels.length + p.websites.length + (p.company ? 1 : 0) + (p.note ? 1 : 0) + (p.birthday ? 1 : 0);
}

export function mergeGroup(group: Person[]): { kept: Person; removed: string[] } {
  const [first, ...rest] = [...group].sort((a, b) => richness(b) - richness(a));
  return { kept: rest.reduce(mergePeople, first), removed: rest.map((p) => p.id) };
}

async function apply(ctx: Ctx, groups: Person[][]): Promise<void> {
  const results = groups.map(mergeGroup);
  await ctx.store.saveMany(results.map((r) => r.kept));
  await ctx.store.removeMany(results.flatMap((r) => r.removed));
  const before = groups.flat();
  toast(groups.length === 1 ? `Merged into ${displayName(results[0].kept)}.` : `Merged ${groups.length} groups.`, {
    undo: () =>
      void (async () => {
        await ctx.store.saveMany(before);
        await ctx.refresh();
      })(),
  });
  await ctx.refresh();
}

function renderMerge(ctx: Ctx): void {
  const groups = mergeSuggestions(ctx.data.people);
  renderFrame(ctx, {
    title: "Merge & fix",
    section: "merge",
    actions: groups.length > 1 ? `<button type="button" id="merge-all">Merge all (${groups.length})</button>` : "",
    body:
      groups.length === 0
        ? `<div class="empty-state stack"><h2>No duplicates</h2><p class="lead">Nobody here looks like the same person twice.</p></div>`
        : `<p class="hint">These look like the same person: they share an email, a phone, LinkedIn or their full name. Merging keeps every detail of each.</p>
           <ul class="merge-list">${groups
             .map((g) => {
               const { kept } = mergeGroup(g);
               const adds = g.filter((p) => p !== g.find((x) => x.id === kept.id)).flatMap((p) => whatMergeAdds(g.find((x) => x.id === kept.id)!, p));
               return `
             <li class="merge-card" data-key="${esc(mergeKey(g))}">
               <ul class="merge-people">${g
                 .map((p) => `<li>${avatar(p)}<a href="${esc(personHref(p))}">${esc(displayName(p))}</a><span class="hint">${esc([p.emails[0]?.value, p.phones[0]?.value, p.company].filter(Boolean).join(" · "))}</span></li>`)
                 .join("")}</ul>
               ${adds.length ? `<p class="hint">Merging adds ${esc([...new Set(adds)].join(", "))} to ${esc(displayName(kept))}.</p>` : ""}
               <div class="merge-actions"><button type="button" class="ghost small" data-act="dismiss">Dismiss</button><button type="button" class="small" data-act="merge">Merge</button></div>
             </li>`;
             })
             .join("")}</ul>`,
  });
  ctx.app.querySelector("#merge-all")?.addEventListener("click", (e) => void busy(e.currentTarget as HTMLButtonElement, () => apply(ctx, groups)));
  ctx.app.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((b) =>
    b.addEventListener("click", () => {
      const key = b.closest<HTMLElement>("[data-key]")!.dataset.key!;
      const group = groups.find((g) => mergeKey(g) === key);
      if (!group) return;
      if (b.dataset.act === "dismiss") {
        dismissMerge(key);
        renderMerge(ctx);
      } else void busy(b, () => apply(ctx, [group]));
    })
  );
}

registerRoute({ pattern: "/merge", render: renderMerge });
