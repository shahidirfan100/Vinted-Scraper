// Vinted Scraper - Optimized for speed and stealth
import { PlaywrightCrawler, Dataset } from 'crawlee';
import { Actor, log } from 'apify';

await Actor.init();

const input = (await Actor.getInput()) || {};
const {
    startUrl,
    keyword = '',
    category = 'women',
    minPrice,
    maxPrice,
    results_wanted: RESULTS_WANTED_RAW = 20,
    max_pages: MAX_PAGES_RAW = 10,
    proxyConfiguration: proxyConfig,
} = input;

const RESULTS_WANTED = Number.isFinite(+RESULTS_WANTED_RAW) ? Math.max(1, +RESULTS_WANTED_RAW) : 20;
const MAX_PAGES = Number.isFinite(+MAX_PAGES_RAW) ? Math.max(1, +MAX_PAGES_RAW) : 10;

// Build start URL
function buildStartUrl() {
    if (startUrl) return startUrl;

    const categoryMap = {
        'women': '1904-women',
        'men': '5-men',
        'kids': '47-kids',
        'home': '2000-home',
    };

    const categorySlug = categoryMap[category?.toLowerCase()] || category || '1904-women';
    const baseUrl = new URL(`https://www.vinted.com/catalog/${categorySlug}`);

    if (keyword) baseUrl.searchParams.set('search_text', keyword);
    if (minPrice) baseUrl.searchParams.set('price_from', String(minPrice));
    if (maxPrice) baseUrl.searchParams.set('price_to', String(maxPrice));

    return baseUrl.href;
}

const initialUrl = buildStartUrl();
const hasKeyword = keyword && keyword.trim().length > 0;

log.info(`Starting Vinted scraper: ${initialUrl}`);
log.info(`Target: ${RESULTS_WANTED} results, max ${MAX_PAGES} pages`);
log.info(`Search mode: ${hasKeyword ? 'KEYWORD (residential proxy recommended)' : 'CATALOG (datacenter may work)'}`);

// Create proxy configuration
// Keyword searches trigger stricter bot detection - use residential
// Direct catalog URLs may work with datacenter
const defaultProxyGroups = hasKeyword ? ['RESIDENTIAL'] : ['SHADER'];
const proxyConfiguration = await Actor.createProxyConfiguration(proxyConfig || {
    useApifyProxy: true,
    apifyProxyGroups: defaultProxyGroups,
});

let saved = 0;
const seenIds = new Set();

const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    maxRequestRetries: 3,
    useSessionPool: true,
    sessionPoolOptions: {
        maxPoolSize: 5,
        sessionOptions: { maxUsageCount: 10 },
    },
    maxConcurrency: 2, // Slightly higher for speed
    requestHandlerTimeoutSecs: 60,
    navigationTimeoutSecs: 30, // Faster timeout

    // Maximum stealth fingerprints
    browserPoolOptions: {
        useFingerprints: true,
        fingerprintOptions: {
            fingerprintGeneratorOptions: {
                browsers: [{ name: 'chrome', minVersion: 120, maxVersion: 130 }],
                operatingSystems: ['windows', 'macos'],
                devices: ['desktop'],
                locales: ['en-US'],
            },
        },
    },

    // Pre-navigation: Aggressive resource blocking & maximum stealth
    preNavigationHooks: [
        async ({ page }) => {
            // Aggressive resource blocking for speed
            await page.route('**/*', (route) => {
                const type = route.request().resourceType();
                const url = route.request().url();

                // Block everything except document, script, xhr, fetch
                if (['image', 'font', 'media', 'stylesheet', 'other'].includes(type)) {
                    return route.abort();
                }

                // Block tracking/analytics scripts
                if (url.includes('google-analytics') ||
                    url.includes('googletagmanager') ||
                    url.includes('facebook') ||
                    url.includes('hotjar') ||
                    url.includes('adsense') ||
                    url.includes('doubleclick') ||
                    url.includes('pinterest') ||
                    url.includes('twitter') ||
                    url.includes('tiktok') ||
                    url.includes('segment') ||
                    url.includes('optimizely') ||
                    url.includes('sentry') ||
                    url.includes('newrelic') ||
                    url.includes('datadome')) {
                    return route.abort();
                }

                return route.continue();
            });

            // Maximum stealth scripts
            await page.addInitScript(() => {
                // Hide webdriver
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
                delete navigator.__proto__.webdriver;

                // Mock plugins
                Object.defineProperty(navigator, 'plugins', {
                    get: () => {
                        const plugins = [
                            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                            { name: 'Native Client', filename: 'internal-nacl-plugin' },
                        ];
                        plugins.length = 3;
                        return plugins;
                    },
                });

                // Mock languages
                Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
                Object.defineProperty(navigator, 'language', { get: () => 'en-US' });

                // Chrome runtime
                window.chrome = { runtime: {}, csi: () => { }, loadTimes: () => { } };

                // Override permissions
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({ state: Notification.permission }) :
                        originalQuery(parameters)
                );

                // Mock connection
                Object.defineProperty(navigator, 'connection', {
                    get: () => ({
                        effectiveType: '4g',
                        rtt: 50,
                        downlink: 10,
                        saveData: false,
                    }),
                });

                // Mock hardware concurrency
                Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });

                // Mock device memory
                Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });

                // Mock screen properties
                Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
                Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });
            });
        },
    ],

    async requestHandler({ page, request, crawler: crawlerInstance }) {
        const pageNo = request.userData?.pageNo || 1;
        log.info(`Processing page ${pageNo}: ${request.url}`);

        // Wait for DOM content only (faster than networkidle)
        await page.waitForLoadState('domcontentloaded');

        // Quick modal handling
        try {
            await page.click('button:has-text("Accept all"), button:has-text("Accept")', { timeout: 2000 });
        } catch (e) { /* No modal */ }

        try {
            await page.click('button[aria-label="Close"]', { timeout: 1000 });
        } catch (e) { /* No modal */ }

        // Wait for products with shorter timeout
        await page.waitForSelector('[data-testid^="product-item-id-"]:not([data-testid*="--"])', { timeout: 10000 }).catch(() => { });

        // Quick scroll for lazy loading
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        await page.waitForTimeout(800);

        // Extract all product data
        const items = await page.evaluate(() => {
            const products = [];
            const containers = document.querySelectorAll('[data-testid^="product-item-id-"]:not([data-testid*="--"])');

            containers.forEach((container) => {
                try {
                    const testId = container.getAttribute('data-testid') || '';
                    const productId = testId.replace('product-item-id-', '');

                    if (!productId || productId.includes('--')) return;

                    const link = container.querySelector('a[href*="/items/"]');
                    const href = link?.getAttribute('href') || '';
                    const url = href.startsWith('http') ? href : (href ? `https://www.vinted.com${href}` : '');

                    const titleAttr = link?.getAttribute('title') || '';
                    let title = '';
                    const titleMatch = titleAttr.match(/^([^,]+)/);
                    if (titleMatch) title = titleMatch[1].trim();

                    const priceEl = container.querySelector('[data-testid*="price-text"]');
                    let price = priceEl?.textContent?.trim()?.replace('$', '') || '';

                    const brandEl = container.querySelector('[data-testid*="description-title"]');
                    const brand = brandEl?.textContent?.trim() || '';

                    const subtitleEl = container.querySelector('[data-testid*="description-subtitle"]');
                    const subtitleText = subtitleEl?.textContent?.trim() || '';

                    let size = '', condition = '';
                    if (subtitleText.includes('·')) {
                        const parts = subtitleText.split('·').map(p => p.trim());
                        size = parts[0] || '';
                        condition = parts[1] || '';
                    } else {
                        const knownConditions = ['New with tags', 'New without tags', 'Very good', 'Good', 'Satisfactory'];
                        if (knownConditions.some(c => subtitleText.toLowerCase().includes(c.toLowerCase()))) {
                            condition = subtitleText;
                        } else {
                            size = subtitleText;
                        }
                    }

                    const imgEl = container.querySelector('img');
                    const imageUrl = imgEl?.src || '';

                    const favEl = container.querySelector('[data-testid*="favourite"]');
                    let favoriteCount = 0;
                    const favText = favEl?.textContent?.match(/\d+/);
                    if (favText) favoriteCount = parseInt(favText[0], 10);

                    products.push({
                        product_id: productId,
                        title: title || brand || 'Unknown',
                        brand,
                        size,
                        condition,
                        price,
                        currency: 'USD',
                        image_url: imageUrl,
                        url,
                        favorite_count: favoriteCount,
                    });
                } catch (e) { /* Skip */ }
            });

            return products;
        });

        log.info(`Extracted ${items.length} items from page ${pageNo}`);

        // Deduplicate and save
        const newItems = [];
        for (const item of items) {
            const id = item.product_id;
            if (id && !seenIds.has(id) && saved < RESULTS_WANTED) {
                seenIds.add(id);
                newItems.push(item);
                saved++;
            }
        }

        if (newItems.length > 0) {
            await Dataset.pushData(newItems);
            log.info(`Saved ${newItems.length} items. Total: ${saved}/${RESULTS_WANTED}`);
        }

        // Queue next page if needed
        if (saved < RESULTS_WANTED && pageNo < MAX_PAGES) {
            const nextPageUrl = new URL(request.url);
            nextPageUrl.searchParams.set('page', String(pageNo + 1));
            await crawlerInstance.addRequests([{
                url: nextPageUrl.href,
                userData: { pageNo: pageNo + 1 },
            }]);
        }
    },

    failedRequestHandler({ request }, error) {
        log.error(`Failed: ${request.url} - ${error.message}`);
    },
});

await crawler.run([{ url: initialUrl, userData: { pageNo: 1 } }]);
log.info(`Completed. Total items: ${saved}`);
await Actor.exit();
