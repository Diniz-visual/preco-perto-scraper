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

async function applyCep(page, cep) {
  console.log('[ATACADAO] Abrindo site');

  await page.goto(BASE_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 25000
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
  ], 4000);

  await sleep(1000);

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
    'input[type="tel"]',
    'input[type="text"]'
  ], cep, 5000);

  if (!filled) {
    console.log('[ATACADAO] Input de CEP não encontrado');
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
    'input[type="tel"]',
    'input[type="text"]'
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
  ], 3500);

  await sleep(2500);

  await safeClick(page, [
    'button:has-text("Selecionar loja")',
    'button:has-text("Escolher loja")',
    'button:has-text("Retirar nesta loja")',
    'button:has-text("Comprar nessa loja")',
    'button:has-text("Continuar")',
    'button:has-text("Confirmar")'
  ], 2500);

  await sleep(2500);

  const bodyText = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
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
        timeout: 25000
      });

      await sleep(3000);

      const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');

      if (bodyText && /R\$|\d+,\d{2}|produto|resultados|tang/i.test(bodyText)) {
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
  ], query, 4000);

  if (!filled) {
    return false;
  }

  await safePress(page, [
    'input[type="search"]',
    'input[placeholder*="Buscar"]',
    'input[placeholder*="busca"]',
    'input[name="q"]',
    'input[name="search"]'
  ], 'Enter', 1500);

  await sleep(3000);

  return true;
}

async function extractProducts(page, query, cep, site, sameProductVariant) {
  const items = [];

  console.log('[ATACADAO] Extraindo produtos');

  const selectors = [
    '[data-testid*="product"]',
    '[class*="product-card"]',
    '[class*="ProductCard"]',
    '[class*="shelf-item"]',
    '[class*="item-product"]',
    '[class*="product"]',
    '[class*="Product"]',
    'article',
    'li'
  ];

  for (const selector of selectors) {
    let count = 0;

    try {
      const cards = page.locator(selector);
      count = Math.min(await cards.count(), 25);

      if (!count) {
        continue;
      }

      console.log(`[ATACADAO] Selector ${selector}: ${count} cards`);

      for (let i = 0; i < count; i++) {
        const card = cards.nth(i);
        let fullText = '';

        try {
          fullText = await card.innerText({ timeout: 1000 });
        } catch (error) {
          continue;
        }

        if (!fullText || !sameProductVariant(query, fullText)) {
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
        ], 1000) || fullText.split('\n')[0];

        if (!sameProductVariant(query, `${name} ${fullText}`)) {
          continue;
        }

        const prices = pricesFromText(fullText);

        if (!prices.length) {
          continue;
        }

        const price = Math.min(...prices);
        const unitPrice = prices.length >= 2 ? Math.max(...prices) : null;

        const image =
          await attrFirst(card, ['img'], 'src', 1000) ||
          await attrFirst(card, ['img'], 'data-src', 1000);

        const href = await attrFirst(card, ['a'], 'href', 1000);

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
