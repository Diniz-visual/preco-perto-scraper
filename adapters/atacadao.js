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
