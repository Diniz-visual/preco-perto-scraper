const { scrapeGenericWeb } = require("./generic-web");

module.exports = {
  async scrape({ cep, query, site }) {
    return scrapeGenericWeb({
      site,
      cep,
      query,
      baseUrl: "https://www.drogaraia.com.br",
      searchUrl: "https://www.drogaraia.com.br/search?w={query}",
      cardSelectors: [
        ".product",
        ".product-card",
        "[class*='product']",
        "[data-testid*='product']"
      ]
    });
  }
};
