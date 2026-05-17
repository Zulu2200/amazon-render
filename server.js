const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

app.get('/api/check', async (req, res) => {
  const { asin, marketplace, token } = req.query;

  if (token !== process.env.SECRET_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!asin || !marketplace) {
    return res.status(400).json({ error: 'Missing asin or marketplace' });
  }

  const domains = {
    USA:         'amazon.com',
    US:          'amazon.com',
    Canada:      'amazon.ca',
    CA:          'amazon.ca',
    Brazil:      'amazon.com.br',
    BR:          'amazon.com.br',
    Mexico:      'amazon.com.mx',
    MX:          'amazon.com.mx',
    UK:          'amazon.co.uk',
    Germany:     'amazon.de',
    DE:          'amazon.de',
    France:      'amazon.fr',
    FR:          'amazon.fr',
    Italy:       'amazon.it',
    IT:          'amazon.it',
    Spain:       'amazon.es',
    ES:          'amazon.es',
    Netherlands: 'amazon.nl',
    NL:          'amazon.nl',
    Belgium:     'amazon.com.be',
    BE:          'amazon.com.be',
    Sweden:      'amazon.se',
    SE:          'amazon.se',
    Poland:      'amazon.pl',
    PL:          'amazon.pl',
    Ireland:     'amazon.ie',
    IE:          'amazon.ie',
    Japan:       'amazon.co.jp',
    JP:          'amazon.co.jp',
    Australia:   'amazon.com.au',
    AU:          'amazon.com.au',
    India:       'amazon.in',
    IN:          'amazon.in',
    UAE:         'amazon.ae',
    AE:          'amazon.ae',
  };

  const domain = domains[marketplace];
  if (!domain) {
    return res.status(400).json({ error: 'Unknown marketplace: ' + marketplace });
  }

  const langMap = {
    'amazon.de':     'de-DE,de;q=0.9',
    'amazon.fr':     'fr-FR,fr;q=0.9',
    'amazon.it':     'it-IT,it;q=0.9',
    'amazon.es':     'es-ES,es;q=0.9',
    'amazon.nl':     'nl-NL,nl;q=0.9',
    'amazon.se':     'sv-SE,sv;q=0.9',
    'amazon.pl':     'pl-PL,pl;q=0.9',
    'amazon.co.jp':  'ja-JP,ja;q=0.9',
    'amazon.com.br': 'pt-BR,pt;q=0.9',
    'amazon.com.mx': 'es-MX,es;q=0.9',
  };
  const acceptLang = langMap[domain] || 'en-GB,en;q=0.9';

  const productUrl = `https://www.${domain}/dp/${asin}`;
  const aodUrl     = `https://www.${domain}/gp/product/ajax/?asin=${asin}&experienceId=aodAjaxMain&deviceType=web`;

  const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  const mobileUA  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

  try {
    // 1. Product page
    const controller1 = new AbortController();
    const t1 = setTimeout(() => controller1.abort(), 8000);
    const productResp = await fetch(productUrl, {
      signal: controller1.signal,
      headers: {
        'User-Agent': desktopUA,
        'Accept-Language': 'en-GB,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });
    clearTimeout(t1);
    const productBody = (await productResp.text()).toLowerCase();

    const blocked = productBody.includes('robot check') ||
                    productBody.includes('enter the characters') ||
                    (productBody.includes('captcha') && productBody.length < 15000);

    if (blocked) {
      return res.status(200).json({
        blocked: true,
        hasDesktopATC: false, hasDesktopBuy: false,
        hasMobileATC: false, hasMobileBuy: false,
        stock: 'Blocked'
      });
    }

    const notFound = productBody.includes('looking for something') ||
                     productBody.includes('page not found') ||
                     productResp.status === 404;
    const unavail  = productBody.includes('currently unavailable');
    const oos      = productBody.includes('out of stock') ||
                     productBody.includes('temporarily out of stock') ||
                     productBody.includes('nicht auf lager') ||
                     productBody.includes('rupture de stock') ||
                     productBody.includes('esaurito') ||
                     productBody.includes('agotado') ||
                     productBody.includes('niet op voorraad') ||
                     productBody.includes('inte i lager') ||
                     productBody.includes('brak w magazynie');

    let stock = 'In stock';
    if (notFound) stock = 'Not found';
    else if (oos) stock = 'Out of stock';
    else if (unavail) stock = 'Unavailable';

    if (notFound) {
      return res.status(200).json({
        blocked: false,
        hasDesktopATC: false, hasDesktopBuy: false,
        hasMobileATC: false, hasMobileBuy: false,
        stock: 'Not found'
      });
    }

    // 2. AOD Desktop
    const controller2 = new AbortController();
    const t2 = setTimeout(() => controller2.abort(), 8000);
    const aodDesktopResp = await fetch(aodUrl, {
      signal: controller2.signal,
      headers: {
        'User-Agent': desktopUA,
        'Accept-Language': acceptLang,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': productUrl,
        'X-Requested-With': 'XMLHttpRequest',
      },
      redirect: 'follow',
    });
    clearTimeout(t2);
    const aodDesktopBody = (await aodDesktopResp.text()).toLowerCase();

    // 3. AOD Mobile
    const controller3 = new AbortController();
    const t3 = setTimeout(() => controller3.abort(), 8000);
    const aodMobileResp = await fetch(aodUrl, {
      signal: controller3.signal,
      headers: {
        'User-Agent': mobileUA,
        'Accept-Language': acceptLang,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': productUrl,
        'X-Requested-With': 'XMLHttpRequest',
      },
      redirect: 'follow',
    });
    clearTimeout(t3);
    const aodMobileBody = (await aodMobileResp.text()).toLowerCase();

    function detectButtons(body) {
      const hasATC =
        body.includes('add-to-cart') ||
        body.includes('add to cart') ||
        body.includes('add to basket') ||
        body.includes('addtocart') ||
        body.includes('addtocart_feature_div') ||
        body.includes('add-to-cart-button') ||
        body.includes('in den einkaufswagen') ||
        body.includes('einkaufswagen') ||
        body.includes('ajouter au panier') ||
        body.includes('aggiungi al carrello') ||
        body.includes('añadir al carrito') ||
        body.includes('in winkelwagen') ||
        body.includes('winkelwagen') ||
        body.includes('lägg i kundvagnen') ||
        body.includes('lägg i kundvagn') ||
        body.includes('kundvagnen') ||
        body.includes('dodaj do koszyka') ||
        body.includes('koszyka') ||
        body.includes('a-button-primary') ||
        body.includes('submit.add-to-cart') ||
        body.includes('submit.buy-now') ||
        body.includes('buy-box-atc') ||
        body.includes('attach-base-product-button');

      const hasBuy =
        body.includes('buy now') ||
        body.includes('buy-now') ||
        body.includes('buynow') ||
        body.includes('buynow_feature_div') ||
        body.includes('buy-now-button') ||
        body.includes('jetzt kaufen') ||
        body.includes('sofort kaufen') ||
        body.includes('acheter maintenant') ||
        body.includes('acquista ora') ||
        body.includes('comprar ahora') ||
        body.includes('nu kopen') ||
        body.includes('köp nu') ||
        body.includes('køb nu') ||
        body.includes('kup teraz');

      return { hasATC, hasBuy };
    }

    const desktop  = detectButtons(aodDesktopBody);
    const mobile   = detectButtons(aodMobileBody);
    const fallback = detectButtons(productBody);

    return res.status(200).json({
      blocked: false,
      hasDesktopATC: desktop.hasATC || fallback.hasATC,
      hasDesktopBuy: desktop.hasBuy || fallback.hasBuy,
      hasMobileATC:  mobile.hasATC  || fallback.hasATC,
      hasMobileBuy:  mobile.hasBuy  || fallback.hasBuy,
      stock,
    });

  } catch (e) {
    const msg = e.name === 'AbortError' ? 'Timed out' : e.message;
    return res.status(200).json({
      blocked: false,
      hasDesktopATC: false, hasDesktopBuy: false,
      hasMobileATC: false, hasMobileBuy: false,
      stock: 'Error: ' + msg
    });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'Amazon checker running' });
});

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
