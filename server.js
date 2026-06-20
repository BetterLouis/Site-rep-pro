const express = require('express');
const puppeteer = require('puppeteer');
const lighthouse = require('lighthouse');

const app = express();
app.use(express.json());

// Simple shared-secret auth so randoms on the internet can't burn your compute
const WORKER_SECRET = process.env.WORKER_SECRET || '';

app.post('/audit', async (req, res) => {
  if (WORKER_SECRET && req.headers['x-worker-secret'] !== WORKER_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const { port } = new URL(browser.wsEndpoint());

    const result = await lighthouse(url, {
      port,
      output: 'json',
      onlyCategories: ['performance', 'seo'],
      formFactor: 'mobile',
      screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 2.625 },
    });

    const lhr = result.lhr;

    const payload = {
      performanceScore: Math.round((lhr.categories.performance?.score || 0) * 100),
      seoScore: Math.round((lhr.categories.seo?.score || 0) * 100),
      coreWebVitals: {
        lcp: lhr.audits['largest-contentful-paint']?.numericValue,
        cls: lhr.audits['cumulative-layout-shift']?.numericValue,
        inp: lhr.audits['interactive']?.numericValue, // proxy if INP audit unavailable
        tbt: lhr.audits['total-blocking-time']?.numericValue,
        fcp: lhr.audits['first-contentful-paint']?.numericValue,
      },
      opportunities: Object.values(lhr.audits)
        .filter(a => a.details?.type === 'opportunity' && a.score !== null && a.score < 0.9)
        .map(a => ({
          title: a.title,
          description: a.description,
          savingsMs: a.details?.overallSavingsMs || 0,
        }))
        .sort((a, b) => b.savingsMs - a.savingsMs)
        .slice(0, 8),
      diagnostics: Object.values(lhr.audits)
        .filter(a => a.score !== null && a.score < 0.9 && a.scoreDisplayMode === 'binary')
        .map(a => ({ title: a.title, description: a.description }))
        .slice(0, 8),
    };

    res.json(payload);
  } catch (err) {
    console.error('Lighthouse audit failed:', err);
    res.status(500).json({ error: 'audit_failed', message: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Lighthouse worker listening on port ${PORT}`));
  
