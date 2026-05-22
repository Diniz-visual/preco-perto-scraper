function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePrice(value) {
  const cleaned = String(value || '')
    .replace(/[^\d,\.]/g, '')
    .trim();

  if (!cleaned) return 0;

  if (cleaned.includes(',') && cleaned.includes('.')) {
    return Number(cleaned.replace(/\./g, '').replace(',', '.'));
  }

  if (cleaned.includes(',')) {
    return Number(cleaned.replace(',', '.'));
  }

  return Number(cleaned);
}

function extractVariant(name) {
  const n = normalizeText(name);

  const variants = {
    manga: 'Manga',
    goiaba: 'Goiaba',
    uva: 'Uva',
    laranja: 'Laranja',
    limao: 'Limão',
    morango: 'Morango',
    maracuja: 'Maracujá',
    abacaxi: 'Abacaxi',
    acerola: 'Acerola',
    cola: 'Cola',
    zero: 'Zero',
    tradicional: 'Tradicional'
  };

  for (const [key, value] of Object.entries(variants)) {
    if (n.includes(key)) return value;
  }

  return '';
}

function extractBrand(name) {
  const n = normalizeText(name);

  const brands = {
    tang: 'Tang',
    coca: 'Coca-Cola',
    pepsi: 'Pepsi',
    omo: 'OMO',
    ype: 'Ypê',
    ypê: 'Ypê',
    dorflex: 'Dorflex',
    colgate: 'Colgate',
    dove: 'Dove',
    rexona: 'Rexona',
    pantene: 'Pantene',
    heineken: 'Heineken',
    brahma: 'Brahma',
    skol: 'Skol',
    sadia: 'Sadia',
    seara: 'Seara'
  };

  for (const [key, value] of Object.entries(brands)) {
    if (n.includes(key)) return value;
  }

  return '';
}

function extractPackageSize(text) {
  const match = String(text || '').match(/\b\d+([,.]\d+)?\s?(kg|g|mg|ml|l|lt|un|und|caps|cp)\b/i);
  return match ? match[0] : '';
}

function absoluteUrl(url, baseUrl) {
  if (!url) return '';

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  try {
    return new URL(url, baseUrl).toString();
  } catch (e) {
    return '';
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * IMPORTANTE:
 * Timeout aqui é GLOBAL, não por seletor.
 * Isso evita travar 120s tentando um monte de selector.
 */
async function safeClick(pageOrLocator, selectors, totalTimeout = 3000) {
  const startedAt = Date.now();
  const perSelectorTimeout = 450;

  for (const selector of selectors) {
    const elapsed = Date.now() - startedAt;

    if (elapsed >= totalTimeout) {
      return false;
    }

    try {
      const el = pageOrLocator.locator(selector).first();
      await el.waitFor({
        state: 'visible',
        timeout: Math.min(perSelectorTimeout, totalTimeout - elapsed)
      });

      await el.click({
        timeout: Math.min(perSelectorTimeout, totalTimeout - elapsed)
      });

      return true;
    } catch (e) {}
  }

  return false;
}

async function safeFill(pageOrLocator, selectors, value, totalTimeout = 3000) {
  const startedAt = Date.now();
  const perSelectorTimeout = 450;

  for (const selector of selectors) {
    const elapsed = Date.now() - startedAt;

    if (elapsed >= totalTimeout) {
      return false;
    }

    try {
      const el = pageOrLocator.locator(selector).first();
      await el.waitFor({
        state: 'visible',
        timeout: Math.min(perSelectorTimeout, totalTimeout - elapsed)
      });

      await el.fill(value, {
        timeout: Math.min(perSelectorTimeout, totalTimeout - elapsed)
      });

      return true;
    } catch (e) {}
  }

  return false;
}

async function safePress(pageOrLocator, selectors, key = 'Enter', totalTimeout = 2000) {
  const startedAt = Date.now();
  const perSelectorTimeout = 350;

  for (const selector of selectors) {
    const elapsed = Date.now() - startedAt;

    if (elapsed >= totalTimeout) {
      return false;
    }

    try {
      const el = pageOrLocator.locator(selector).first();
      await el.waitFor({
        state: 'visible',
        timeout: Math.min(perSelectorTimeout, totalTimeout - elapsed)
      });

      await el.press(key, {
        timeout: Math.min(perSelectorTimeout, totalTimeout - elapsed)
      });

      return true;
    } catch (e) {}
  }

  return false;
}

async function textFirst(locator, selectors, totalTimeout = 1200) {
  const startedAt = Date.now();
  const perSelectorTimeout = 300;

  for (const selector of selectors) {
    const elapsed = Date.now() - startedAt;

    if (elapsed >= totalTimeout) {
      return '';
    }

    try {
      const el = locator.locator(selector).first();
      const text = await el.innerText({
        timeout: Math.min(perSelectorTimeout, totalTimeout - elapsed)
      });

      if (text && text.trim()) return text.trim();
    } catch (e) {}
  }

  return '';
}

async function attrFirst(locator, selectors, attr, totalTimeout = 1200) {
  const startedAt = Date.now();
  const perSelectorTimeout = 300;

  for (const selector of selectors) {
    const elapsed = Date.now() - startedAt;

    if (elapsed >= totalTimeout) {
      return '';
    }

    try {
      const el = locator.locator(selector).first();
      const value = await el.getAttribute(attr, {
        timeout: Math.min(perSelectorTimeout, totalTimeout - elapsed)
      });

      if (value && value.trim()) return value.trim();
    } catch (e) {}
  }

  return '';
}

async function acceptCookies(page) {
  await safeClick(page, [
    '#onetrust-accept-btn-handler',
    'button:has-text("Aceitar")',
    'button:has-text("Aceito")',
    'button:has-text("Entendi")',
    'button:has-text("Permitir")',
    'button:has-text("Continuar")',
    '[data-testid*="cookie"] button',
    '[class*="cookie"] button'
  ], 2500);
}

function pricesFromText(text) {
  const values = [...String(text || '').matchAll(/R\$\s*\d+[,.]\d{2}/g)].map((m) => m[0]);
  return values.map(parsePrice).filter((v) => v > 0);
}

function promoInfoFromText(text) {
  const full = String(text || '');

  let promoDescription = '';
  let promoMinQty = null;

  const match = full.match(/a partir de\s+(\d+)\s+unid/i);

  if (match) {
    promoMinQty = Number(match[1]);
    promoDescription = `A partir de ${promoMinQty} unid.`;
  }

  return {
    promoDescription,
    promoMinQty
  };
}

function buildItem({
  name,
  fullText,
  price,
  unitPrice = null,
  image = '',
  sourceUrl = '',
  site,
  cep,
  city = 'Belo Horizonte'
}) {
  const promo = promoInfoFromText(fullText);
  const oldPrice = unitPrice && unitPrice > price ? unitPrice : null;

  return {
    name,
    brand: extractBrand(name),
    package_size: extractPackageSize(`${name} ${fullText}`),
    variant: extractVariant(name),
    category: 'Produto',
    market: site.market || site.name,
    segment: site.segment || 'supermercado',
    city,
    cep,
    price,
    unit_price: unitPrice,
    promo_min_qty: promo.promoMinQty,
    promo_description: promo.promoDescription,
    old_price: oldPrice,
    is_promotion: Boolean(promo.promoDescription || oldPrice),
    discount_percent: null,
    image,
    source_url: sourceUrl,
    source_site: site.name || site.market
  };
}

module.exports = {
  normalizeText,
  parsePrice,
  extractVariant,
  extractBrand,
  extractPackageSize,
  absoluteUrl,
  sleep,
  safeClick,
  safeFill,
  safePress,
  textFirst,
  attrFirst,
  acceptCookies,
  pricesFromText,
  promoInfoFromText,
  buildItem
};
