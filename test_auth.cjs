const { chromium } = require('/Users/laralane/.local/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();
  
  try {
    console.log('Navigating to IFFY login...');
    await page.goto('https://iffy-analysis.vercel.app', { timeout: 20000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
    
    const url = page.url();
    console.log('URL after load:', url);
    
    // Check if redirected to auth
    if (url.includes('auth') || url.includes('login') || url.includes('signin')) {
      console.log('On auth page');
      const html = await page.content();
      console.log('Auth page preview:', html.slice(0, 1000));
    } else {
      console.log('Not on auth page, might be logged in');
      const html = await page.content();
      console.log('Page preview:', html.slice(0, 500));
    }
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  
  await browser.close();
})();
