/**
 * Picking people from the phone's own address book.
 *
 * Chrome on Android has the Contact Picker API: the phone shows its own
 * contacts list, the person ticks who to share, and only those come back —
 * name, emails, phone numbers, addresses. Nothing else on the phone is read.
 * Other browsers (and every desktop) don't have it; there, exporting a .vcf
 * from the phone's Contacts app and dropping it on Import does the same.
 */
import { finish, isUsable } from "./files";
import { emptyPerson, type Person } from "./model";

interface PickedAddress { addressLine?: string[]; city?: string; region?: string; postalCode?: string; country?: string }
interface Picked { name?: string[]; email?: string[]; tel?: string[]; address?: PickedAddress[] }
interface ContactsManager {
  getProperties(): Promise<string[]>;
  select(props: string[], options: { multiple: boolean }): Promise<Picked[]>;
}

function manager(): ContactsManager | null {
  const nav = navigator as Navigator & { contacts?: ContactsManager };
  return "contacts" in navigator && nav.contacts && "ContactsManager" in window ? nav.contacts : null;
}

export function canPickFromPhone(): boolean {
  return manager() !== null;
}

export function fromPicked(c: Picked): Person {
  return finish({
    ...emptyPerson(),
    source: "phone",
    name: c.name?.[0] ?? "",
    emails: (c.email ?? []).map((value) => ({ value, type: "home" })),
    phones: (c.tel ?? []).map((value) => ({ value, type: "mobile" })),
    addresses: (c.address ?? []).map((a) => ({
      street: (a.addressLine ?? []).join(", "), city: a.city ?? "", region: a.region ?? "",
      postcode: a.postalCode ?? "", country: a.country ?? "", type: "home",
    })),
  });
}

/** Opens the phone's picker. Resolves with the people chosen (none if cancelled). */
export async function pickFromPhone(): Promise<Person[]> {
  const m = manager();
  if (!m) throw new Error("This browser can't open the phone's contacts. Use Chrome on Android, or import a .vcf file.");
  const available = await m.getProperties();
  const props = ["name", "email", "tel", "address"].filter((p) => available.includes(p));
  const picked = await m.select(props, { multiple: true });
  return picked.map(fromPicked).filter(isUsable);
}
