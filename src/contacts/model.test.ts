import { describe, expect, it } from "vitest";
import { createSolidDataset, setThing } from "@inrupt/solid-client";
import { belongsTo, datasetToPeople, displayName, emptyPerson, initials, matchesQuery, personToThings, whatsappNumber, type Person } from "./model";

const jane: Person = {
  ...emptyPerson(),
  id: "https://pod.example/contacts/people.ttl#jane",
  given: "Jane", family: "Doe", nickname: "JD", company: "Fablab", title: "Manager",
  emails: [{ value: "jane@work.example", type: "work" }, { value: "jane@gmail.com", type: "home" }],
  phones: [{ value: "+32 475 12 34 56", type: "mobile" }, { value: "02 555 00 00", type: "partner" }],
  addresses: [{ street: "Rue X 1", city: "Brussels", region: "", postcode: "1000", country: "Belgium", type: "work" }],
  birthday: "--05-14", websites: ["https://jane.example/"], linkedin: "https://www.linkedin.com/in/jane/",
  labels: ["Fix My MedTech", "personal/Friends"], note: "Met at the faire", starred: true,
  source: "google", externalIds: ["google:me@gmail.com:people/c1"],
};

describe("person ⇄ RDF", () => {
  it("round-trips every field, including the kind of each email and phone", () => {
    let ds = createSolidDataset();
    for (const t of personToThings(jane)) ds = setThing(ds, t);
    const [back] = datasetToPeople(ds);
    const { created, modified, ...rest } = back;
    expect(created).toBeInstanceOf(Date);
    expect(modified).toBeInstanceOf(Date);
    expect(rest).toEqual({ ...jane, name: "Jane Doe" });
  });

  it("knows which Things are a person's, and no one else's", () => {
    expect(belongsTo(`${jane.id}-e0`, jane.id)).toBe(true);
    expect(belongsTo(`${jane.id}2`, jane.id)).toBe(false);
    expect(belongsTo(`${jane.id}-e0x`, jane.id)).toBe(false);
  });
});

describe("display", () => {
  it("names someone by their parts, else what they have", () => {
    expect(displayName(jane)).toBe("Jane Doe");
    expect(displayName({ ...emptyPerson(), emails: [{ value: "a@b.c", type: "home" }] })).toBe("a@b.c");
    expect(initials(jane)).toBe("JD");
  });

  it("finds people by any word, and by phone digits however typed", () => {
    expect(matchesQuery(jane, "fablab jane")).toBe(true);
    expect(matchesQuery(jane, "475 1234")).toBe(true);
    expect(matchesQuery(jane, "nobody")).toBe(false);
  });

  it("only links WhatsApp for international numbers", () => {
    expect(whatsappNumber("+32 475 12 34 56")).toBe("32475123456");
    expect(whatsappNumber("0475 12 34 56")).toBe("");
  });
});
