const {
  absoluteUrl,
  sleep,
  safeClick,
  safeFill,
  safePress,
  acceptCookies,
  textFirst,
  attrFirst,
  pricesFromText,
  buildItem
} = require('./utils');

const BASE_URL = 'https://www.atacadao.com.br/';

async function blockHeavyResources(page) {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const type = request.resourceType();
    const url = request.url();

    if (
      ['font', 'media'].includes(type) ||
      url.includes('googletagmanager') ||
      url.includes('google-analytics') ||
      url.includes('facebook') ||
      url.includes('doubleclick') ||
      url.includes('hotjar') ||
      url.includes('clarity')
    ) {
      return route.abort().catch(() => {});
    }

    return route.continue().catch(() => {});
  });
}

async function applyCep(page, cep) {
  console.log('[ATACADAO] Abrindo site');

  await page.goto(BASE_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 35000
  });

  await sleep(1800);
  await acceptCookies(page);

  console.log('[ATACADAO] Tentando abrir seletor de CEP');

  await safeClick(page, [
    'button:has-text("CEP")',
    'button:has-text("Entregue")',
    'button:has-text("Entrega")',
    'button:has-text("Alterar")',
    'button:has-text("Editar")',
    'a:has-text("CEP")',
    'a:has-text("Entregue")',
    '[aria-label*="CEP"]',
    '[aria-label*="cep"]',
    '[class*="delivery"]',
    '[class*="Delivery"]',
    '[class*="location"]',
    '[class*="Location"]',
    '[class*="cep"]',
    '[data-testid*="cep"]',
    '[data-testid*="delivery"]',
    '[data-testid*="location"]'
  ], 2500);

  await sleep(800);

  console.log('[ATACADAO] Tentando preencher CEP');

  const filled = await safeFill(page, [
    'input[name="cep"]',
    'input[name="zipcode"]',
    'input[name="postalCode"]',
    'input[placeholder*="CEP"]',
    'input[placeholder*="cep"]',
    'input[aria-label*="CEP"]',
    'input[aria-label*="cep"]',
    'input[inputmode="numeric"]',
    'input[type="tel"]'
  ], cep, 2500);

  if (!filled) {
    console.log('[ATACADAO] Input de CEP não encontrado. Continuando para busca.');
    return false;
  }

  await sleep(500);

  await safePress(page, [
    'input[name="cep"]',
    'input[name="zipcode"]',
    'input[name="postalCode"]',
    'input[placeholder*="CEP"]',
    'input[placeholder*="cep"]',
    'input[aria-label*="CEP"]',
    'input[inputmode="numeric"]',
    'input[type="tel"]'
  ], 'Enter', 1500);

  await safeClick(page, [
    'button:has-text("Confirmar")',
    'button:has-text("Continuar")',
    'button:has-text("Aplicar")',
    'button:has-text("Salvar")',
    'button:has-text("Buscar")',
    'button:has-text("Usar este endereço")',
    'button:has-text("Selecionar")',
    'button[type="submit"]'
  ], 2500);

  await sleep(1800);

  await safeClick(page, [
    'button:has-text("Selecionar loja")',
    'button:has-text("Escolher loja")',
    'button:has-text("Retirar nesta loja")',
    'button:has-text("Comprar nessa loja")',
    'button:has-text("Continuar")',
    'button:has-text("Confirmar")'
  ], 2000);

  await sleep(1600);

  const bodyText = await page.locator('body').innerText({ timeout: 2500 }).catch(() => '');
  const formatted = cep.slice(0, 5) + '-' + cep.slice(5);

  const ok =
    bodyText.includes(cep) ||
    bodyText.includes(formatted) ||
    /entreg|cep|loja|retirada/i.test(bodyText);

  console.log('[ATACADAO] CEP aplicado:', ok ? 'sim/provável' : 'não confirmado');

  return ok;
}

async function openSearch(page, query) {
  const encoded = encodeURIComponent(query);

  const urls = [
    `https://www.atacadao.com.br/s?q=${encoded}`,
    `https://www.atacadao.com.br/busca?termo=${encoded}`,
    `https://www.atacadao.com.br/search?text=${encoded}`
  ];

  for (const url of urls) {
    try {
      console.log('[ATACADAO] Buscando em:', url);

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 35000
      });

      await sleep(3500);

      const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');

      if (bodyText && /R\$|\d+,\d{2}|produto|resultados|tang/i.test(bodyText)) {
        console.log('[ATACADAO] Página de busca carregada');
        return true;
      }
    } catch (error) {
      console.log('[ATACADAO] Falha na URL:', url, error.message);
    }
  }

  console.log('[ATACADAO] Tentando busca pelo input');

  const filled = await safeFill(page, [
    'input[type="search"]',
    'input[placeholder*="Buscar"]',
    'input[placeholder*="busca"]',
    'input[name="q"]',
    'input[name="search"]'
  ], query, 2500);

  if (!filled) {
    console.log('[ATACADAO] Input de busca não encontrado');
    return false;
  }

  await safePress(page, [
    'input[type="search"]',
    'input[placeholder*="Buscar"]',
    'input[placeholder*="busca"]',
    'input[name="q"]',
    'input[name="search"]'
  ], 'Enter', 1500);

  await sleep(3500);

  return true;
}

async function extractProducts(page, query, cep, site, sameProductVariant) {
  const items = [];

  console.log('[ATACADAO] Extraindo produtos');

  const bodyText = await page.locator('body').innerText({ timeout: 8000 }).catch(() => '');

  if (!bodyText || bodyText.length < 100) {
    console.log('[ATACADAO] Body vazio ou pequeno.');
    return [];
  }

  console.log('[ATACADAO] Body length:', bodyText.length);

  const selectors = [
    '[data-testid*="product"]',
    '[class*="product-card"]',
    '[class*="ProductCard"]',
    '[class*="shelf-item"]',
    '[class*="item-product"]',
    '[class*="product"]',
    '[class*="Product"]',
    'article',
    'li',
    'a'
  ];

  for (const selector of selectors) {
    try {
      const cards = page.locator(selector);
      const count = Math.min(await cards.count(), 35);

      if (!count) {
        continue;
      }

      console.log(`[ATACADAO] Selector ${selector}: ${count} cards`);

      for (let i = 0; i < count; i++) {
        const card = cards.nth(i);

        let fullText = '';

        try {
          fullText = await card.innerText({ timeout: 800 });
        } catch (error) {
          continue;
        }

        if (!fullText || !sameProductVariant(query, fullText)) {
          continue;
        }

        const prices = pricesFromText(fullText);

        if (!prices.length) {
          continue;
        }

        const name = await textFirst(card, [
          '[class*="name"]',
          '[class*="title"]',
          '[data-testid*="name"]',
          '[data-testid*="title"]',
          'h2',
          'h3',
          'a'
        ], 800) || fullText.split('\n')[0];

        if (!sameProductVariant(query, `${name} ${fullText}`)) {
          continue;
        }

        const price = Math.min(...prices);
        const unitPrice = prices.length >= 2 ? Math.max(...prices) : null;

        const image =
          await attrFirst(card, ['img'], 'src', 800) ||
          await attrFirst(card, ['img'], 'data-src', 800);

        const href = await attrFirst(card, ['a'], 'href', 800);

        items.push(buildItem({
          name,
          fullText,
          price,
          unitPrice,
          image: absoluteUrl(image, BASE_URL),
          sourceUrl: absoluteUrl(href, BASE_URL),
          site,
          cep
        }));
      }

      if (items.length) {
        break;
      }
    } catch (error) {
      console.log('[ATACADAO] Erro ao extrair selector:', selector, error.message);
    }
  }

  console.log('[ATACADAO] Itens extraídos:', items.length);

  return items;
}

async function scrape({ page, cep, query, site, sameProductVariant }) {
  await blockHeavyResources(page);

  let cepApplied = false;

  try {
    cepApplied = await applyCep(page, cep);
  } catch (error) {
    console.log('[ATACADAO] Erro ao aplicar CEP:', error.message);
  }

  const searched = await openSearch(page, query);

  if (!searched) {
    return {
      success: false,
      message: `Não foi possível buscar no Atacadão. CEP aplicado: ${cepApplied ? 'sim' : 'não confirmado'}.`,
      items: []
    };
  }

  const items = await extractProducts(page, query, cep, site, sameProductVariant);

  return {
    success: true,
    message: `${items.length} produto(s) no Atacadão. CEP aplicado: ${cepApplied ? 'sim' : 'não confirmado'}.`,
    items
  };
}

module.exports = { scrape };
