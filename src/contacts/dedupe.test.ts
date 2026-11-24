import { describe, expect, it } from "vitest";
import { duplicateGroups, emailKey, mergePeople, PeopleIndex, phoneKey } from "./dedupe";
import { emptyPerson, type Person } from "./model";

const p = (over: Partial<Person>): Person => ({ ...emptyPerson(), ...over });

describe("dedupe", () => {
  it("treats Gmail's dots and +tags, and phone formats, as the same", () => {
    expect(emailKey("Jane.Doe+news@GoogleMail.com")).toBe("janedoe@gmail.com");
    expect(phoneKey("+32 475 12 34 56")).toBe(phoneKey("0475/12.34.56"));
  });

  it("groups people by shared email or phone, transitively, and by full name", () => {
    const a = p({ id: "a", given: "Jane", emails: [{ value: "jane@gmail.com", type: "home" }] });
    const b = p({ id: "b", given: "J", emails: [{ value: "j.ane@gmail.com", type: "home" }], phones: [{ value: "0475 12 34 56", type: "mobile" }] });
    const c = p({ id: "c", given: "Other", phones: [{ value: "+32 475 12 34 56", type: "mobile" }] });
    const d = p({ id: "d", given: "Ben", family: "Sample" });
    const e = p({ id: "e", given: "ben", family: "sample", emails: [{ value: "ben@x.example", type: "work" }] });
    const f = p({ id: "f", given: "Marc" });
    const g = p({ id: "g", given: "Marc" });
    const groups = duplicateGroups([a, b, c, d, e, f, g]).map((x) => x.map((y) => y.id).sort());
    expect(groups).toEqual([["a", "b", "c"], ["d", "e"]]);
  });

  it("merges by adding, never overwriting", () => {
    const into = p({ id: "a", given: "Jane", family: "Doe", company: "Mine", emails: [{ value: "jane@gmail.com", type: "home" }], labels: ["vip"] });
    const from = p({ id: "b", name: "jane@work.example", company: "Theirs", emails: [{ value: "j.ane@gmail.com", type: "home" }, { value: "jane@work.example", type: "work" }], labels: ["Makers"], starred: true });
    const m = mergePeople(into, from);
    expect(m).toMatchObject({ id: "a", given: "Jane", company: "Mine", labels: ["vip", "Makers"], starred: true });
    expect(m.emails.map((e) => e.value)).toEqual(["jane@gmail.com", "jane@work.example"]);
  });

  it("matches an import by id, email, LinkedIn or phone; a name alone is only a suggestion", () => {
    const known = p({ id: "a", given: "Jane", family: "Doe", emails: [{ value: "jane@x.example", type: "work" }], externalIds: ["google:me:people/c1"] });
    const index = new PeopleIndex([known]);
    expect(index.match(p({ externalIds: ["google:me:people/c1"] }))).toEqual({ person: known, byNameOnly: false });
    expect(index.match(p({ emails: [{ value: "JANE@x.example", type: "home" }] }))?.byNameOnly).toBe(false);
    expect(index.match(p({ given: "doe", family: "jane" }))?.byNameOnly).toBe(true);
    expect(index.match(p({ given: "Jane" }))).toBeNull();
  });
});
