const cheerio = require("cheerio");

const {
  fetchText,
  makeItem,
  productMatchesQuery,
  parsePrice
} = require("./helpers");

function absoluteUrl(baseUrl, value) {
  if (!value) return "";

  const raw = String(value).trim();

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }

  if (raw.startsWith("//")) {
    return "https:" + raw;
  }

  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return "";
  }
}

function getFirstImage($, card, baseUrl) {
  const img =
    card.find("img").first().attr("src") ||
    card.find("img").first().attr("data-src") ||
    card.find("img").first().attr("data-lazy") ||
    card.find("img").first().attr("data-original") ||
    "";

  return absoluteUrl(baseUrl, img);
}

function getFirstHref($, card, baseUrl) {
  const href = card.find("a").first().attr("href") || "";
  return absoluteUrl(baseUrl, href);
}

function getName($, card) {
  const selectors = [
    "[class*='product-name']",
    "[class*='productName']",
    "[class*='product_title']",
    "[class*='product-title']",
    "[class*='item-name']",
    "[class*='name']",
    "[class*='title']",
    "h1",
    "h2",
    "h3",
    "a"
  ];

  for (const selector of selectors) {
    const text = card.find(selector).first().text().trim();

    if (text && text.length >= 3 && text.length <= 160) {
      return text.replace(/\s+/g, " ");
    }
  }

  const alt = card.find("img").first().attr("alt") || "";

  if (alt && alt.length >= 3) {
    return alt.replace(/\s+/g, " ");
  }

  return "";
}

function getPrice($, card) {
  const selectors = [
    "[class*='price']",
    "[class*='Price']",
    "[class*='valor']",
    "[class*='preco']",
    "[data-price]"
  ];

  for (const selector of selectors) {
    const value =
      card.find(selector).first().attr("data-price") ||
      card.find(selector).first().text().trim();

    const price = parsePrice(value);

    if (price) {
      return price;
    }
  }

  const text = card.text();
  const matches = text.match(/R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}|R\$\s?\d+,\d{2}/g) || [];

  for (const match of matches) {
    const price = parsePrice(match);

    if (price) {
      return price;
    }
  }

  return null;
}

function getOldPrice($, card, price) {
  const text = card.text();
  const matches = text.match(/R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}|R\$\s?\d+,\d{2}/g) || [];

  const prices = matches
    .map((match) => parsePrice(match))
    .filter(Boolean)
    .sort((a, b) => b - a);

  const oldPrice = prices.find((value) => value > price);

  return oldPrice || null;
}

async function scrapeGenericWeb({
  site,
  cep,
  query,
  baseUrl,
  searchUrl,
  cardSelectors = []
}) {
  const finalUrl = searchUrl.replace("{query}", encodeURIComponent(query)).replace("{cep}", encodeURIComponent(cep));

  const result = await fetchText(finalUrl, {
    timeout: 30000
  });

  if (!result.success || !result.text) {
    return {
      success: false,
      market: site.name,
      message: `${site.name} não respondeu.`,
      items: []
    };
  }

  const $ = cheerio.load(result.text);
  const items = [];
  const selectors = [
    ...cardSelectors,
    "[data-testid*='product']",
    "[class*='product-card']",
    "[class*='productCard']",
    "[class*='ProductCard']",
    "[class*='product-item']",
    "[class*='productItem']",
    "[class*='shelf-item']",
    "[class*='item-product']",
    "[class*='produto']",
    "article",
    "li"
  ];

  const seen = new Set();

  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const card = $(el);
      const rawText = card.text().replace(/\s+/g, " ").trim();

      if (!rawText || rawText.length < 8) {
        return;
      }

      const name = getName($, card);

      if (!name || !productMatchesQuery(name, query)) {
        return;
      }

      const price = getPrice($, card);

      if (!price) {
        return;
      }

      const key = `${name.toLowerCase()}|${price}`;

      if (seen.has(key)) {
        return;
      }

      seen.add(key);

      const oldPrice = getOldPrice($, card, price);
      const image = getFirstImage($, card, baseUrl);
      const sourceUrl = getFirstHref($, card, baseUrl) || finalUrl;

      const item = makeItem({
        name,
        market: site.name,
        segment: site.segment,
        city: "Belo Horizonte",
        cep,
        price,
        old_price: oldPrice,
        image,
        source_url: sourceUrl,
        source_site: site.name,
        search_query: query
      });

      if (item) {
        items.push(item);
      }
    });

    if (items.length >= 8) {
      break;
    }
  }

  return {
    success: true,
    market: site.name,
    message: `${items.length} produto(s) em ${site.name}.`,
    items: items.slice(0, 8)
  };
}

module.exports = {
  scrapeGenericWeb
};
