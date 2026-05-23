const { scrapeGenericWeb } = require("./generic-web");

module.exports = {
  async scrape({ cep, query, site }) {
    return scrapeGenericWeb({
      site,
      cep,
      query,
      baseUrl: "https://www.apoioentrega.com",
      searchUrl: "https://www.apoioentrega.com/busca?termo={query}",
      cardSelectors: [
        ".product",
        ".product-card",
        "[class*='product']",
        "[class*='produto']"
      ]
    });
  }
};
