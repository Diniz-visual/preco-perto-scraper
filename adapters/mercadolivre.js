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

const BASE_URL = 'https://www.mercadolivre.com.br/';

async function applyCep(page, cep) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2500);
  await acceptCookies(page);

  await safeClick(page, [
    'button:has-text("Informe seu CEP")',
    'button:has-text("CEP")',
    'a:has-text("Informe seu CEP")',
    'a:has-text("CEP")',
    '[class*="nav-menu-cp"]',
    '[class*="zipcode"]',
    '[class*="postal"]',
    '[data-testid*="zip"]'
  ], 9000);

  await sleep(1800);

  const filled = await safeFill(page, [
    'input[name="zipcode"]',
    'input[name="cep"]',
    'input[placeholder*="CEP"]',
    'input[aria-label*="CEP"]',
    'input[inputmode="numeric"]',
    'input[type="tel"]',
    'input[type="text"]'
  ], cep, 10000);

  if (!filled) return false;

  await safePress(page, [
    'input[name="zipcode"]',
    'input[name="cep"]',
    'input[placeholder*="CEP"]',
    'input[aria-label*="CEP"]',
    'input[inputmode="numeric"]',
    'input[type="tel"]',
    'input[type="text"]'
  ], 'Enter', 3000);

  await safeClick(page, [
    'button:has-text("Usar")',
    'button:has-text("Confirmar")',
    'button:has-text("Salvar")',
    'button:has-text("Continuar")',
    'button[type="submit"]'
  ], 8000);

  await sleep(4000);

  const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  const formatted = cep.slice(0, 5) + '-' + cep.slice(5);

  return bodyText.includes(cep) || bodyText.includes(formatted) || /cep|frete|envio/i.test(bodyText);
}

async function openSearch(page, query) {
  const encoded = encodeURIComponent(query).replace(/%20/g, '-');

  await page.goto(`https://lista.mercadolivre.com.br/${encoded}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  await sleep(4500);

  return true;
}

async function extractProducts(page, query, cep, site, sameProductVariant) {
  const items = [];
  const cards = page.locator('.ui-search-result, li.ui-search-layout__item, [class*="ui-search"]');
  const count = Math.min(await cards.count(), 30);

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
      '.ui-search-item__title',
      'h2',
      'a'
    ]) || fullText.split('\n')[0];

    if (!sameProductVariant(query, `${name} ${fullText}`)) continue;

    const prices = pricesFromText(fullText);
    if (!prices.length) continue;

    const price = prices[0];
    const unitPrice = null;

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

  return items;
}

async function scrape({ page, cep, query, site, sameProductVariant }) {
  const cepApplied = await applyCep(page, cep).catch(() => false);
  await openSearch(page, query);

  const items = await extractProducts(page, query, cep, site, sameProductVariant);

  return {
    success: true,
    message: `${items.length} produto(s) no Mercado Livre. CEP aplicado: ${cepApplied ? 'sim' : 'não confirmado'}.`,
    items
  };
}

module.exports = { scrape };