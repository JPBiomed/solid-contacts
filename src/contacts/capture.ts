/**
 * Getting someone into Contacts from wherever you see them, mostly a phone.
 *
 * - **Android**: install the app from Chrome, and it appears in the share
 *   menu (`share_target` in `public/manifest.webmanifest`). Sharing a LinkedIn
 *   profile, a contact card or any text opens `/share-target?title=&text=&url=`,
 *   which becomes the new-contact form, filled in.
 * - **iPhone**: iOS doesn't let web apps into the share menu, so a Shortcut
 *   opens the address from `shortcutUrlPrefix` with the shared text.
 * - **Computer**: a bookmarklet reads the LinkedIn profile on screen.
 *
 * All of them end on `#/new?…`, which opens the person instead when they are
 * already in Contacts.
 */

/**
 * The person's name from what the LinkedIn app shares. Best effort: the app
 * shares "Check out Jane Doe’s profile on LinkedIn https://…" in English and a
 * translated sentence otherwise; unrecognised text gives "".
 */
export function nameFromShare(text: string, title = ""): string {
  const patterns = [
    /check out (.+?)[’'`]s? profile/i,
    /découvrez le profil de (.+?) sur linkedin/i,
    /bekijk het profiel van (.+?) op linkedin/i,
    /^(.+?)\s*[|–-]\s*linkedin\s*$/i,
  ];
  for (const source of [text, title]) {
    for (const re of patterns) {
      const m = source.trim().match(re);
      if (m && m[1].trim() && !/https?:/i.test(m[1])) return m[1].trim();
    }
  }
  return "";
}

/** The new-contact route for something shared. */
export function captureRoute(input: { text?: string; url?: string; title?: string }): string {
  const params = new URLSearchParams();
  const name = nameFromShare(input.text ?? "", input.title ?? "");
  if (name) params.set("name", name);
  const text = [input.text, input.url].filter(Boolean).join(" ").trim();
  if (text) params.set("text", text);
  // Shared text that is just an email or a phone number fills that field.
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
  if (email && !/linkedin\.com/i.test(text)) params.set("email", email);
  const phone = !/linkedin\.com/i.test(text) ? text.match(/\+?\d[\d\s./-]{6,}\d/)?.[0] : undefined;
  if (phone) params.set("phone", phone.trim());
  return `/new?${params}`;
}

/** The manifest's `share_target.action`. */
export const SHARE_TARGET_PATH = "/share-target";

/**
 * The hash route for an Android share-target launch, or null when the address
 * is not one. A path of its own rather than a flag on `/`: sign-in returns to
 * `/?code=&state=`, which must never be taken for a share.
 */
export function shareTargetRoute(pathname: string, search: string): string | null {
  if (pathname !== SHARE_TARGET_PATH) return null;
  const q = new URLSearchParams(search);
  const text = q.get("text") ?? "";
  const url = q.get("url") ?? "";
  const title = q.get("title") ?? "";
  if (!text && !url && !title) return null;
  return captureRoute({ text, url, title });
}

/** What the iPhone Shortcut opens, followed by the shared text, URL-encoded. */
export function shortcutUrlPrefix(origin: string): string {
  return `${origin.replace(/\/$/, "")}/#/new?source=linkedin&text=`;
}

/**
 * A `javascript:` bookmark for a computer: reads the name, headline and
 * address of the LinkedIn profile on screen and opens the form in a new tab.
 */
export function bookmarkletSource(origin: string): string {
  const target = `${origin.replace(/\/$/, "")}/#/new?source=linkedin`;
  const body = `(function(){
var d=document,e=encodeURIComponent,t=function(s){var n=d.querySelector(s);return n?n.textContent.trim():""};
var name=t("main h1")||d.title.replace(/^\\(\\d+\\)\\s*/,"").replace(/\\s*\\|\\s*LinkedIn.*$/i,"");
var role=t("main .text-body-medium.break-words");
if(!/linkedin\\.com\\/in\\//.test(location.href)){alert("Open someone's LinkedIn profile first.");return}
window.open(${JSON.stringify(target)}+"&name="+e(name)+"&role="+e(role)+"&linkedin="+e(location.href),"_blank")
})()`;
  return `javascript:${body.replace(/\n/g, "")}`;
}
