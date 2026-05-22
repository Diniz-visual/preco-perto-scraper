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

function formatCep(cep) {
  const clean = String(cep || '').replace(/\D+/g, '');
  return clean.length === 8 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : clean;
}

function extractPrices(text) {
  const values = [...String(text || '').matchAll(/R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/g)]
    .map((match) => match[0])
    .map((value) => {
      return Number(
        value
          .replace(/[^\d,\.]/g, '')
          .replace(/\./g, '')
          .replace(',', '.')
      );
    })
    .filter((value) => value > 0);

  return [...new Set(values)].sort((a, b) => a - b);
}

async function getBodyText(page, timeout = 5000) {
  return page.locator('body').innerText({ timeout }).catch(() => '');
}

async function applyCep(page, cep) {
  const cleanCep = String(cep || '').replace(/\D+/g, '');
  const formattedCep = formatCep(cleanCep);

  console.log('[ATACADAO] Abrindo site');

  await page.goto(BASE_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 35000
  });

  await sleep(2500);
  await acceptCookies(page);

  console.log('[ATACADAO] Tentando abrir área de CEP');

  const opened = await safeClick(page, [
    'button:has-text("CEP")',
    'button:has-text("Entregue")',
    'button:has-text("Entrega")',
    'button:has-text("Alterar")',
    'button:has-text("Editar")',
    'button:has-text("Informe")',
    'a:has-text("CEP")',
    'a:has-text("Entregue")',
    'a:has-text("Alterar")',
    '[aria-label*="CEP"]',
    '[aria-label*="cep"]',
    '[aria-label*="endereço"]',
    '[aria-label*="Endereço"]',
    '[class*="delivery"]',
    '[class*="Delivery"]',
    '[class*="location"]',
    '[class*="Location"]',
    '[class*="zipcode"]',
    '[class*="cep"]',
    '[data-testid*="cep"]',
    '[data-testid*="zipcode"]',
    '[data-testid*="delivery"]',
    '[data-testid*="location"]'
  ], 4000);

  console.log('[ATACADAO] Área de CEP aberta:', opened ? 'sim' : 'não');

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
  ], cleanCep, 5000);

  if (!filled) {
    console.log('[ATACADAO] Input de CEP não encontrado. Preço não será capturado.');
    return false;
  }

  await sleep(700);

  await safePress(page, [
    'input[name="cep"]',
    'input[name="zipcode"]',
    'input[name="postalCode"]',
    'input[placeholder*="CEP"]',
    'input[placeholder*="cep"]',
    'input[aria-label*="CEP"]',
    'input[aria-label*="cep"]',
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
  ], 4500);

  await sleep(3500);

  await safeClick(page, [
    'button:has-text("Selecionar loja")',
    'button:has-text("Escolher loja")',
    'button:has-text("Retirar nesta loja")',
    'button:has-text("Comprar nessa loja")',
    'button:has-text("Continuar")',
    'button:has-text("Confirmar")'
  ], 4000);

  await sleep(4000);

  const bodyText = await getBodyText(page, 7000);

  const confirmed =
    bodyText.includes(cleanCep) ||
    bodyText.includes(formattedCep);

  console.log('[ATACADAO] CEP aplicado confirmado:', confirmed ? 'sim' : 'não');

  return confirmed;
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

      await sleep(4500);

      const bodyText = await getBodyText(page, 7000);

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
  console.log('[ATACADAO] Procurando produto correto');

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

    if (!count) {
      continue;
    }

    console.log(`[ATACADAO] Selector ${selector}: ${count} cards`);

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);

      let fullText = '';

      try {
        fullText = await card.innerText({ timeout: 1200 });
      } catch (error) {
        continue;
      }

      if (!fullText || !sameProductVariant(query, fullText)) {
        continue;
      }

      const href = await attrFirst(card, ['a'], 'href', 1200);

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
      ], 1200) || fullText.split('\n')[0];

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
    'section:has-text("R$")'
  ];

  for (const selector of selectors) {
    try {
      const locators = page.locator(selector);
      const count = Math.min(await locators.count(), 12);

      for (let i = 0; i < count; i++) {
        const el = locators.nth(i);

        const text = await el.innerText({ timeout: 1200 }).catch(() => '');

        if (!text || !text.includes('R$')) {
          continue;
        }

        const prices = extractPrices(text);

        if (prices.length) {
          return text;
        }
      }
    } catch (error) {}
  }

  return '';
}

function pickPriceFromBlock(text) {
  const prices = extractPrices(text);

  if (!prices.length) {
    return {
      price: 0,
      oldPrice: null
    };
  }

  const unique = [...new Set(prices)].sort((a, b) => a - b);

  const price = unique[0];
  const oldPrice = unique.length >= 2 ? unique[unique.length - 1] : null;

  return {
    price,
    oldPrice: oldPrice && oldPrice > price ? oldPrice : null
  };
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

  const bodyText = await getBodyText(page, 9000);

  if (!bodyText || bodyText.length < 100) {
    console.log('[ATACADAO] Página de detalhe vazia');
    return null;
  }

  if (!sameProductVariant(query, `${title} ${bodyText}`)) {
    console.log('[ATACADAO] Produto do detalhe não bate com a busca:', title);
    return null;
  }

  const priceBlockText = await getPriceBlockText(page);

  if (!priceBlockText) {
    console.log('[ATACADAO] Bloco de preço confiável não encontrado');
    return null;
  }

  console.log('[ATACADAO] Bloco de preço:', priceBlockText.replace(/\s+/g, ' ').slice(0, 300));

  const { price, oldPrice } = pickPriceFromBlock(priceBlockText);

  if (!price) {
    console.log('[ATACADAO] Preço válido não encontrado');
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
    console.log('[ATACADAO] Cancelado: CEP não foi aplicado/confirmado.');

    return {
      success: false,
      message: 'Atacadão ignorado: CEP não foi aplicado/confirmado. Nenhum preço foi salvo para evitar divergência.',
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
    message: '1 produto no Atacadão com preço confiável e CEP confirmado.',
    items: [detailItem]
  };
}

module.exports = { scrape };
