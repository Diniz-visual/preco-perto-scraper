const { scrapeGenericWeb } = require("./generic-web");

module.exports = {
  async scrape({ cep, query, site }) {
    return scrapeGenericWeb({
      site,
      cep,
      query,
      baseUrl: "https://epa.com.br",
      searchUrl: "https://epa.com.br/?s={query}",
      cardSelectors: [
        ".produto",
        ".product",
        ".card",
        ".item"
      ]
    });
  }
};
