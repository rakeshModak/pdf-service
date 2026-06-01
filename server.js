const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'HTML to PDF API is running' });
});

// Test endpoint with sample HTML
app.get('/test', async (req, res) => {
  let browser;
  
  try {
    const sampleHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Test PDF</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              margin: 40px;
              line-height: 1.6;
            }
            h1 { color: #333; }
            .box {
              border: 2px solid #ddd;
              padding: 20px;
              margin: 20px 0;
              border-radius: 5px;
            }
          </style>
        </head>
        <body>
          <h1>PDF Test Document</h1>
          <div class="box">
            <h2>This is a test</h2>
            <p>If you can see this PDF, the API is working correctly!</p>
            <p>Generated at: ${new Date().toLocaleString()}</p>
          </div>
        </body>
      </html>
    `;

    // Launch browser
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-extensions',
        '--disable-default-apps',
        '--disable-translate',
        '--disable-sync',
        '--no-default-browser-check',
        '--mute-audio',
        '--hide-scrollbars'
      ],
      timeout: 30000
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    await page.setContent(sampleHtml, { 
      waitUntil: ['networkidle0', 'domcontentloaded'],
      timeout: 30000 
    });

    await page.waitForTimeout(1000);

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '1cm',
        right: '1cm',
        bottom: '1cm',
        left: '1cm'
      }
    });

    if (!pdf || pdf.length === 0) {
      throw new Error('Generated PDF is empty');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="test.pdf"');
    res.setHeader('Content-Length', pdf.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.end(pdf, 'binary');

  } catch (error) {
    console.error('Test PDF generation error:', error);
    res.status(500).json({
      error: 'Test PDF generation failed',
      message: error.message
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Main PDF conversion endpoint
app.post('/convert', async (req, res) => {
  let browser;
  
  try {
    const { html, options = {} } = req.body;
    
    // Validate input
    if (!html) {
      return res.status(400).json({ 
        error: 'HTML content is required',
        message: 'Please provide HTML content in the request body' 
      });
    }

    // Default PDF options - A4 with no margins
    const defaultOptions = {
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0',
        right: '0',
        bottom: '0',
        left: '0'
      }
    };

    const pdfOptions = { ...defaultOptions, ...options };

    // Launch Puppeteer browser with production configuration
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-extensions',
        '--disable-default-apps',
        '--disable-translate',
        '--disable-sync',
        '--no-default-browser-check',
        '--mute-audio',
        '--hide-scrollbars'
      ],
      timeout: 30000
    });

    const page = await browser.newPage();
    
    // Set viewport for consistency
    await page.setViewport({ width: 1280, height: 800 });
    
    // Set content and wait for it to load
    await page.setContent(html, { 
      waitUntil: ['networkidle0', 'domcontentloaded'],
      timeout: 30000 
    });

    // Wait a bit more to ensure all content is rendered
    // await page.waitForTimeout(1000);

    // Ensure the page is fully loaded
    await page.evaluate(() => {
      return new Promise((resolve) => {
        if (document.readyState === 'complete') {
          resolve();
        } else {
          window.addEventListener('load', resolve);
        }
      });
    });

    // Generate PDF
    const pdf = await page.pdf(pdfOptions);

    // Ensure we have a valid PDF buffer
    if (!pdf || pdf.length === 0) {
      throw new Error('Generated PDF is empty');
    }

    // Set response headers for PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="document.pdf"');
    res.setHeader('Content-Length', pdf.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Send PDF buffer
    res.end(pdf, 'binary');

  } catch (error) {
    console.error('PDF conversion error:', error);
    
    if (!res.headersSent) {
      res.status(500).json({
        error: 'PDF conversion failed',
        message: error.message
      });
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Main image conversion endpoint (PNG / JPEG / WebP)
app.post('/convert-image', async (req, res) => {
  let browser;

  try {
    const { html, imageType = 'png', viewport, options = {} } = req.body;

    if (!html) {
      return res.status(400).json({
        error: 'HTML content is required',
        message: 'Please provide HTML content in the request body'
      });
    }

    const type = String(imageType).toLowerCase() === 'jpg' ? 'jpeg' : String(imageType).toLowerCase();
    const allowedTypes = ['png', 'jpeg', 'webp'];
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        error: 'Invalid image type',
        message: `imageType must be one of: ${allowedTypes.join(', ')} (or "jpg")`
      });
    }

    const defaultOptions = {
      type,
      fullPage: true,
      omitBackground: false
    };

    if (type === 'jpeg' || type === 'webp') {
      defaultOptions.quality = 90;
    }

    const screenshotOptions = { ...defaultOptions, ...options, type };

    if (screenshotOptions.type === 'png') {
      delete screenshotOptions.quality;
    }

    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-extensions',
        '--disable-default-apps',
        '--disable-translate',
        '--disable-sync',
        '--no-default-browser-check',
        '--mute-audio',
        '--hide-scrollbars'
      ],
      timeout: 30000
    });

    const page = await browser.newPage();

    // Initial viewport — caller can pin one; otherwise use a sane default
    // and auto-fit to content after render.
    const initialViewport = viewport && viewport.width && viewport.height
      ? viewport
      : { width: 1122, height: 794 };
    await page.setViewport(initialViewport);

    await page.setContent(html, {
      waitUntil: ['networkidle0', 'domcontentloaded'],
      timeout: 30000
    });

    await page.evaluate(() => {
      return new Promise((resolve) => {
        if (document.readyState === 'complete') {
          resolve();
        } else {
          window.addEventListener('load', resolve);
        }
      });
    });

    // Auto-fit viewport to actual rendered content size so we don't
    // get empty bands when the document is narrower/shorter than 1280x800.
    if (!viewport) {
      const contentSize = await page.evaluate(() => {
        const doc = document.documentElement;
        const body = document.body;
        return {
          width: Math.ceil(Math.max(
            doc.scrollWidth, body ? body.scrollWidth : 0,
            doc.offsetWidth, body ? body.offsetWidth : 0
          )),
          height: Math.ceil(Math.max(
            doc.scrollHeight, body ? body.scrollHeight : 0,
            doc.offsetHeight, body ? body.offsetHeight : 0
          ))
        };
      });

      if (contentSize.width > 0 && contentSize.height > 0) {
        await page.setViewport({
          width: contentSize.width,
          height: contentSize.height,
          deviceScaleFactor: initialViewport.deviceScaleFactor || 1
        });
      }
    }

    const image = await page.screenshot(screenshotOptions);

    if (!image || image.length === 0) {
      throw new Error('Generated image is empty');
    }

    const mimeType = `image/${type}`;
    const fileExt = type === 'jpeg' ? 'jpg' : type;

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="image.${fileExt}"`);
    res.setHeader('Content-Length', image.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.end(image, 'binary');

  } catch (error) {
    console.error('Image conversion error:', error);

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Image conversion failed',
        message: error.message
      });
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: 'Something went wrong on the server'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'The requested endpoint does not exist'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`HTML to PDF API server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Convert endpoint: POST http://localhost:${PORT}/convert`);
  console.log(`Image endpoint:   POST http://localhost:${PORT}/convert-image`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT. Graceful shutdown...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM. Graceful shutdown...');
  process.exit(0);
});