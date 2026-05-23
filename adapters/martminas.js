const { scrapeGenericWeb } = require("./generic-web");

module.exports = {
  async scrape({ cep, query, site }) {
    return scrapeGenericWeb({
      site,
      cep,
      query,
      baseUrl: "https://www.martminas.com.br",
      searchUrl: "https://www.martminas.com.br/?s={query}",
      cardSelectors: [
        ".produto",
        ".product",
        ".card",
        ".item"
      ]
    });
  }
};
