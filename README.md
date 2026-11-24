# Contacts

An address book in your own Solid pod, modelled on Google Contacts: one clean
list of everyone you know, gathered from your phone, LinkedIn, your Google
accounts and contact files. Data stays in your pod under `<pod>/contacts/`,
in vCard terms other Solid apps can read. The Maps of Making CRM
(JPBiomed/solid-crm) is to read people from here (not wired yet).

Built from [solid-kit](https://github.com/nicolasdb/solid-kit), via
solid-crm. The kit's own guidance is in CLAUDE.md and docs/.

## What it does

From Google Contacts:

- **List** sorted by first or last name with letter headings, starred people
  first, search as you type (names, emails, companies, notes, phone digits).
- **Contact card** with one-tap Call, Text, Email, WhatsApp and LinkedIn, and
  every detail: several emails, phones and addresses each with its kind,
  birthday, websites, notes.
- **Create and edit** with Google's fields: name parts, nickname, company,
  job title, department, emails, phones, addresses, birthday, links, labels.
- **Labels** in the side menu, with counts. Create, rename, delete; add or
  remove them for many people at once.
- **Star** people (favourites).
- **Select several** to star, label, export or delete them together.
- **Merge & fix**: people who look like the same person, merged in one tap
  or all at once, with undo.
- **Import** from Google accounts (as many as you have, personal and work,
  with labels and Other contacts), the phone's own contacts (Chrome on
  Android), .vcf and .csv files, and the CRM. Everyone ticked; the same
  person across sources becomes one; existing people only gain what's missing.
- **Export** everyone, starred, a label or the selection, as vCard or Google CSV.
- **Trash** kept for 30 days, with restore.
- **Share** a contact as a vCard from the phone's share menu.

For capture on the move:

- Install it on Android from Chrome (menu, Install app). It then appears in
  the **share menu**: share a LinkedIn profile, an email address or a phone
  number from any app and the new-contact form opens, filled in.
- iPhone: a Shortcut does the same (steps in Settings). Computer: a bookmarklet.

Not yet: contact photos, change history, birthday reminders, writing back to Google.

## Run it

```bash
npm install
npm run dev            # http://localhost:5173, sign in with your pod
open http://localhost:5173/?demo   # invented sample people, nothing saved
npm run verify         # typecheck, tests, design audit
```

## Deploy

Static files. Cloudflare: build command `npm run build`, deploy command
`npx wrangler deploy` (`wrangler.jsonc` is included). Or the kit's own
`make vps-deploy`. Then, for Google import, add the address to your Google
client's Authorized JavaScript origins (Settings has the steps).

| Path | What |
|---|---|
| `src/contacts/model.ts` | a person and its RDF |
| `src/contacts/store.ts` | reading and writing the pod |
| `src/contacts/dedupe.ts` | finding and merging duplicates |
| `src/contacts/files.ts` | vCard and CSV in and out |
| `src/contacts/google.ts` | Google People API in the browser |
| `src/contacts/phone.ts` | the phone's Contact Picker |
| `src/contacts/capture.ts` | share menu, Shortcut, bookmarklet |
| `src/contacts/plan.ts` | what an import does |
| `src/contacts/views/` | the screens |
| `docs/data-model.md` | the pod layout |
