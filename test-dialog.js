const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', error => console.log('BROWSER PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('BROWSER REQUEST FAILED:', request.url(), request.failure().errorText));

  await page.goto('http://localhost:3000/test-dialog', { waitUntil: 'networkidle0' });
  
  console.log('Clicking the button...');
  await page.click('button');
  
  // Wait a bit to see if an error is thrown
  await new Promise(r => setTimeout(r, 2000));
  
  console.log('Capturing DOM...');
  const html = await page.content();
  if (html.includes('This page couldn')) {
    console.log('ERROR DETECTED: Page crashed!');
  } else {
    console.log('NO ERROR: Dialog opened successfully.');
  }

  await browser.close();
})();
