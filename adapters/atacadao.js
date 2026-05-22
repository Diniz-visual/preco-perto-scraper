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

function formatCep(cep) {
  const clean = String(cep || '').replace(/\D+/g, '');
  return clean.length === 8 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : clean;
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

function extractPrices(text) {
  const values = [...String(text || '').matchAll(/R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/g)]
    .map((match) => parsePriceBR(match[0]))
    .filter((value) => value > 0);

  return [...new Set(values)].sort((a, b) => a - b);
}

async function getBodyText(page, timeout = 5000) {
  return page.locator('body').innerText({ timeout }).catch(() => '');
}

async function getModalDebug(page) {
  return page.evaluate(() => {
    function cleanText(value) {
      return String(value || '').replace(/\s+/g, ' ').trim();
    }

    const buttons = Array.from(document.querySelectorAll('button')).map((el, index) => ({
      index,
      text: cleanText(el.innerText || el.textContent),
      aria: el.getAttribute('aria-label'),
      title: el.getAttribute('title'),
      className: String(el.className || ''),
      id: el.id || ''
    }));

    const inputs = Array.from(document.querySelectorAll('input')).map((el, index) => ({
      index,
      type: el.getAttribute('type'),
      name: el.getAttribute('name'),
      placeholder: el.getAttribute('placeholder'),
      aria: el.getAttribute('aria-label'),
      inputmode: el.getAttribute('inputmode'),
      className: String(el.className || ''),
      id: el.id || ''
    }));

    const bodyText = cleanText(document.body.innerText).slice(0, 1000);

    return {
      bodyText,
      buttons,
      inputs
    };
  }).catch(() => null);
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

  console.log('[ATACADAO] Tentando abrir modal de localização via clique forçado');

  const openedByEvaluate = await page.evaluate(() => {
    function normalize(value) {
      return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));

    const target = buttons.find((el) => {
      const text = normalize(el.innerText || el.textContent);
      const title = normalize(el.getAttribute('title'));
      const aria = normalize(el.getAttribute('aria-label'));

      return (
        title.includes('abrir modal de regionalização') ||
        text.includes('informar localização') ||
        text.includes('informar localizacao') ||
        text.includes('escolha uma loja') ||
        text.includes('informe seu cep') ||
        aria.includes('cep') ||
        aria.includes('localização') ||
        aria.includes('localizacao')
      );
    });

    if (!target) {
      return false;
    }

    target.scrollIntoView({
      block: 'center',
      inline: 'center'
    });

    target.click();

    return true;
  }).catch(() => false);

  console.log('[ATACADAO] Clique forçado no modal:', openedByEvaluate ? 'sim' : 'não');

  if (!openedByEvaluate) {
    console.log('[ATACADAO] Não conseguiu clicar no botão de localização. Preço não será capturado.');
    return false;
  }

  await sleep(3500);

  const debugAfterOpen = await getModalDebug(page);

  if (debugAfterOpen) {
    console.log('[ATACADAO] Debug após abrir modal - inputs:', JSON.stringify(debugAfterOpen.inputs).slice(0, 1800));
    console.log('[ATACADAO] Debug após abrir modal - buttons:', JSON.stringify(debugAfterOpen.buttons).slice(0, 1800));
    console.log('[ATACADAO] Debug após abrir modal - body:', debugAfterOpen.bodyText.slice(0, 1000));
  }

  console.log('[ATACADAO] Tentando preencher CEP via Playwright');

  let filled = await safeFill(page, [
    'input[placeholder*="CEP"]',
    'input[placeholder*="cep"]',
    'input[aria-label*="CEP"]',
    'input[aria-label*="cep"]',
    'input[name="cep"]',
    'input[name="zipcode"]',
    'input[name="postalCode"]',
    'input[inputmode="numeric"]',
    'input[type="tel"]',
    'input[type="text"]',
    'div[role="dialog"] input',
    '[class*="modal"] input',
    '[class*="Modal"] input',
    '[class*="regional"] input',
    '[class*="Regional"] input'
  ], cleanCep, 9000);

  if (!filled) {
    console.log('[ATACADAO] Tentando preencher CEP via evaluate');

    filled = await page.evaluate((cepValue) => {
      const inputs = Array.from(document.querySelectorAll('input'));

      const input = inputs.find((el) => {
        const placeholder = String(el.getAttribute('placeholder') || '').toLowerCase();
        const aria = String(el.getAttribute('aria-label') || '').toLowerCase();
        const name = String(el.getAttribute('name') || '').toLowerCase();
        const type = String(el.getAttribute('type') || '').toLowerCase();

        return (
          placeholder.includes('cep') ||
          aria.includes('cep') ||
          name.includes('cep') ||
          name.includes('zip') ||
          type === 'tel' ||
          type === 'text'
        );
      });

      if (!input) {
        return false;
      }

      input.focus();
      input.value = cepValue;

      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      return true;
    }, cleanCep).catch(() => false);
  }

  console.log('[ATACADAO] CEP preenchido:', filled ? 'sim' : 'não');

  if (!filled) {
    console.log('[ATACADAO] Input de CEP não encontrado após abrir modal. Preço não será capturado.');
    return false;
  }

  await sleep(1200);

  console.log('[ATACADAO] Tentando confirmar CEP via clique forçado');

  const confirmedClick = await page.evaluate(() => {
    function normalize(value) {
      return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));

    const target = buttons.find((el) => {
      const text = normalize(el.innerText || el.textContent);
      const title = normalize(el.getAttribute('title'));
      const aria = normalize(el.getAttribute('aria-label'));

      return (
        text.includes('confirmar') ||
        text.includes('continuar') ||
        text.includes('aplicar') ||
        text.includes('salvar') ||
        text.includes('buscar') ||
        text.includes('usar este endereço') ||
        text.includes('usar este endereco') ||
        text.includes('selecionar') ||
        title.includes('confirmar') ||
        aria.includes('confirmar')
      );
    });

    if (!target) {
      return false;
    }

    target.scrollIntoView({
      block: 'center',
      inline: 'center'
    });

    target.click();

    return true;
  }).catch(() => false);

  console.log('[ATACADAO] Clique de confirmação:', confirmedClick ? 'sim' : 'não');

  await sleep(4500);

  console.log('[ATACADAO] Tentando selecionar loja, se aparecer');

  await page.evaluate(() => {
    function normalize(value) {
      return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));

    const target = buttons.find((el) => {
      const text = normalize(el.innerText || el.textContent);

      return (
        text.includes('selecionar loja') ||
        text.includes('escolher loja') ||
        text.includes('retirar nesta loja') ||
        text.includes('comprar nessa loja') ||
        text.includes('continuar') ||
        text.includes('confirmar')
      );
    });

    if (target) {
      target.scrollIntoView({
        block: 'center',
        inline: 'center'
      });

      target.click();

      return true;
    }

    return false;
  }).catch(() => false);

  await sleep(5000);

  const bodyText = await getBodyText(page, 9000);

  const confirmed =
    bodyText.includes(cleanCep) ||
    bodyText.includes(formattedCep) ||
    bodyText.toLowerCase().includes('para o cep') ||
    bodyText.toLowerCase().includes('entregue pela') ||
    bodyText.toLowerCase().includes('retirada');

  console.log('[ATACADAO] CEP aplicado confirmado:', confirmed ? 'sim' : 'não');

  if (!confirmed) {
    console.log('[ATACADAO] Body após tentativa de CEP:', bodyText.slice(0, 1200));
  }

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

  /*
   * Primeiro pega SOMENTE links reais de produto.
   * No Atacadão, produto costuma terminar com /p.
   */
  const links = page.locator('a[href*="/p"]');
  const count = Math.min(await links.count(), 50);

  console.log(`[ATACADAO] Links de produto encontrados: ${count}`);

  for (let i = 0; i < count; i++) {
    const link = links.nth(i);

    let href = '';
    let fullText = '';

    try {
      href = await link.getAttribute('href', { timeout: 1000 });
      fullText = await link.innerText({ timeout: 1200 });
    } catch (error) {
      continue;
    }

    if (!href) {
      continue;
    }

    const url = absoluteUrl(href, BASE_URL);

    if (!url.includes('/p')) {
      continue;
    }

    if (!fullText || fullText.trim().length < 5) {
      try {
        const parent = link.locator('xpath=ancestor::*[contains(@data-testid, "product") or contains(@class, "product") or contains(@class, "Product")][1]');
        fullText = await parent.innerText({ timeout: 1200 });
      } catch (error) {}
    }

    if (!fullText || fullText.trim().length < 5) {
      continue;
    }

    if (/produtos encontrados|compre por categoria|super ofertas/i.test(fullText)) {
      continue;
    }

    if (!sameProductVariant(query, fullText)) {
      continue;
    }

    const lines = fullText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const name = lines.find((line) => {
      return (
        !line.includes('R$') &&
        !/produtos encontrados|compre por categoria|super ofertas/i.test(line) &&
        line.length > 8
      );
    }) || lines[0] || fullText;

    if (/produtos encontrados|compre por categoria|super ofertas/i.test(name)) {
      continue;
    }

    console.log('[ATACADAO] Produto escolhido:', name);
    console.log('[ATACADAO] URL produto:', url);

    return {
      name,
      url,
      searchText: fullText
    };
  }

  /*
   * Fallback por card, mas sempre exigindo link /p.
   */
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
    const cardCount = Math.min(await cards.count(), 35);

    if (!cardCount) {
      continue;
    }

    console.log(`[ATACADAO] Selector fallback ${selector}: ${cardCount} cards`);

    for (let i = 0; i < cardCount; i++) {
      const card = cards.nth(i);

      let fullText = '';

      try {
        fullText = await card.innerText({ timeout: 1200 });
      } catch (error) {
        continue;
      }

      if (!fullText || /produtos encontrados/i.test(fullText)) {
        continue;
      }

      if (!sameProductVariant(query, fullText)) {
        continue;
      }

      const href = await attrFirst(card, ['a[href*="/p"]'], 'href', 1200);

      if (!href) {
        continue;
      }

      const url = absoluteUrl(href, BASE_URL);

      if (!url.includes('/p')) {
        continue;
      }

      const name = await textFirst(card, [
        '[data-testid*="name"]',
        '[data-testid*="title"]',
        '[class*="name"]',
        '[class*="title"]',
        'h2',
        'h3',
        'a[href*="/p"]'
      ], 1200) || fullText.split('\n')[0];

      if (/produtos encontrados|compre por categoria|super ofertas/i.test(name)) {
        continue;
      }

      console.log('[ATACADAO] Produto escolhido fallback:', name);
      console.log('[ATACADAO] URL produto fallback:', url);

      return {
        name,
        url,
        searchText: fullText
      };
    }
  }

  console.log('[ATACADAO] Nenhum link de produto válido encontrado');

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

module.exports = {
  scrape
};
