// api.js : sources de données
// - Livres : Gutendex (Projet Gutenberg), secours Open Library
// - Harry Potter : PotterAPI (en, es, fr, it, pt, uk)
// Les réponses sont mises en cache en mémoire pour que la navigation soit rapide.

const GUTENDEX_URL = "https://gutendex.com/books/";
const OPENLIBRARY_URL = "https://openlibrary.org/search.json";
const POTTER_URL = "https://potterapi-fedeperin.vercel.app";
const POTTER_LANGS = ["en", "es", "fr", "it", "pt", "uk"];

// Codes à 3 lettres attendus par Open Library
const OL_LANG = {
  fr: "fre", en: "eng", es: "spa", pt: "por", de: "ger", it: "ita", uk: "ukr",
  nl: "dut", la: "lat", el: "gre", ru: "rus", zh: "chi", ja: "jpn", ar: "ara",
};

const cache = new Map();

async function cachedJson(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  cache.set(url, data);
  return data;
}

// ---------- Livres ----------

function findFormat(formats, prefix) {
  const key = Object.keys(formats).find((k) => k.startsWith(prefix));
  return key ? formats[key] : "";
}

function normalizeGutendex(b) {
  const f = b.formats || {};
  return {
    id: `gut-${b.id}`,
    title: b.title || "",
    authors: (b.authors || []).map((a) => a.name).join(", "),
    languages: b.languages || [],
    cover: f["image/jpeg"] || "",
    readUrl: findFormat(f, "text/html") || findFormat(f, "text/plain"),
    pages: null,
    source: "Gutenberg",
  };
}

function normalizeOpenLibrary(d) {
  const workId = (d.key || "").split("/").pop();
  return {
    id: `ol-${workId}`,
    title: d.title || "",
    authors: (d.author_name || []).join(", "),
    languages: (d.language || []).slice(0, 2),
    cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : "",
    readUrl: d.key ? `https://openlibrary.org${d.key}` : "",
    pages: d.number_of_pages_median || null,
    source: "Open Library",
  };
}

async function fetchGutendex(query, lang, page) {
  const params = new URLSearchParams();
  if (query) params.set("search", query);
  if (lang) params.set("languages", lang);
  if (page > 1) params.set("page", String(page));
  const data = await cachedJson(`${GUTENDEX_URL}?${params}`);
  return { books: data.results.map(normalizeGutendex), hasNext: Boolean(data.next) };
}

async function fetchOpenLibrary(query, lang, page) {
  const params = new URLSearchParams({
    q: query || "classics",
    limit: "20",
    page: String(page),
    fields: "key,title,author_name,cover_i,language,number_of_pages_median",
  });
  if (lang && OL_LANG[lang]) params.set("language", OL_LANG[lang]);
  const data = await cachedJson(`${OPENLIBRARY_URL}?${params}`);
  const seen = (page - 1) * 20 + data.docs.length;
  return { books: data.docs.map(normalizeOpenLibrary), hasNext: seen < data.numFound };
}

// Renvoie { books, hasNext, source }. Gutendex d'abord, puis Open Library.
async function searchBooks({ query = "", lang = "", page = 1 } = {}) {
  try {
    const result = await fetchGutendex(query, lang, page);
    return { ...result, source: "Gutenberg" };
  } catch (gutendexError) {
    console.warn("Gutendex indisponible, essai Open Library :", gutendexError);
    try {
      const result = await fetchOpenLibrary(query, lang, page);
      return { ...result, source: "Open Library" };
    } catch (olError) {
      console.error("Open Library indisponible :", olError);
      throw new Error("NO_SOURCE");
    }
  }
}

// ---------- Harry Potter (PotterAPI) ----------
// category : "books" | "characters" | "houses" | "spells"
// La liste complète est chargée une fois puis filtrée côté navigateur (rapide).

async function loadPotter(category, lang) {
  const useLang = POTTER_LANGS.includes(lang) ? lang : "en";
  const data = await cachedJson(`${POTTER_URL}/${useLang}/${category}`);
  return { items: Array.isArray(data) ? data : [], lang: useLang };
}
