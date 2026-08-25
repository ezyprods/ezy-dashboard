const puppeteer = require('puppeteer');

async function debugDetail() {
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
      await new Promise(r => setTimeout(r, 1200));
    }
  }

  // Get project link from gallery
  await page.goto('http://localhost:3000/personal-projects', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));

  const projectLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .filter(a => a.href.includes('/personal-projects/'))
      .map(a => ({ href: a.href, text: a.innerText }));
  });
  console.log('PROJECT LINKS:', projectLinks);

  if (projectLinks.length > 0) {
    console.log('Navegando a:', projectLinks[0].href);
    await page.goto(projectLinks[0].href, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => !document.body.innerText.includes('Cargando proyecto personal'), { timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 500));
    console.log('DETAIL PAGE TEXT:\n----------------\n' + await page.evaluate(() => document.body.innerText) + '\n----------------');
  }

  await browser.close();
}

debugDetail().catch(console.error);
