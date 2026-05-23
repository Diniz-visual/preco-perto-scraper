const { scrapeGenericWeb } = require("./generic-web");

module.exports = {
  async scrape({ cep, query, site }) {
    return scrapeGenericWeb({
      site,
      cep,
      query,
      baseUrl: "https://www.verdemar.com.br",
      searchUrl: "https://www.verdemar.com.br/busca?termo={query}",
      cardSelectors: [
        ".product",
        ".product-card",
        "[class*='product']",
        "[class*='produto']"
      ]
    });
  }
};
