/**
 * Script to take screenshots of all pages in the Moona application
 * Uses Puppeteer to capture screenshots
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const FRONTEND_URL = process.env.REACT_APP_BACKEND_URL 
  ? process.env.REACT_APP_BACKEND_URL.replace('/api', '')
  : 'http://localhost:3000';

const DOWNLOADS_FOLDER = path.join(require('os').homedir(), 'Downloads', 'moona-screenshots');

// Ensure downloads folder exists
if (!fs.existsSync(DOWNLOADS_FOLDER)) {
  fs.mkdirSync(DOWNLOADS_FOLDER, { recursive: true });
}

// Define all pages to screenshot
const pages = [
  {
    name: 'landing',
    url: '/',
    description: 'Landing Page'
  },
  {
    name: 'login',
    url: '/login',
    description: 'Login Page'
  },
  {
    name: 'dashboard-overview',
    url: '/dashboard',
    description: 'Dashboard - Overview Tab',
    waitFor: 3000 // Wait for data to load
  },
  {
    name: 'dashboard-analytics',
    url: '/dashboard?tab=analytics',
    description: 'Dashboard - Analytics Tab',
    waitFor: 3000
  },
  {
    name: 'dashboard-holdings',
    url: '/dashboard?tab=investments',
    description: 'Dashboard - Holdings Tab',
    waitFor: 3000
  },
  {
    name: 'dashboard-vs-spy',
    url: '/dashboard?tab=spy-comparison',
    description: 'Dashboard - vs SPY Tab',
    waitFor: 3000
  },
  {
    name: 'dashboard-future',
    url: '/dashboard?tab=future',
    description: 'Dashboard - Future Tab',
    waitFor: 3000
  }
];

async function takeScreenshot(page, browserPage, index, total) {
  try {
    console.log(`[${index + 1}/${total}] Capturing: ${page.description}...`);
    
    // Navigate to page
    await browserPage.goto(`${FRONTEND_URL}${page.url}`, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for initial load
    if (page.waitFor) {
      await new Promise(resolve => setTimeout(resolve, page.waitFor));
    }

    // Execute actions if provided (e.g., clicking tabs)
    if (page.actions && Array.isArray(page.actions)) {
      for (const action of page.actions) {
        try {
          if (action.type === 'wait') {
            await browserPage.waitForSelector(action.selector, { timeout: 10000 });
            if (action.waitAfter) {
              await new Promise(resolve => setTimeout(resolve, action.waitAfter));
            }
          } else if (action.type === 'click') {
            await browserPage.waitForSelector(action.selector, { timeout: 10000 });
            await browserPage.click(action.selector);
            if (action.waitAfter) {
              await new Promise(resolve => setTimeout(resolve, action.waitAfter));
            }
          }
        } catch (e) {
          console.warn(`  ⚠️  Warning: Could not execute action: ${action.type} on ${action.selector}`);
        }
      }
    }

    // Wait for main content to load
    try {
      await browserPage.waitForSelector('body', { timeout: 5000 });
    } catch (e) {
      console.warn(`  ⚠️  Warning: Could not find body element`);
    }

    // Take screenshot
    const screenshotPath = path.join(DOWNLOADS_FOLDER, `${page.name}.png`);
    await browserPage.screenshot({
      path: screenshotPath,
      fullPage: true,
      type: 'png'
    });

    console.log(`  ✅ Saved: ${screenshotPath}`);
    return screenshotPath;
  } catch (error) {
    console.error(`  ❌ Error capturing ${page.description}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('🚀 Starting screenshot capture...');
  console.log(`📁 Saving to: ${DOWNLOADS_FOLDER}`);
  console.log(`🌐 Frontend URL: ${FRONTEND_URL}`);
  console.log('');

  // Check if frontend is running
  try {
    const http = require('http');
    await new Promise((resolve, reject) => {
      const req = http.get(FRONTEND_URL, (res) => {
        resolve();
      });
      req.on('error', (err) => {
        reject(err);
      });
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
    });
  } catch (error) {
    console.error('❌ Error: Frontend is not running!');
    console.error(`   Please start the frontend with: cd frontend && npm start`);
    console.error(`   Or check if it's running on a different port.`);
    console.error(`   Attempted URL: ${FRONTEND_URL}`);
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
  });

  const browserPage = await browser.newPage();
  await browserPage.setViewport({ width: 1920, height: 1080 });

  const results = [];
  
  for (let i = 0; i < pages.length; i++) {
    const result = await takeScreenshot(pages[i], browserPage, i, pages.length);
    results.push({ page: pages[i], success: !!result, path: result });
    
    // Small delay between screenshots
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  await browser.close();

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Screenshot Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  results.forEach((result, i) => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${pages[i].description}`);
  });
  
  console.log('');
  console.log(`✅ Successful: ${successful}/${pages.length}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}/${pages.length}`);
  }
  console.log(`📁 All screenshots saved to: ${DOWNLOADS_FOLDER}`);
}

main().catch(console.error);

