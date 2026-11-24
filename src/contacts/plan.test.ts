import { describe, expect, it } from "vitest";
import { emptyPerson, type Person } from "./model";
import { importWrites, planImport, type Source } from "./plan";

const p = (over: Partial<Person>): Person => ({ ...emptyPerson(), ...over });
const opts = { prefixLabels: true, includeOther: true };

describe("import plan", () => {
  const existing = [p({ id: "x#jane", given: "Jane", family: "Doe", emails: [{ value: "jane@x.example", type: "work" }] })];
  const home: Source = {
    id: "google:me@gmail.com", name: "me@gmail.com", kind: "google", label: "personal",
    people: [
      p({ given: "Jane", family: "Doe", emails: [{ value: "jane@x.example", type: "work" }], labels: ["Friends"], externalIds: ["g:1"] }),
      p({ given: "Ana", emails: [{ value: "ana@x.example", type: "home" }], labels: ["Other contacts"] }),
    ],
  };
  const work: Source = {
    id: "google:me@mom.org", name: "me@mom.org", kind: "google", label: "mom",
    people: [p({ given: "Ana", family: "Example", emails: [{ value: "ana@x.example", type: "work" }], labels: ["Partners"] })],
  };

  it("joins the same person across accounts, keeping where each label came from", () => {
    const rows = planImport([home, work], existing, opts);
    expect(rows).toHaveLength(2);
    const ana = rows.find((r) => r.person.given === "Ana")!;
    expect(ana.status).toBe("new");
    expect(ana.sources.sort()).toEqual(["google:me@gmail.com", "google:me@mom.org"]);
    expect(ana.person.labels.sort()).toEqual(["mom", "mom/Partners", "personal"].sort());
    const jane = rows.find((r) => r.person.given === "Jane")!;
    expect(jane.status).toBe("update");
    expect(jane.adds).toEqual(["2 labels"]);
  });

  it("leaves Other contacts out when asked", () => {
    expect(planImport([home], existing, { ...opts, includeOther: false })).toHaveLength(1);
  });

  it("saves new people and merges into existing ones", () => {
    const rows = planImport([home, work], existing, opts);
    const w = importWrites(rows, new Set(), new Set());
    expect(w.created).toBe(1);
    expect(w.updated).toBe(1);
    const jane = w.people.find((x) => x.id === "x#jane")!;
    expect(jane.externalIds).toEqual(["g:1"]);
    expect(jane.labels).toEqual(["personal/Friends", "personal"]);
  });
});
