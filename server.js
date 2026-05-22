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
    'refresco', 'po', 'pó', 'em', 'de', 'da', 'do', 'das', 'dos',
    'com', 'sem', 'un', 'und', 'unid', 'cada', 'produto', 'preco',
    'preço', 'kit', 'leve', 'pague'
  ]);

  const important = e
    .split(' ')
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !ignored.has(w));

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
    browser = await chromium.launch({
      headless: HEADLESS,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();

    await page.goto('https://example.com', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    const title = await page.title();

    res.json({
      success: true,
      message: 'Chromium abriu corretamente.',
      title
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  } finally {
    if (browser) {
      await browser.close();
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

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const allItems = [];
  const logs = [];

  try {
    for (const site of sites) {
      const adapter = adapters[site.adapter];

      if (!adapter || typeof adapter.scrape !== 'function') {
        logs.push({
          site: site.id,
          market: site.market,
          success: false,
          message: 'Adapter não encontrado.'
        });

        continue;
      }

      const context = await browser.newContext({
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

      try {
        const result = await adapter.scrape({
          page,
          cep,
          query,
          site,
          sameProductVariant
        });

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

        logs.push({
          site: site.id,
          market: site.market,
          success: !!result.success,
          message: result.message || 'Consulta finalizada.',
          total: items.length
        });
      } catch (error) {
        logs.push({
          site: site.id,
          market: site.market,
          success: false,
          message: error.message
        });
      } finally {
        await context.close();
      }
    }

    res.json({
      success: true,
      message: 'Consulta finalizada.',
      cep,
      query,
      total: allItems.length,
      items: allItems,
      logs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
      items: allItems,
      logs
    });
  } finally {
    await browser.close();
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Preço Perto Scraper rodando na porta ${PORT}`);
});
