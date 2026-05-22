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

function extractPricesFromText(text) {
  const full = String(text || '');
  const regex = /R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/g;

  return [...full.matchAll(regex)]
    .map((match) => parsePriceBR(match[0]))
    .filter((value) => value > 0);
}

async function getVisibleText(page, selectors, timeout = 1500) {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();

      await locator.waitFor({
        state: 'visible',
        timeout
      });

      const text = await locator.innerText({
        timeout
      });

      if (text && text.trim()) {
        return text.trim();
      }
    } catch (error) {}
  }

  return '';
}

async function getPriceBlockText(page) {
  const selectors = [
    '[data-testid*="price"]',
    '[data-testid*="Price"]',
    '[class*="price"]',
    '[class*="Price"]',
    '[class*="valor"]',
    '[class*="Valor"]',
    '[class*="buybox"]',
    '[class*="BuyBox"]',
    '[class*="product-info"]',
    '[class*="ProductInfo"]',
    '[class*="summary"]',
    '[class*="Summary"]',
    'aside',
    'section:has-text("R$")',
    'div:has-text("R$")'
  ];

  for (const selector of selectors) {
    try {
      const locators = page.locator(selector);
      const count = Math.min(await locators.count(), 12);

      for (let i = 0; i < count; i++) {
        const el = locators.nth(i);

        const text = await el.innerText({
          timeout: 1200
        }).catch(() => '');

        if (!text || !text.includes('R$')) {
          continue;
        }

        const prices = extractPricesFromText(text);

        if (prices.length) {
          return text;
        }
      }
    } catch (error) {}
  }

  return '';
}

function pickPriceFromReliableBlock(text) {
  const prices = extractPricesFromText(text);

  if (!prices.length) {
    return {
      price: 0,
      oldPrice: null
    };
  }

  const unique = [...new Set(prices)].sort((a, b) => a - b);

  let price = unique[0];
  let oldPrice = null;

  if (unique.length >= 2) {
    oldPrice = unique[unique.length - 1];

    if (oldPrice <= price) {
      oldPrice = null;
    }
  }

  return {
    price,
    oldPrice
  };
}

async function applyCep(page, cep) {
  console.log('[ATACADAO] Abrindo site');

  await page.goto(BASE_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 35000
  });

  await sleep(2500);
  await acceptCookies(page);

  console.log('[ATACADAO] Tentando abrir seletor de CEP');

  const opened = await safeClick(page, [
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
  ], 3500);

  console.log('[ATACADAO] Seletor de CEP aberto:', opened ? 'sim' : 'não');

  await sleep(1200);

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
  ], cep, 4000);

  if (!filled) {
    console.log('[ATACADAO] Input de CEP não encontrado. Não é seguro capturar preço.');
    return false;
  }

  await sleep(600);

  await safePress(page, [
    'input[name="cep"]',
    'input[name="zipcode"]',
    'input[name="postalCode"]',
    'input[placeholder*="CEP"]',
    'input[placeholder*="cep"]',
    'input[aria-label*="CEP"]',
    'input[inputmode="numeric"]',
    'input[type="tel"]'
  ], 'Enter', 2000);

  await sleep(800);

  await safeClick(page, [
    'button:has-text("Confirmar")',
    'button:has-text("Continuar")',
    'button:has-text("Aplicar")',
    'button:has-text("Salvar")',
    'button:has-text("Buscar")',
    'button:has-text("Usar este endereço")',
    'button:has-text("Selecionar")',
    'button[type="submit"]'
  ], 4000);

  await sleep(2500);

  await safeClick(page, [
    'button:has-text("Selecionar loja")',
    'button:has-text("Escolher loja")',
    'button:has-text("Retirar nesta loja")',
    'button:has-text("Comprar nessa loja")',
    'button:has-text("Continuar")',
    'button:has-text("Confirmar")'
  ], 3500);

  await sleep(3500);

  const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  const formatted = cep.slice(0, 5) + '-' + cep.slice(5);

  const ok =
    bodyText.includes(cep) ||
    bodyText.includes(formatted);

  console.log('[ATACADAO] CEP aplicado confirmado:', ok ? 'sim' : 'não');

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

      await sleep(4000);

      const bodyText = await page.locator('body').innerText({ timeout: 6000 }).catch(() => '');

      if (bodyText && /produto|resultados|R\$|\d+,\d{2}/i.test(bodyText)) {
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
    const count = Math.min(await cards.count(), 35);

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

  await sleep(5000);

  const title = await textFirst(page, [
    'h1',
    '[data-testid*="title"]',
    '[class*="title"]',
    '[class*="name"]'
  ], 2500) || product.name;

  const bodyText = await page.locator('body').innerText({ timeout: 8000 }).catch(() => '');

  if (!bodyText || bodyText.length < 100) {
    console.log('[ATACADAO] Página de detalhe vazia.');
    return null;
  }

  if (!sameProductVariant(query, `${title} ${bodyText}`)) {
    console.log('[ATACADAO] Detalhe não bate com a busca:', title);
    return null;
  }

  const priceBlockText = await getPriceBlockText(page);

  if (!priceBlockText) {
    console.log('[ATACADAO] Bloco de preço confiável não encontrado.');
    return null;
  }

  console.log('[ATACADAO] Texto do bloco de preço:', priceBlockText.replace(/\s+/g, ' ').slice(0, 300));

  const { price, oldPrice } = pickPriceFromReliableBlock(priceBlockText);

  if (!price) {
    console.log('[ATACADAO] Nenhum preço válido encontrado no bloco confiável.');
    return null;
  }

  const image =
    await attrFirst(page, ['img'], 'src', 1000) ||
    await attrFirst(page, ['img'], 'data-src', 1000);

  const item = buildItem({
    name: title,
    fullText: priceBlockText,
    price,
    unitPrice: null,
    image: absoluteUrl(image, BASE_URL),
    sourceUrl: product.url,
    site,
    cep
  });

  if (oldPrice) {
    item.old_price = oldPrice;
    item.is_promotion = true;
    item.discount_percent = Math.round(((oldPrice - price) / oldPrice) * 100);
  }

  console.log('[ATACADAO] Preço final confiável:', price);
  console.log('[ATACADAO] Preço antigo confiável:', oldPrice || 'não encontrado');

  return item;
}

async function scrape({ page, cep, query, site, sameProductVariant }) {
  await blockHeavyResources(page);

  const cepApplied = await applyCep(page, cep).catch((error) => {
    console.log('[ATACADAO] Erro ao aplicar CEP:', error.message);
    return false;
  });

  if (!cepApplied) {
    return {
      success: false,
      message: 'Atacadão ignorado: não foi possível aplicar/confirmar o CEP. Para evitar preço errado, nada foi salvo.',
      items: []
    };
  }

  const searched = await openSearch(page, query);

  if (!searched) {
    return {
      success: false,
      message: 'Não foi possível buscar no Atacadão após aplicar o CEP.',
      items: []
    };
  }

  const product = await findBestProductLink(page, query, sameProductVariant);

  if (!product) {
    return {
      success: true,
      message: 'Nenhum produto compatível encontrado no Atacadão.',
      items: []
    };
  }

  const detailItem = await extractProductDetail(page, product, query, cep, site, sameProductVariant);

  if (!detailItem) {
    return {
      success: true,
      message: 'Produto encontrado, mas nenhum preço confiável foi capturado no detalhe.',
      items: []
    };
  }

  return {
    success: true,
    message: '1 produto no Atacadão com preço confiável da página de detalhe.',
    items: [detailItem]
  };
}

module.exports = { scrape };
