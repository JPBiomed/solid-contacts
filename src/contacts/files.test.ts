import { describe, expect, it } from "vitest";
import { emptyPerson } from "./model";
import { parseContactsCsv, parseContactsFile, parseVcards, toGoogleCsv, toVcards } from "./files";

const VCF = [
  "BEGIN:VCARD", "VERSION:3.0", "FN:Élodie Martin", "N:Martin;Élodie;;;",
  "EMAIL;TYPE=INTERNET;TYPE=WORK:elodie@fablab.example", "EMAIL;TYPE=INTERNET;TYPE=HOME:elodie@gmail.com",
  "TEL;TYPE=CELL:+32 475 12 34 56", "item1.TEL:02 555 00 00", "item1.X-ABLabel:Partner",
  "ADR;TYPE=WORK:;;Rue X 1;Brussels;;1000;Belgium", "ORG:Fablab Brussels;Workshop", "TITLE:Lab manager",
  "BDAY:1990-05-14", "item2.URL:https\\://www.linkedin.com/in/Elodie-Martin/",
  "NOTE:Met at the maker faire\\, 2024.", "CATEGORIES:myContacts,starred,Fix My MedTech", "END:VCARD",
  "BEGIN:VCARD", "VERSION:2.1", "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Dupr=C3=A9;Jean;;;", "TEL;CELL:0475/99.88.77", "END:VCARD",
].join("\r\n");

describe("vCard in", () => {
  it("reads Google's and Apple's exports, kinds included", () => {
    const [a, b] = parseVcards(VCF);
    expect(a).toMatchObject({
      given: "Élodie", family: "Martin", company: "Fablab Brussels", department: "Workshop", title: "Lab manager",
      emails: [{ value: "elodie@fablab.example", type: "work" }, { value: "elodie@gmail.com", type: "home" }],
      phones: [{ value: "+32 475 12 34 56", type: "mobile" }, { value: "02 555 00 00", type: "partner" }],
      addresses: [{ street: "Rue X 1", city: "Brussels", postcode: "1000", country: "Belgium", type: "work" }],
      birthday: "1990-05-14", linkedin: "https://www.linkedin.com/in/elodie-martin/", websites: [],
      labels: ["Fix My MedTech"], starred: true, note: "Met at the maker faire, 2024.",
    });
    expect(b).toMatchObject({ given: "Jean", family: "Dupré" });
  });
});

describe("CSV in", () => {
  it("reads Google's CSV with labels, kinds and several values per cell", () => {
    const csv = [
      "First Name,Last Name,Organization Name,Organization Title,Labels,E-mail 1 - Label,E-mail 1 - Value,Phone 1 - Label,Phone 1 - Value,Address 1 - Label,Address 1 - City,Address 1 - Country,Birthday,Notes",
      'Ben,Sample,Guild,Lead,* myContacts ::: Makers ::: * starred,* Work,ben@guild.example ::: ben@home.example,Mobile,+32 2 555 00 00,Home,Gent,Belgium,--03-02,"Hi, there"',
    ].join("\n");
    const [p] = parseContactsCsv(csv);
    expect(p).toMatchObject({
      given: "Ben", family: "Sample", company: "Guild", title: "Lead", labels: ["Makers"], starred: true,
      emails: [{ value: "ben@guild.example", type: "work" }, { value: "ben@home.example", type: "work" }],
      phones: [{ value: "+32 2 555 00 00", type: "mobile" }],
      addresses: [{ city: "Gent", country: "Belgium", type: "home" }], birthday: "--03-02", note: "Hi, there",
    });
  });

  it("reads Outlook's CSV", () => {
    const outlook = "First Name,Last Name,E-mail Address,Company,Job Title,Mobile Phone,Business Phone\nDan,Out,dan@o.example,Acme,CTO,0470 00 00 00,02 000 00 00";
    expect(parseContactsCsv(outlook)[0]).toMatchObject({ given: "Dan", emails: [{ value: "dan@o.example" }], company: "Acme", phones: [{ type: "mobile" }, { type: "work" }] });
  });
});

describe("export", () => {
  const people = parseVcards(VCF);
  it("writes vCards that read back the same", () => {
    const back = parseContactsFile(toVcards(people));
    expect(back.map(({ source, ...p }) => p)).toEqual(people.map(({ source, ...p }) => p));
  });

  it("writes Google CSV that reads back the same", () => {
    const back = parseContactsFile(toGoogleCsv(people));
    expect(back[0]).toMatchObject({ given: "Élodie", family: "Martin", labels: ["Fix My MedTech"], starred: true, emails: people[0].emails, birthday: "1990-05-14" });
  });

  it("keeps commas and line breaks in a CSV cell", () => {
    const csv = toGoogleCsv([{ ...emptyPerson(), given: "A", note: 'line 1\nline "2", end' }]);
    expect(parseContactsCsv(csv)[0].note).toBe('line 1\nline "2", end');
  });
});
