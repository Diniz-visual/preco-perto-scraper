const { scrapeGenericWeb } = require("./generic-web");

module.exports = {
  async scrape({ cep, query, site }) {
    return scrapeGenericWeb({
      site,
      cep,
      query,
      baseUrl: "https://www.assai.com.br",
      searchUrl: "https://www.assai.com.br/busca?search={query}",
      cardSelectors: [
        ".produto",
        ".product",
        ".card",
        ".item"
      ]
    });
  }
};
