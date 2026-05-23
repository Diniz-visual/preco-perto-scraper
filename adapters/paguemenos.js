const { scrapeGenericWeb } = require("./generic-web");

module.exports = {
  async scrape({ cep, query, site }) {
    return scrapeGenericWeb({
      site,
      cep,
      query,
      baseUrl: "https://www.paguemenos.com.br",
      searchUrl: "https://www.paguemenos.com.br/search?q={query}",
      cardSelectors: [
        ".product",
        ".product-card",
        "[class*='product']",
        "[data-testid*='product']"
      ]
    });
  }
};
