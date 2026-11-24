/**
 * The vocabularies this app writes. vCard first (W3C's RDF mapping of vCard
 * 4, the one SolidOS Contacts and most Solid apps read), schema.org and
 * Dublin Core for the rest. The app's own `sc:` namespace only holds what no
 * standard vocabulary says (starred, in the trash) — and terms in it are only
 * ever added, never renamed: documents on the pod carry these IRIs.
 *
 * The shape of each record is in docs/data-model.md.
 */
export const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
export const RDFS_LABEL = "http://www.w3.org/2000/01/rdf-schema#label";

const ns = (base: string) => (term: string) => base + term;

export const VCARD = ns("http://www.w3.org/2006/vcard/ns#");
export const SCHEMA = ns("https://schema.org/");
export const DCT = ns("http://purl.org/dc/terms/");

/** Not dereferenceable yet; IRIs are only compared. */
export const SC = ns("https://w3id.org/solid-contacts/vocab#");
