require('dotenv').config();

const express = require('express');
const { chromium } = require('playwright');

const sitesConfig = require('./sites.config');

const atacadao = require('./adapters/atacadao');
const carrefour = require('./adapters/carrefour');
const mercadolivre = require('./adapters/mercadolivre');
const araujo = require('./adapters/araujo');
const drogasil = require('./adapters/drogasil');

const app = express();

app.use(express.json({ limit: '2mb' }));

const PORT = Number(process.env.PORT || 3333);
const HEADLESS = String(process.env.HEADLESS || 'true') !== 'false';

const adapters = {
  atacadao,
  carrefour,
  mercadolivre,
  araujo,
  drogasil
};

function withTimeout(promise, ms, label = 'Operação') {
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} excedeu o tempo limite de ${ms / 1000}s`));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function cleanCep(value) {
  return String(value || '').replace(/\D+/g, '');
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sameProductVariant(expected, found) {
  const e = normalizeText(expected);
  const f = normalizeText(found);

  if (!e || !f) return true;

  const ignored = new Set([
    'refresco',
    'po',
    'pó',
    'em',
    'de',
    'da',
    'do',
    'das',
    'dos',
    'com',
    'sem',
    'un',
    'und',
    'unid',
    'cada',
    'produto',
    'preco',
    'preço',
    'kit',
    'leve',
    'pague'
  ]);

  const important = e
    .split(' ')
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !ignored.has(word));

  if (!important.length) return true;

  return important.every((word) => f.includes(word));
}

function selectedSites(inputSites) {
  if (inputSites === 'all') {
    return sitesConfig.filter((site) => site.enabled);
  }

  if (Array.isArray(inputSites) && inputSites.length) {
    return sitesConfig.filter((site) => site.enabled && inputSites.includes(site.id));
  }

  return sitesConfig.filter((site) => site.enabled);
}

async function launchBrowser() {
  return chromium.launch({
    headless: HEADLESS,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });
}

app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Preço Perto Scraper online',
    headless: HEADLESS,
    totalSites: sitesConfig.filter((site) => site.enabled).length,
    sites: sitesConfig.filter((site) => site.enabled).map((site) => site.id)
  });
});

app.get('/test-browser', async (req, res) => {
  let browser;

  try {
    console.log('[TEST] Abrindo Chromium...');

    browser = await launchBrowser();

    const page = await browser.newPage();

    await page.goto('https://example.com', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    const title = await page.title();

    console.log('[TEST] Chromium OK:', title);

    res.json({
      success: true,
      message: 'Chromium abriu corretamente.',
      title
    });
  } catch (error) {
    console.error('[TEST] Erro Chromium:', error.message);

    res.status(500).json({
      success: false,
      message: error.message
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
});

app.post('/scrape', async (req, res) => {
  const cep = cleanCep(req.body.cep);
  const query = String(req.body.query || '').trim();
  const sites = selectedSites(req.body.sites || 'all');

  if (cep.length !== 8) {
    return res.status(422).json({
      success: false,
      message: 'CEP inválido.',
      items: []
    });
  }

  if (!query) {
    return res.status(422).json({
      success: false,
      message: 'Produto não informado.',
      items: []
    });
  }

  let browser;

  const allItems = [];
  const logs = [];

  try {
    console.log(`[SCRAPE] Nova consulta | CEP ${cep} | Busca: ${query}`);
    console.log(`[SCRAPE] Sites solicitados: ${sites.map((site) => site.id).join(', ')}`);

    browser = await withTimeout(
      launchBrowser(),
      30000,
      'Abertura do Chromium'
    );

    for (const site of sites) {
      const adapter = adapters[site.adapter];

      if (!adapter || typeof adapter.scrape !== 'function') {
        logs.push({
          site: site.id,
          market: site.market,
          success: false,
          message: 'Adapter não encontrado.',
          total: 0
        });

        continue;
      }

      let context;

      try {
        console.log(`[SCRAPE] Iniciando ${site.id} | CEP ${cep} | Busca: ${query}`);

        context = await browser.newContext({
          locale: 'pt-BR',
          timezoneId: 'America/Sao_Paulo',
          viewport: {
            width: 1366,
            height: 768
          },
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
        });

        const page = await context.newPage();

        page.setDefaultTimeout(20000);
        page.setDefaultNavigationTimeout(45000);

        const result = await withTimeout(
          adapter.scrape({
            page,
            cep,
            query,
            site,
            sameProductVariant
          }),
          120000,
          `Adapter ${site.id}`
        );

        const items = Array.isArray(result.items) ? result.items : [];

        for (const item of items) {
          if (!sameProductVariant(query, `${item.name || ''} ${item.variant || ''}`)) {
            continue;
          }

          allItems.push({
            ...item,
            cep,
            search_query: query
          });
        }

        console.log(`[SCRAPE] Finalizou ${site.id}: ${items.length} item(ns)`);

        logs.push({
          site: site.id,
          market: site.market,
          success: !!result.success,
          message: result.message || 'Consulta finalizada.',
          total: items.length
        });
      } catch (error) {
        console.error(`[SCRAPE] Erro em ${site.id}:`, error.message);

        logs.push({
          site: site.id,
          market: site.market,
          success: false,
          message: error.message,
          total: 0
        });
      } finally {
        if (context) {
          await context.close().catch(() => {});
        }
      }
    }

    console.log(`[SCRAPE] Consulta encerrada | Total capturado: ${allItems.length}`);

    return res.json({
      success: true,
      message: 'Consulta finalizada.',
      cep,
      query,
      total: allItems.length,
      items: allItems,
      logs
    });
  } catch (error) {
    console.error('[SCRAPE] Erro geral:', error.message);

    return res.status(500).json({
      success: false,
      message: error.message,
      cep,
      query,
      total: allItems.length,
      items: allItems,
      logs
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Preço Perto Scraper rodando na porta ${PORT}`);
});
