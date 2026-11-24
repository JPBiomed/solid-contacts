/**
 * One person: the card, and the form to create or edit them.
 *
 * The card puts what you do with someone first, as on a phone: call, text,
 * email, WhatsApp, LinkedIn, one tap each. Below it, everything known about
 * them. The form follows Google's: the common fields open, the rest one tap
 * away, and any number of emails, phones and addresses, each with its kind.
 */
import {
  ADDRESS_TYPES,
  composeName,
  displayName,
  EMAIL_TYPES,
  emptyAddress,
  emptyPerson,
  extractLinkedIn,
  formatAddress,
  formatBirthday,
  normalizeLinkedIn,
  normalizeUrl,
  PHONE_TYPES,
  telHref,
  whatsappNumber,
  type Address,
  type Labeled,
  type Person,
} from "../model";
import { PeopleIndex } from "../dedupe";
import { toVcard } from "../files";
import { nameFromShare } from "../capture";
import { registerRoute, type Ctx } from "../routes";
import { ICON } from "../icons";
import { $, active, avatar, busy, byShortId, chips, download, esc, personHref, renderFrame, toast } from "../ui";

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : "");

function notFound(ctx: Ctx): void {
  renderFrame(ctx, { title: "Not found", body: `<p class="lead">This person may have been deleted for good.</p><p><a href="#/">Back to contacts</a></p>` });
}

function fileName(p: Person): string {
  return `${displayName(p).replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "contact"}.vcf`;
}

// ---------------------------------------------------------------- card

function renderPerson(ctx: Ctx): void {
  const p = byShortId(ctx.data.people, ctx.params.id);
  if (!p) return notFound(ctx);
  const phone = p.phones[0]?.value;
  const mobile = p.phones.find((t) => t.type === "mobile")?.value ?? phone;
  const email = p.emails[0]?.value;
  const wa = mobile ? whatsappNumber(mobile) : "";
  const quick = [
    phone && `<a class="quick" href="${esc(telHref(phone))}">${ICON.phone}<span>Call</span></a>`,
    mobile && `<a class="quick" href="sms:${esc(telHref(mobile).slice(4))}">${ICON.message}<span>Text</span></a>`,
    email && `<a class="quick" href="mailto:${esc(email)}">${ICON.mail}<span>Email</span></a>`,
    wa && `<a class="quick" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">${ICON.chat}<span>WhatsApp</span></a>`,
    p.linkedin && `<a class="quick" href="${esc(p.linkedin)}" target="_blank" rel="noopener">${ICON.link}<span>LinkedIn</span></a>`,
  ].filter(Boolean);

  const line = (icon: string, main: string, sub = "") => `<li class="detail">${icon}<div><div>${main}</div>${sub ? `<div class="hint">${esc(sub)}</div>` : ""}</div></li>`;
  const details: string[] = [
    ...p.emails.map((e, i) => line(i === 0 ? ICON.mail : "<span class='icon'></span>", `<a href="mailto:${esc(e.value)}">${esc(e.value)}</a>`, cap(e.type))),
    ...p.phones.map((t, i) => line(i === 0 ? ICON.phone : "<span class='icon'></span>", `<a href="${esc(telHref(t.value))}">${esc(t.value)}</a>`, cap(t.type))),
    ...p.addresses.map((a) =>
      line(ICON.map, `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formatAddress(a))}" target="_blank" rel="noopener">${esc(formatAddress(a))}</a>`, cap(a.type))
    ),
    ...(p.birthday ? [line(ICON.cake, esc(formatBirthday(p.birthday)), "Birthday")] : []),
    ...p.websites.map((w) => line(ICON.link, `<a href="${esc(w)}" target="_blank" rel="noopener">${esc(w.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>`)),
    ...(p.linkedin ? [line(ICON.link, `<a href="${esc(p.linkedin)}" target="_blank" rel="noopener">${esc(p.linkedin.replace(/^https:\/\/www\./, ""))}</a>`, "LinkedIn")] : []),
  ];
  const work = [p.title, p.department, p.company].filter(Boolean).join(", ");

  renderFrame(ctx, {
    title: displayName(p),
    titleHidden: true,
    section: "contacts",
    body: `
      ${p.trashedAt ? `<p class="notice">In the trash. <button type="button" class="link-button" id="restore">Restore</button></p>` : ""}
      <div class="card-head">
        <a class="ghost icon-button back-link" href="#/" aria-label="Back to contacts">${ICON.back}</a>
        <div class="card-actions">
          <button type="button" class="ghost icon-button" id="star" aria-pressed="${p.starred}" aria-label="${p.starred ? "Unstar" : "Star"}">${p.starred ? ICON.starFilled : ICON.star}</button>
          <a class="button-link small" href="${esc(personHref(p))}/edit">${ICON.edit}<span>Edit</span></a>
          <details class="more">
            <summary class="ghost icon-button" aria-label="More">⋮</summary>
            <div class="more-menu">
              <button type="button" class="ghost" id="share">${ICON.share}<span>Share</span></button>
              <button type="button" class="ghost" id="vcard">${ICON.export}<span>Download vCard</span></button>
              <button type="button" class="ghost" id="delete">${ICON.trash}<span>Delete</span></button>
            </div>
          </details>
        </div>
      </div>
      <div class="card-hero">
        ${avatar(p, "l")}
        <h2 class="card-name">${esc(displayName(p))}</h2>
        ${p.nickname && p.nickname !== displayName(p) ? `<p class="hint">“${esc(p.nickname)}”</p>` : ""}
        ${work ? `<p class="card-work">${esc(work)}</p>` : ""}
        ${chips(p.labels)}
      </div>
      ${quick.length ? `<nav class="quick-row" aria-label="Contact ${esc(displayName(p))}">${quick.join("")}</nav>` : ""}
      ${
        details.length || p.note
          ? `<section class="card-section stack" aria-labelledby="details-h">
              <h2 id="details-h">Contact details</h2>
              <ul class="details">${details.join("")}</ul>
              ${p.note ? `<div class="detail">${ICON.note}<p class="card-note">${esc(p.note)}</p></div>` : ""}
            </section>`
          : `<p class="hint">Nothing more about ${esc(displayName(p))} yet. <a href="${esc(personHref(p))}/edit">Add details</a></p>`
      }
      <p class="hint card-meta">${p.source && p.source !== "manual" ? `From ${esc(p.source)}. ` : ""}${p.modified ? `Changed ${esc(p.modified.toLocaleDateString())}.` : ""}</p>`,
  });

  const app = ctx.app;
  app.querySelector("#star")?.addEventListener("click", (e) =>
    void busy(e.currentTarget as HTMLButtonElement, async () => {
      await ctx.store.save({ ...p, starred: !p.starred });
      await ctx.refresh();
    })
  );
  app.querySelector("#restore")?.addEventListener("click", () =>
    void busy(null, async () => {
      await ctx.store.save({ ...p, trashedAt: null });
      toast(`${displayName(p)} is back.`);
      await ctx.refresh();
    })
  );
  app.querySelector("#delete")?.addEventListener("click", () =>
    void busy(null, async () => {
      await ctx.store.save({ ...p, trashedAt: new Date() });
      toast(`${displayName(p)} moved to the trash.`, {
        undo: () => void ctx.store.save({ ...p, trashedAt: null }).then(() => ctx.go(personHref(p).slice(1))),
      });
      ctx.go("/");
    })
  );
  app.querySelector("#vcard")?.addEventListener("click", () => download(fileName(p), toVcard(p), "text/vcard"));
  app.querySelector("#share")?.addEventListener("click", async () => {
    const file = new File([toVcard(p)], fileName(p), { type: "text/vcard" });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: displayName(p) });
      else {
        download(fileName(p), toVcard(p), "text/vcard");
        toast("Sharing isn't available here, so the vCard was downloaded instead.");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") toast(`Couldn't share: ${(err as Error).message}`);
    }
  });
}

// ---------------------------------------------------------------- form

function typeSelect(name: string, value: string, types: readonly string[]): string {
  const all = types.includes(value) || !value ? types : [...types, value];
  return `<select name="${name}" aria-label="Kind">${all.map((t) => `<option value="${esc(t)}"${t === value ? " selected" : ""}>${esc(cap(t))}</option>`).join("")}</select>`;
}

function valueRow(kind: "email" | "phone", v: Labeled): string {
  const types = kind === "email" ? EMAIL_TYPES : PHONE_TYPES;
  return `
    <div class="multi-row">
      <input name="${kind}" type="${kind === "email" ? "email" : "tel"}" value="${esc(v.value)}" placeholder="${kind === "email" ? "Email" : "Phone"}" aria-label="${kind === "email" ? "Email" : "Phone"}" ${kind === "phone" ? 'inputmode="tel"' : ""} />
      ${typeSelect(`${kind}-type`, v.type, types)}
      <button type="button" class="ghost icon-button" data-remove aria-label="Remove">${ICON.close}</button>
    </div>`;
}

function addressRow(a: Address): string {
  return `
    <fieldset class="address-row">
      <legend class="visually-hidden">Address</legend>
      <div class="multi-row">
        <input name="street" value="${esc(a.street)}" placeholder="Street address" aria-label="Street address" />
        ${typeSelect("address-type", a.type, ADDRESS_TYPES)}
        <button type="button" class="ghost icon-button" data-remove aria-label="Remove address">${ICON.close}</button>
      </div>
      <div class="field-grid">
        <input name="postcode" value="${esc(a.postcode)}" placeholder="Postal code" aria-label="Postal code" />
        <input name="city" value="${esc(a.city)}" placeholder="City" aria-label="City" />
        <input name="region" value="${esc(a.region)}" placeholder="Region" aria-label="Region" />
        <input name="country" value="${esc(a.country)}" placeholder="Country" aria-label="Country" />
      </div>
    </fieldset>`;
}

const input = (label: string, name: string, value: string, extra = "") =>
  `<div class="field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" value="${esc(value)}" ${extra} /></div>`;

/**
 * A new person from the link that opened the form: the share menu, the
 * LinkedIn bookmarklet, an iPhone Shortcut. `text` may be any shared text
 * containing a LinkedIn address.
 */
function prefill(q: URLSearchParams): Person {
  const text = [q.get("text"), q.get("url"), q.get("linkedin")].filter(Boolean).join(" ");
  const p = emptyPerson();
  p.name = q.get("name") || nameFromShare(q.get("text") ?? "", q.get("title") ?? "");
  const parts = p.name.split(/\s+/);
  if (parts.length >= 2) {
    p.given = parts.slice(0, -1).join(" ");
    p.family = parts[parts.length - 1];
    p.name = "";
  }
  p.linkedin = normalizeLinkedIn(q.get("linkedin") ?? "") || extractLinkedIn(text);
  p.title = q.get("role") ?? q.get("headline") ?? "";
  p.company = q.get("company") ?? q.get("org") ?? "";
  if (q.get("email")) p.emails = [{ value: q.get("email")!, type: "work" }];
  if (q.get("phone")) p.phones = [{ value: q.get("phone")!, type: "mobile" }];
  p.note = q.get("note") ?? "";
  p.source = q.get("source") ?? (p.linkedin ? "linkedin" : "manual");
  if (q.get("label")) p.labels = [q.get("label")!];
  return p;
}

function renderForm(ctx: Ctx, mode: "new" | "edit"): void {
  let p: Person;
  if (mode === "edit") {
    const found = byShortId(ctx.data.people, ctx.params.id);
    if (!found) return notFound(ctx);
    p = found;
  } else {
    p = prefill(ctx.query);
    // Already here? Open them rather than making a second one.
    const known = p.linkedin || p.emails.length || p.phones.length ? new PeopleIndex(active(ctx.data.people)).match(p) : null;
    if (known && !known.byNameOnly) {
      toast(`${displayName(known.person)} is already in your contacts.`);
      ctx.go(personHref(known.person).slice(1));
      return;
    }
  }
  const showMore = Boolean(p.prefix || p.middle || p.suffix || p.nickname);
  // A name that only exists as a whole ("Jane Doe" from an import) is offered split.
  if (!composeName(p) && p.name && !p.name.includes("@")) {
    const parts = p.name.trim().split(/\s+/);
    p = { ...p, given: parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0], family: parts.length > 1 ? parts[parts.length - 1] : "" };
  }
  const labels = [...new Set([...active(ctx.data.people).flatMap((x) => x.labels), ...p.labels])].sort();
  const emails = p.emails.length ? p.emails : [{ value: "", type: "home" }];
  const phones = p.phones.length ? p.phones : [{ value: "", type: "mobile" }];
  const back = mode === "edit" ? personHref(p) : "#/";

  renderFrame(ctx, {
    title: mode === "new" ? "Create contact" : "Edit contact",
    back,
    section: "contacts",
    body: `
      <form id="person-form" class="stack person-form" novalidate>
        <div class="form-avatar">${avatar(p.given || p.family || p.name ? p : { ...p, name: "?" }, "l")}</div>
        <section class="form-group" aria-label="Name">
          <div class="form-icon">${ICON.person}</div>
          <div class="stack">
            <div class="more-fields${showMore ? "" : " is-collapsed"}" id="more-name">
              ${input("Prefix", "prefix", p.prefix)}
            </div>
            ${input("First name", "given", p.given, 'autocomplete="given-name"')}
            <div class="more-fields${showMore ? "" : " is-collapsed"}">${input("Middle name", "middle", p.middle)}</div>
            ${input("Last name", "family", p.family, 'autocomplete="family-name"')}
            <div class="more-fields${showMore ? "" : " is-collapsed"}">
              ${input("Suffix", "suffix", p.suffix)}
              ${input("Nickname", "nickname", p.nickname)}
            </div>
            ${showMore ? "" : `<button type="button" class="link-button" id="show-more">Show more name fields</button>`}
          </div>
        </section>
        <section class="form-group" aria-label="Work">
          <div class="form-icon">${ICON.work}</div>
          <div class="stack">
            ${input("Company", "company", p.company, 'autocomplete="organization"')}
            ${input("Job title", "title", p.title)}
            ${input("Department", "department", p.department)}
          </div>
        </section>
        <section class="form-group" aria-label="Emails">
          <div class="form-icon">${ICON.mail}</div>
          <div class="stack" data-list="email">
            ${emails.map((e) => valueRow("email", e)).join("")}
            <button type="button" class="link-button" data-add="email">Add email</button>
          </div>
        </section>
        <section class="form-group" aria-label="Phones">
          <div class="form-icon">${ICON.phone}</div>
          <div class="stack" data-list="phone">
            ${phones.map((t) => valueRow("phone", t)).join("")}
            <button type="button" class="link-button" data-add="phone">Add phone</button>
          </div>
        </section>
        <section class="form-group" aria-label="Addresses">
          <div class="form-icon">${ICON.map}</div>
          <div class="stack" data-list="address">
            ${p.addresses.map(addressRow).join("")}
            <button type="button" class="link-button" data-add="address">Add address</button>
          </div>
        </section>
        <section class="form-group" aria-label="Birthday">
          <div class="form-icon">${ICON.cake}</div>
          <div class="stack">
            ${input("Birthday", "birthday", p.birthday.startsWith("--") ? "" : p.birthday, 'type="date"')}
            ${p.birthday.startsWith("--") ? `<p class="hint">Known without the year: ${esc(formatBirthday(p.birthday))}. Pick a date to replace it.</p>` : ""}
          </div>
        </section>
        <section class="form-group" aria-label="Links">
          <div class="form-icon">${ICON.link}</div>
          <div class="stack">
            ${input("LinkedIn", "linkedin", p.linkedin, 'type="url" inputmode="url" placeholder="https://www.linkedin.com/in/…"')}
            <div class="field"><label for="f-websites">Websites</label><textarea id="f-websites" name="websites" rows="2" placeholder="One per line">${esc(p.websites.join("\n"))}</textarea></div>
          </div>
        </section>
        <section class="form-group" aria-label="Labels">
          <div class="form-icon">${ICON.label}</div>
          <div class="stack">
            <div class="label-picks">
              ${labels.map((l) => `<label class="label-pick"><input type="checkbox" name="labels" value="${esc(l)}"${p.labels.includes(l) ? " checked" : ""} /> ${esc(l)}</label>`).join("")}
            </div>
            ${input("New label", "newLabel", "", 'placeholder="e.g. Fix My MedTech"')}
          </div>
        </section>
        <section class="form-group" aria-label="Notes">
          <div class="form-icon">${ICON.note}</div>
          <div class="field"><label for="f-note">Notes</label><textarea id="f-note" name="note" rows="4">${esc(p.note)}</textarea></div>
        </section>
        <div class="form-save">
          <a class="button-link ghost" href="${esc(back)}">Cancel</a>
          <button type="submit">Save</button>
        </div>
      </form>`,
  });

  const form = $(ctx.app, "#person-form") as HTMLFormElement;
  form.querySelector("#show-more")?.addEventListener("click", (e) => {
    form.querySelectorAll(".more-fields").forEach((el) => el.classList.remove("is-collapsed"));
    (e.target as HTMLElement).remove();
  });
  form.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const add = t.closest<HTMLElement>("[data-add]")?.dataset.add;
    if (add) {
      const html = add === "address" ? addressRow(emptyAddress()) : valueRow(add as "email" | "phone", { value: "", type: add === "email" ? "home" : "mobile" });
      t.insertAdjacentHTML("beforebegin", html);
      (t.previousElementSibling?.querySelector("input") as HTMLInputElement | null)?.focus();
    }
    const remove = t.closest("[data-remove]");
    if (remove) (remove.closest(".address-row") ?? remove.closest(".multi-row"))?.remove();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const f = new FormData(form);
    const val = (n: string) => String(f.get(n) ?? "").trim();
    const all = (n: string) => f.getAll(n).map((x) => String(x).trim());
    const pairs = (kind: string): Labeled[] => {
      const values = all(kind);
      const types = all(`${kind}-type`);
      return values.map((value, i) => ({ value, type: types[i] || "other" })).filter((x) => x.value);
    };
    const streets = all("street");
    const addresses: Address[] = streets
      .map((street, i) => ({
        street, city: all("city")[i] ?? "", region: all("region")[i] ?? "", postcode: all("postcode")[i] ?? "",
        country: all("country")[i] ?? "", type: all("address-type")[i] ?? "home",
      }))
      .filter((a) => a.street || a.city || a.country);
    const linkedinRaw = val("linkedin");
    const linkedin = normalizeLinkedIn(linkedinRaw);
    if (linkedinRaw && !linkedin) {
      toast("That LinkedIn address doesn't look like a profile (linkedin.com/in/…).");
      return;
    }
    const newLabel = val("newLabel");
    const birthday = val("birthday") || (p.birthday.startsWith("--") ? p.birthday : "");
    const updated: Person = {
      ...p,
      prefix: val("prefix"), given: val("given"), middle: val("middle"), family: val("family"), suffix: val("suffix"),
      nickname: val("nickname"),
      company: val("company"), title: val("title"), department: val("department"),
      emails: pairs("email"), phones: pairs("phone"), addresses, birthday,
      linkedin,
      websites: val("websites").split(/\n/).map(normalizeUrl).filter(Boolean),
      labels: [...new Set([...all("labels"), ...(newLabel ? [newLabel] : [])])],
      note: val("note"),
    };
    // The parts now say the name; a whole-name kept from an import would only disagree with them.
    if (composeName(updated)) updated.name = "";
    if (displayName(updated) === "(no name)") {
      toast("Add at least a name, a company, an email or a phone.");
      return;
    }
    void busy(form.querySelector('button[type="submit"]'), async () => {
      const saved = await ctx.store.save(updated);
      toast(mode === "new" ? `${displayName(saved)} added.` : "Saved.");
      ctx.go(personHref(saved).slice(1));
    });
  });
}

registerRoute({ pattern: "/person/:id", render: renderPerson });
registerRoute({ pattern: "/person/:id/edit", render: (ctx) => renderForm(ctx, "edit") });
registerRoute({ pattern: "/new", render: (ctx) => renderForm(ctx, "new") });
