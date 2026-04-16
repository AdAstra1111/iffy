const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  
  // Capture console errors
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  try {
    console.log('Opening IFFY app...');
    await page.goto('https://iffy-analysis.vercel.app', { waitUntil: 'networkidle', timeout: 30000 });
    
    // Login
    console.log('Logging in...');
    await page.getByLabel(/email/i).fill('Sebastianstreet@gmail.com');
    await page.getByLabel(/password/i).fill('M33k0Drag0n');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('**/projects', { timeout: 15000 });
    console.log('Logged in');
    
    // Navigate to YETI project
    console.log('Navigating to YETI project...');
    await page.goto('https://iffy-analysis.vercel.app/projects', { waitUntil: 'networkidle' });
    
    // Find YETI project card and click it
    await page.getByText('YETI').first().click();
    await page.waitForURL('**/development/**', { timeout: 15000 });
    console.log('On YETI project page');
    
    // Wait for the development engine to load
    await page.waitForTimeout(3000);
    
    // Find the Concept Brief document
    console.log('Looking for Concept Brief document...');
    
    // Try to find document list items
    const docSelectors = [
      '[class*="doc-item"]',
      '[class*="document"]',
      '[class*="rung"]',
      'button:has-text("Concept Brief")',
      '[data-testid*="document"]'
    ];
    
    let conceptBriefFound = false;
    for (const sel of docSelectors) {
      try {
        const el = await page.getByText(/concept brief/i).first();
        if (el) {
          await el.click();
          conceptBriefFound = true;
          console.log('Clicked Concept Brief');
          break;
        }
      } catch (e) {}
    }
    
    if (!conceptBriefFound) {
      // Try clicking on any available document in the ladder
      const rungItems = await page.$$('[class*="rung"], [class*="doc-item"], [class*="lane-item"]');
      if (rungItems.length > 0) {
        console.log(`Found ${rungItems.length} lane items, clicking first`);
        await rungItems[1].click(); // Usually concept_brief is 2nd rung
      }
    }
    
    await page.waitForTimeout(2000);
    
    // Look for Analyze button
    console.log('Looking for Analyze button...');
    let analyzeBtn = null;
    const btnSelectors = [
      'button:has-text("Analyze")',
      '[class*="analyze"]',
      '[aria-label*="Analyze"]'
    ];
    
    for (const sel of btnSelectors) {
      try {
        const btn = await page.getByRole('button', { name: /analyze/i });
        if (btn) {
          analyzeBtn = btn;
          break;
        }
      } catch (e) {}
    }
    
    if (!analyzeBtn) {
      throw new Error('Analyze button not found');
    }
    
    // RUN 1
    console.log('\n=== RUN 1 ===');
    await analyzeBtn.click();
    await page.waitForTimeout(8000); // Wait for analysis
    
    // Extract scores
    let run1CI = '?', run1GP = '?';
    const ciMatch = await page.evaluate(() => {
      const el = document.querySelector('[class*="score"], [class*="ci"], [class*="gp"]');
      return el ? el.textContent : null;
    });
    
    // Look for CI/GP display
    const scoreEls = await page.$$eval('[class*="ci"], [class*="gp"], [class*="score"]', els => 
      els.map(e => ({ text: e.textContent, cls: e.className })).slice(0, 10)
    );
    console.log('Score elements found:', JSON.stringify(scoreEls));
    
    // Try to find score numbers
    const pageText = await page.textContent('body');
    const ciMatch2 = pageText.match(/CI[:\s]*(\d+)/i);
    const gpMatch2 = pageText.match(/GP[:\s]*([\d.]+)/i);
    if (ciMatch2) run1CI = ciMatch2[1];
    if (gpMatch2) run1GP = gpMatch2[1];
    console.log(`Run 1 scores: CI=${run1CI} / GP=${run1GP}`);
    
    // Wait before run 2
    await page.waitForTimeout(2000);
    
    // RUN 2 - click Analyze again
    console.log('\n=== RUN 2 ===');
    const analyzeBtn2 = await page.getByRole('button', { name: /analyze/i });
    await analyzeBtn2.click();
    await page.waitForTimeout(8000);
    
    let run2CI = '?', run2GP = '?';
    const pageText2 = await page.textContent('body');
    const ciMatch3 = pageText2.match(/CI[:\s]*(\d+)/i);
    const gpMatch3 = pageText2.match(/GP[:\s]*([\d.]+)/i);
    if (ciMatch3) run2CI = ciMatch3[1];
    if (gpMatch3) run2GP = gpMatch3[1];
    console.log(`Run 2 scores: CI=${run2CI} / GP=${run2GP}`);
    
    // REPORT
    console.log('\n=== RESULTS ===');
    console.log(`Run 1: CI=${run1CI} / GP=${run1GP}`);
    console.log(`Run 2: CI=${run2CI} / GP=${run2GP}`);
    const match = (run1CI === run2CI && run1GP === run2GP);
    console.log(`Match: ${match ? 'YES' : 'NO'}`);
    console.log(`Conclusion: ${match ? 'model variance / rubric interpretation variance' : 'API-level model non-determinism'}`);
    
    if (errors.length > 0) {
      console.log('\nConsole errors:', errors);
    }
    
  } catch (err) {
    console.error('ERROR:', err.message);
    await page.screenshot({ path: '/tmp/diagnostic-error.png' });
    console.log('Screenshot saved to /tmp/diagnostic-error.png');
  } finally {
    await browser.close();
  }
})();
