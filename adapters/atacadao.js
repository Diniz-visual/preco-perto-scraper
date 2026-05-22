async function openSearch(page, query) {
  console.log('[ATACADAO] Tentando buscar pelo input real do site');

  const cleanQuery = String(query || '').trim();

  if (!cleanQuery) {
    return false;
  }

  /**
   * Primeiro tenta usar o campo real de busca do Atacadão.
   * No debug ele apareceu como:
   * placeholder="Pesquisa por produtos ou marcas"
   * aria="search"
   */
  let searchedByInput = await safeFill(page, [
    'input[placeholder="Pesquisa por produtos ou marcas"]',
    'input[placeholder*="Pesquisa por produtos"]',
    'input[placeholder*="produtos ou marcas"]',
    'input[aria-label="search"]',
    'input[aria-label*="search"]',
    'input[type="search"]',
    'input'
  ], cleanQuery, 7000);

  if (!searchedByInput) {
    console.log('[ATACADAO] Input não encontrado via Playwright. Tentando via evaluate.');

    searchedByInput = await page.evaluate((value) => {
      const inputs = Array.from(document.querySelectorAll('input'));

      const input = inputs.find((el) => {
        const placeholder = String(el.getAttribute('placeholder') || '').toLowerCase();
        const aria = String(el.getAttribute('aria-label') || '').toLowerCase();

        return (
          placeholder.includes('pesquisa por produtos') ||
          placeholder.includes('produtos ou marcas') ||
          aria.includes('search')
        );
      });

      if (!input) {
        return false;
      }

      input.focus();
      input.value = value;

      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      return true;
    }, cleanQuery).catch(() => false);
  }

  console.log('[ATACADAO] Busca preenchida:', searchedByInput ? 'sim' : 'não');

  if (searchedByInput) {
    await sleep(800);

    const pressed = await safePress(page, [
      'input[placeholder="Pesquisa por produtos ou marcas"]',
      'input[placeholder*="Pesquisa por produtos"]',
      'input[placeholder*="produtos ou marcas"]',
      'input[aria-label="search"]',
      'input[aria-label*="search"]',
      'input[type="search"]',
      'input'
    ], 'Enter', 3000);

    console.log('[ATACADAO] Enter na busca:', pressed ? 'sim' : 'não');

    if (!pressed) {
      console.log('[ATACADAO] Tentando clicar no botão Submit Search');

      await safeClick(page, [
        'button[aria-label="Submit Search"]',
        'button[aria-label*="Search"]',
        'button[type="submit"]'
      ], 3000);
    }

    await sleep(6500);

    const currentUrl = page.url();
    const bodyText = await getBodyText(page, 9000);

    console.log('[ATACADAO] URL após busca:', currentUrl);
    console.log('[ATACADAO] Body busca:', bodyText.slice(0, 500));

    if (
      bodyText &&
      (
        bodyText.toLowerCase().includes(cleanQuery.toLowerCase().split(' ')[0]) ||
        /produto|produtos encontrados|resultados|R\$|\d+,\d{2}/i.test(bodyText)
      )
    ) {
      console.log('[ATACADAO] Página de busca carregada via input');
      return true;
    }
  }

  /**
   * Fallback: URLs de busca.
   */
  const encoded = encodeURIComponent(cleanQuery);

  const urls = [
    `https://www.atacadao.com.br/s?q=${encoded}`,
    `https://www.atacadao.com.br/busca?termo=${encoded}`,
    `https://www.atacadao.com.br/search?text=${encoded}`,
    `https://www.atacadao.com.br/catalogo?q=${encoded}`
  ];

  for (const url of urls) {
    try {
      console.log('[ATACADAO] Fallback buscando em:', url);

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 35000
      });

      await sleep(5000);

      const bodyText = await getBodyText(page, 9000);

      console.log('[ATACADAO] Body fallback:', bodyText.slice(0, 400));

      if (
        bodyText &&
        (
          bodyText.toLowerCase().includes(cleanQuery.toLowerCase().split(' ')[0]) ||
          /produto|produtos encontrados|resultados|R\$|\d+,\d{2}/i.test(bodyText)
        )
      ) {
        console.log('[ATACADAO] Página de busca carregada via fallback');
        return true;
      }
    } catch (error) {
      console.log('[ATACADAO] Falha na URL:', url, error.message);
    }
  }

  console.log('[ATACADAO] Nenhuma busca carregou resultado válido.');

  return false;
}
