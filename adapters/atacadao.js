const {
  absoluteUrl,
  sleep,
  safeClick,
  safeFill,
  safePress,
  acceptCookies,
  textFirst,
  attrFirst,
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

function parsePriceBR(value) {
  const cleaned = String(value || '')
    .replace(/[^\d,\.]/g, '')
    .trim();

  if (!cleaned) return 0;

  return Number(
    cleaned
      .replace(/\./g, '')
      .replace(',', '.')
  );
}

function extractPriceCandidatesFromText(text) {
  const full = String(text || '');
  const regex = /R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/g;
  const matches = [...full.matchAll(regex)];

  return matches
    .map((match) => {
      const raw = match[0];
      const index = match.index || 0;
      const before = full.slice(Math.max(0, index - 90), index).toLowerCase();
      const after = full.slice(index, index + 120).toLowerCase();
      const context = `${before} ${after}`;

      const value = parsePriceBR(raw);

      const isReference =
        context.includes('/kg') ||
        context.includes('por kg') ||
        context.includes('cada kg') ||
        context.includes('kg') ||
        context.includes('/un') ||
        context.includes('cada') ||
        context.includes('preço por');

      return {
        raw,
        value,
        context,
        isReference
      };
    })
    .filter((item) => item.value > 0);
}

function extractPackageMultiplier(text) {
  const source = String(text || '').toLowerCase();

  const kgMatch = source.match(/\b(\d+(?:[,.]\d+)?)\s?kg\b/i);

  if (kgMatch) {
    return Number(kgMatch[1].replace(',', '.'));
  }

  const gMatch = source.match(/\b(\d+(?:[,.]\d+)?)\s?g\b/i);

  if (gMatch) {
    const grams = Number(gMatch[1].replace(',', '.'));

    if (grams > 0) {
      return grams / 1000;
    }
  }

  const mlMatch = source.match(/\b(\d+(?:[,.]\d+)?)\s?ml\b/i);

  if (mlMatch) {
    const ml = Number(mlMatch[1].replace(',', '.'));

    if (ml > 0) {
      return ml / 1000;
    }
  }

  const lMatch = source.match(/\b(\d+(?:[,.]\d+)?)\s?l\b/i);

  if (lMatch) {
    return Number(lMatch[1].replace(',', '.'));
  }

  return 1;
}

function pickMainPriceFromText(text, productName = '') {
  const candidates = extractPriceCandidatesFromText(text);

  if (!candidates.length) {
    return {
      price: 0,
      oldPrice: null,
      unitPrice: null
    };
  }

  const multiplier = extractPackageMultiplier(`${productName} ${text}`);

  const uniqueValues = [...new Set(candidates.map((item) => item.value))]
    .filter((value) => value > 0)
    .sort((a, b) => a - b);

  const referenceValues = [...new Set(
    candidates
      .filter((item) => item.isReference)
      .map((item) => item.value)
  )].sort((a, b) => a - b);

  const nonReferenceValues = [...new Set(
    candidates
      .filter((item) => !item.isReference)
      .map((item) => item.value)
  )].sort((a, b) => a - b);

  let price = 0;
  let unitPrice = null;
  let oldPrice = null;

  /*
   * Exemplo arroz 5kg:
   * Se a página mostra R$ 3,59/kg, o preço final estimado é 3,59 x 5 = 17,95.
   * Isso evita salvar preço por kg como preço do pacote.
   */
  if (multiplier > 1 && referenceValues.length) {
    const calculated = Number((referenceValues[0] * multiplier).toFixed(2));

    if (calculated > referenceValues[0]) {
      price = calculated;
      unitPrice = referenceValues[0];
    }
  }

  /*
   * Se existir preço final explícito, usa o menor preço não-referência.
   * Porém, não troca por valor muito maior se já calculou um preço por peso coerente.
   */
  if (!price && nonReferenceValues.length) {
    price = nonReferenceValues[0];
  }

  /*
   * Fallback para páginas sem contexto claro.
   */
  if (!price) {
    if (uniqueValues.length >= 2 && multiplier > 1) {
      const calculated = Number((uniqueValues[0] * multiplier).toFixed(2));

      if (calculated > uniqueValues[0]) {
        price = calculated;
        unitPrice = uniqueValues[0];
      } else {
        price = uniqueValues[0];
      }
    } else {
      price = uniqueValues[0];
    }
  }

  const possibleOldPrices = uniqueValues.filter((value) => value > price);

  if (possibleOldPrices.length) {
    oldPrice = possibleOldPrices[possibleOldPrices.length - 1];
  }

  return {
    price,
    oldPrice,
    unitPrice
  };
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

      if (bodyText && /R\$|\d+,\d{2}|produto|resultados/i.test(bodyText)) {
        console.log('[ATACADAO] Página de busca carregada');
        return true;
      }
    } catch (error) {
      console.log('[ATACADAO] Falha na URL:', url, error.message);
    }
  }

  return false;
}

async function findBestProductLink(page, query, sameProductVariant) {
  console.log('[ATACADAO] Procurando link do produto correto');

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
    const cards = page.locator(selector);
    const count = Math.min(await cards.count(), 30);

    if (!count) continue;

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

      const href = await attrFirst(card, ['a'], 'href', 1000);

      if (!href) {
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

      const url = absoluteUrl(href, BASE_URL);

      console.log('[ATACADAO] Produto escolhido:', name);
      console.log('[ATACADAO] URL produto:', url);

      return {
        name,
        url,
        searchText: fullText
      };
    }
  }

  return null;
}

async function extractProductDetail(page, product, query, cep, site, sameProductVariant) {
  console.log('[ATACADAO] Abrindo detalhe do produto');

  await page.goto(product.url, {
    waitUntil: 'domcontentloaded',
    timeout: 45000
  });

  await sleep(4500);

  const bodyText = await page.locator('body').innerText({ timeout: 10000 }).catch(() => '');

  if (!bodyText || bodyText.length < 100) {
    console.log('[ATACADAO] Página de detalhe vazia.');
    return null;
  }

  const title = await textFirst(page, [
    'h1',
    '[data-testid*="title"]',
    '[class*="title"]',
    '[class*="name"]'
  ], 2000) || product.name;

  if (!sameProductVariant(query, `${title} ${bodyText}`)) {
    console.log('[ATACADAO] Detalhe não bate com a busca:', title);
    return null;
  }

  const { price, oldPrice, unitPrice } = pickMainPriceFromText(bodyText, title);

  if (!price) {
    console.log('[ATACADAO] Nenhum preço encontrado no detalhe.');
    return null;
  }

  const image =
    await attrFirst(page, ['img'], 'src', 1000) ||
    await attrFirst(page, ['img'], 'data-src', 1000);

  const item = buildItem({
    name: title,
    fullText: bodyText,
    price,
    unitPrice,
    image: absoluteUrl(image, BASE_URL),
    sourceUrl: product.url,
    site,
    cep
  });

  if (oldPrice) {
    item.old_price = oldPrice;
    item.unit_price = unitPrice;
    item.is_promotion = true;
    item.discount_percent = Math.round(((oldPrice - price) / oldPrice) * 100);
  }

  console.log('[ATACADAO] Preço detalhe:', price);
  console.log('[ATACADAO] Preço referência/kg:', unitPrice || 'não encontrado');
  console.log('[ATACADAO] Preço antigo detalhe:', oldPrice || 'não encontrado');

  return item;
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

  const product = await findBestProductLink(page, query, sameProductVariant);

  if (!product) {
    return {
      success: true,
      message: `Nenhum produto compatível encontrado no Atacadão. CEP aplicado: ${cepApplied ? 'sim' : 'não confirmado'}.`,
      items: []
    };
  }

  const detailItem = await extractProductDetail(page, product, query, cep, site, sameProductVariant);

  if (!detailItem) {
    return {
      success: true,
      message: `Produto encontrado, mas não foi possível ler o preço do detalhe. CEP aplicado: ${cepApplied ? 'sim' : 'não confirmado'}.`,
      items: []
    };
  }

  return {
    success: true,
    message: `1 produto no Atacadão com preço da página de detalhe. CEP aplicado: ${cepApplied ? 'sim' : 'não confirmado'}.`,
    items: [detailItem]
  };
}

module.exports = { scrape };
