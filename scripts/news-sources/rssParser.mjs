import { XMLParser } from "fast-xml-parser";

// Handles the three feed shapes in the wild: RSS 2.0 (<rss><channel><item>),
// RDF/RSS 1.0 (<rdf:RDF><item> at the top level — what several Japanese
// publishers still emit), and Atom (<feed><entry>).
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Feeds are inconsistent about wrapping text in CDATA; letting the
  // parser strip it keeps downstream code from having to care.
  cdataPropName: false,
  trimValues: true,
});

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

// Feed values can arrive as a bare string, a number, or an object with
// #text plus attributes, depending on the publisher.
function text(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && "#text" in value) return String(value["#text"]);
  return "";
}

function stripHtml(value) {
  return text(value)
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(value) {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function atomLink(entry) {
  // Atom puts the URL in an attribute, and often lists several <link>s;
  // rel="alternate" (or a link with no rel at all) is the article itself.
  const links = asArray(entry.link);
  const alternate =
    links.find((l) => l?.["@_rel"] === "alternate") ??
    links.find((l) => typeof l === "object" && !l?.["@_rel"]) ??
    links[0];
  if (!alternate) return "";
  if (typeof alternate === "string") return alternate;
  return alternate["@_href"] ?? text(alternate);
}

function normalizeItem(item, { isAtom }) {
  const link = isAtom ? atomLink(item) : text(item.link);
  const title = stripHtml(item.title);
  const body = stripHtml(
    item.description ?? item.summary ?? item["content:encoded"] ?? item.content ?? ""
  );
  const published =
    parseDate(item.pubDate) ??
    parseDate(item.published) ??
    parseDate(item.updated) ??
    parseDate(item["dc:date"]);

  // Prefer the publisher's own stable id (RSS <guid>, Atom <id>); the
  // link is a reasonable stand-in and is what most Japanese feeds
  // effectively key on anyway.
  const guid = text(item.guid) || text(item.id) || link;

  return {
    externalRef: guid,
    title,
    body,
    url: link,
    publishedAt: published,
  };
}

export function parseFeed(xml) {
  const doc = parser.parse(xml);

  if (doc.rss?.channel) {
    return asArray(doc.rss.channel.item).map((i) => normalizeItem(i, { isAtom: false }));
  }
  if (doc["rdf:RDF"]) {
    return asArray(doc["rdf:RDF"].item).map((i) => normalizeItem(i, { isAtom: false }));
  }
  if (doc.feed) {
    return asArray(doc.feed.entry).map((i) => normalizeItem(i, { isAtom: true }));
  }

  throw new Error("Unrecognized feed format (expected RSS 2.0, RDF/RSS 1.0 or Atom)");
}

export async function fetchFeed(url, { timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "prediction-market-dao/0.1 (news sync)" },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return parseFeed(await res.text());
  } finally {
    clearTimeout(timer);
  }
}
