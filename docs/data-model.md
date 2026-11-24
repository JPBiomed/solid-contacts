# Contacts data model

Everything lives in your pod under `<pod root>/contacts/`:

| Document | Holds |
|---|---|
| `people.ttl` | everyone, trash included |
| `settings.ttl` | `#settings`: sort order and the Google client ID |

Prefixes: `vcard:` http://www.w3.org/2006/vcard/ns#, `schema:` https://schema.org/,
`dct:` http://purl.org/dc/terms/, `rdfs:` http://www.w3.org/2000/01/rdf-schema#,
`sc:` https://w3id.org/solid-contacts/vocab# (this app's own terms, only for
what no standard vocabulary says; only ever added, never renamed).

## Person

A person is `people.ttl#<id>`, typed `vcard:Individual` and `schema:Person`.
Each email, phone and address is a Thing of its own at `#<id>-e0`, `-t0`,
`-a0`…, as vCard in RDF and SolidOS Contacts write them, so other Solid apps
read these people as they are. Saving a person replaces all of `#<id>` and
`#<id>-*`.

| Field | Predicate | Notes |
|---|---|---|
| display name | `vcard:fn` | composed from the parts when there are any |
| name parts | `vcard:honorific-prefix`, `given-name`, `additional-name`, `family-name`, `honorific-suffix` | |
| nickname | `vcard:nickname` | |
| company, job title, department | `vcard:organization-name`, `vcard:title`, `vcard:organization-unit` | plain text: organizations as records belong to the CRM |
| emails | `vcard:hasEmail` → `#<id>-eN` with `vcard:value <mailto:…>` | |
| phones | `vcard:hasTelephone` → `#<id>-tN` with `vcard:value <tel:…>` and `sc:asTyped` (as typed, spaces kept) | |
| addresses | `vcard:hasAddress` → `#<id>-aN` with `vcard:street-address`, `locality`, `region`, `postal-code`, `country-name` | |
| kind of email/phone/address | `rdf:type` `vcard:Home` / `Work` / `Cell` (mobile) / `Pref` (main) / `Fax` / `Other`; anything else as `rdfs:label` ("partner") | |
| birthday | `vcard:bday` | `YYYY-MM-DD`, or `--MM-DD` without the year |
| websites | `vcard:url` | |
| LinkedIn | `schema:sameAs` | normalized `https://www.linkedin.com/in/<slug>/` |
| labels | `vcard:category` | as typed. An import can prefix them with where they came from: `personal/Friends` |
| note | `vcard:note` | |
| starred | `sc:starred` true | |
| in the trash | `sc:trashedAt` (xsd:dateTime) | removed for good after 30 days, when the app opens |
| source | `dct:source` | `manual`, `google`, `linkedin`, `phone`, `file`, `crm` |
| ids elsewhere | `schema:identifier` | `google:<account>:people/c123`, `crm:<CRM contact IRI>`: an import recognises someone it brought in before |

Every person carries `dct:created` and `dct:modified`.

## Duplicates

Two people are the same when they share an email (Gmail's dots, `+tags` and
googlemail.com ignored), a phone (last nine digits), a LinkedIn profile or an
id elsewhere. The same full name (two words or more) only makes a suggestion
in Merge & fix, or a question during an import. Merging only adds; the card
with the most details is kept.

## Links into the app

Hash routes: `#/`, `#/label/<name>`, `#/person/<id>`, `#/person/<id>/edit`,
`#/new`, `#/merge`, `#/import`, `#/export?ids=a,b`, `#/trash`, `#/settings`.

`#/new` takes `name`, `text` (any shared text; a LinkedIn address in it is
found), `linkedin`, `email`, `phone`, `company`, `role`, `note`, `label`,
`source`. Someone already in Contacts (same email, phone or LinkedIn) opens
instead. Android's share menu opens `/share-target?title=&text=&url=`, which
`main.ts` turns into that route.
