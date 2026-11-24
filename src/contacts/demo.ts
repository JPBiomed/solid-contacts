/** Invented people for `?demo`. Nothing here is a real person. */
import { emptyPerson, type Person } from "./model";
import type { ContactsStore } from "./store";

export async function seedDemo(store: ContactsStore): Promise<void> {
  const p = (over: Partial<Person>): Person => ({ ...emptyPerson(), ...over });
  await store.saveMany([
    p({ given: "Ana", family: "Example", company: "Fablab Example", title: "Lab manager", emails: [{ value: "ana@example.org", type: "work" }], phones: [{ value: "+32 470 00 00 01", type: "mobile" }], labels: ["Makers", "Brussels"], starred: true, birthday: "--05-14" }),
    p({ given: "Ben", family: "Sample", company: "Example Guild", title: "Woodworking lead", emails: [{ value: "ben@example.org", type: "work" }], labels: ["Makers"] }),
    p({ given: "Chloé", family: "Placeholder", company: "Example Foundation", title: "Programme officer", linkedin: "https://www.linkedin.com/in/chloe-placeholder/", labels: ["Funders"], source: "linkedin" }),
    p({ given: "Dan", family: "Demo", phones: [{ value: "0470 00 00 02", type: "mobile" }], emails: [{ value: "dan@example.net", type: "home" }], addresses: [{ street: "Example street 1", city: "Brussels", region: "", postcode: "1000", country: "Belgium", type: "home" }] }),
    p({ given: "Dan", family: "Demo", emails: [{ value: "d.demo@example.com", type: "work" }], company: "Example Co" }),
    p({ name: "Eve Invented", emails: [{ value: "eve@example.org", type: "home" }], labels: ["Fix My MedTech"] }),
  ]);
}
