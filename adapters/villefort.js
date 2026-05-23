const { scrapeGenericWeb } = require("./generic-web");

module.exports = {
  async scrape({ cep, query, site }) {
    return scrapeGenericWeb({
      site,
      cep,
      query,
      baseUrl: "https://www.villefortentrega.com.br",
      searchUrl: "https://www.villefortentrega.com.br/busca?termo={query}",
      cardSelectors: [
        ".product",
        ".product-card",
        "[class*='product']",
        "[class*='produto']"
      ]
    });
  }
};
