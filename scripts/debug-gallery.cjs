const puppeteer = require('puppeteer');

async function debug() {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto('http://localhost:3000/personal-projects', { waitUntil: 'networkidle2' });

  const passInput = await page.$('input[type="password"]');
  if (passInput) {
    await passInput.type('20923954Aa*');
    const unlockBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.innerText.includes('Desbloquear'));
    });
    if (unlockBtn && unlockBtn.asElement()) {
      await unlockBtn.asElement().click();
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  await page.goto('http://localhost:3000/personal-projects', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));

  const text = await page.evaluate(() => document.body.innerText);
  console.log('GALLERY INNER TEXT:\n------------------\n' + text + '\n------------------');

  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).map(a => ({ href: a.href, text: a.innerText }));
  });
  console.log('LINKS FOUND:', links);

  await browser.close();
}

debug().catch(console.error);
