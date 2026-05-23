const { scrapeGenericWeb } = require("./generic-web");

module.exports = {
  async scrape({ cep, query, site }) {
    return scrapeGenericWeb({
      site,
      cep,
      query,
      baseUrl: "https://www.supermercadosbh.com.br",
      searchUrl: "https://www.supermercadosbh.com.br/?s={query}",
      cardSelectors: [
        ".produto",
        ".product",
        ".card",
        ".item"
      ]
    });
  }
};
