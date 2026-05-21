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
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2500);
  await acceptCookies(page);

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
  ], 9000);

  await sleep(1800);

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
  ], cep, 10000);

  if (!filled) return false;

  await sleep(700);

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
  ], 'Enter', 3000);

  await safeClick(page, [
    'button:has-text("Confirmar")',
    'button:has-text("Continuar")',
    'button:has-text("Aplicar")',
    'button:has-text("Salvar")',
    'button:has-text("Buscar")',
    'button:has-text("Usar este endereço")',
    'button:has-text("Selecionar")',
    'button[type="submit"]'
  ], 8000);

  await sleep(2500);

  await safeClick(page, [
    'button:has-text("Selecionar loja")',
    'button:has-text("Escolher loja")',
    'button:has-text("Retirar nesta loja")',
    'button:has-text("Comprar nessa loja")',
    'button:has-text("Continuar")',
    'button:has-text("Confirmar")'
  ], 5000);

  await sleep(5000);

  const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  const formatted = cep.slice(0, 5) + '-' + cep.slice(5);

  return bodyText.includes(cep) || bodyText.includes(formatted) || /entreg|cep/i.test(bodyText);
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
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(4500);

      const count = await page.locator('article, li, a, [class*="product"], [data-testid*="product"]').count();

      if (count > 0) return true;
    } catch (e) {}
  }

  const filled = await safeFill(page, [
    'input[type="search"]',
    'input[placeholder*="Buscar"]',
    'input[placeholder*="busca"]',
    'input[name="q"]',
    'input[name="search"]'
  ], query, 8000);

  if (!filled) return false;

  await safePress(page, [
    'input[type="search"]',
    'input[placeholder*="Buscar"]',
    'input[placeholder*="busca"]',
    'input[name="q"]',
    'input[name="search"]'
  ], 'Enter', 3000);

  await sleep(4500);
  return true;
}

async function extractProducts(page, query, cep, site, sameProductVariant) {
  const items = [];

  const selectors = [
    '[data-testid*="product"]',
    '[class*="product-card"]',
    '[class*="ProductCard"]',
    '[class*="shelf-item"]',
    '[class*="item-product"]',
    'article',
    'li'
  ];

  for (const selector of selectors) {
    const cards = page.locator(selector);
    const count = Math.min(await cards.count(), 35);

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      let fullText = '';

      try {
        fullText = await card.innerText({ timeout: 1600 });
      } catch (e) {
        continue;
      }

      if (!fullText || !sameProductVariant(query, fullText)) continue;

      const name = await textFirst(card, [
        '[class*="name"]',
        '[class*="title"]',
        '[data-testid*="name"]',
        '[data-testid*="title"]',
        'h2',
        'h3',
        'a'
      ]) || fullText.split('\n')[0];

      if (!sameProductVariant(query, `${name} ${fullText}`)) continue;

      const prices = pricesFromText(fullText);
      if (!prices.length) continue;

      const price = Math.min(...prices);
      const unitPrice = prices.length >= 2 ? Math.max(...prices) : null;

      const image = await attrFirst(card, ['img'], 'src') || await attrFirst(card, ['img'], 'data-src');
      const href = await attrFirst(card, ['a'], 'href');

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

    if (items.length) break;
  }

  return items;
}

async function scrape({ page, cep, query, site, sameProductVariant }) {
  const cepApplied = await applyCep(page, cep).catch(() => false);
  const searched = await openSearch(page, query);

  if (!searched) {
    return {
      success: false,
      message: 'Não foi possível buscar no Atacadão.',
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