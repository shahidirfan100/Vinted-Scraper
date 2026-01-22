// Vinted Scraper - PlaywrightCrawler with API interception for fast data extraction
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

// Build start URL from parameters or use provided URL
function buildStartUrl() {
    if (startUrl) return startUrl;

    // Category mappings for Vinted US
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
log.info(`Starting Vinted scraper with URL: ${initialUrl}`);
log.info(`Target: ${RESULTS_WANTED} results, max ${MAX_PAGES} pages`);

// Create proxy configuration (residential recommended for Vinted)
const proxyConfiguration = await Actor.createProxyConfiguration(proxyConfig || {
    useApifyProxy: true,
    apifyProxyGroups: ['RESIDENTIAL'],
});

let saved = 0;
const seenIds = new Set();
let capturedApiData = [];

// Random delay utility for human-like behavior
const randomDelay = (min = 500, max = 2000) =>
    new Promise(r => setTimeout(r, min + Math.random() * (max - min)));

// Parse item data from API response
function parseApiItems(items) {
    return items.map(item => ({
        product_id: String(item.id || ''),
        title: item.title || '',
        brand: item.brand_title || item.brand || '',
        size: item.size_title || item.size || '',
        price: item.price || item.total_item_price || '',
        currency: item.currency || 'USD',
        total_price: item.total_item_price || item.service_fee
            ? `${(parseFloat(item.price || 0) + parseFloat(item.service_fee || 0)).toFixed(2)}`
            : item.price || '',
        condition: item.status || '',
        image_url: item.photo?.url || item.photos?.[0]?.url || '',
        url: item.url ? `https://www.vinted.com${item.url}` : `https://www.vinted.com/items/${item.id}`,
        seller: item.user?.login || '',
        favorite_count: item.favourite_count || 0,
        view_count: item.view_count || 0,
    }));
}

// Parse item data from DOM as fallback
function parseItemFromDom(el, $) {
    const $el = $(el);
    const link = $el.find('a.new-item-box__overlay').first();
    const href = link.attr('href') || '';
    const titleAttr = link.attr('title') || '';

    // Parse title attribute which contains: "Product name, brand: X, condition: Y, size: Z, price"
    const parseTitleAttr = (title) => {
        const parts = {};
        const regex = /brand:\s*([^,]+)|condition:\s*([^,]+)|size:\s*([^,]+)/gi;
        let match;
        while ((match = regex.exec(title)) !== null) {
            if (match[1]) parts.brand = match[1].trim();
            if (match[2]) parts.condition = match[2].trim();
            if (match[3]) parts.size = match[3].trim();
        }
        // Product name is before the first comma or "brand:"
        const nameMatch = title.match(/^([^,]+)/);
        if (nameMatch) parts.name = nameMatch[1].trim();
        return parts;
    };

    const parsed = parseTitleAttr(titleAttr);
    const testId = $el.attr('data-testid') || '';
    const productId = testId.replace('product-item-id-', '');

    // Extract price from various possible selectors
    const priceText = $el.find('.new-item-box__title p, [class*="price"]').first().text().trim();
    const price = priceText.replace(/[^0-9.,]/g, '');

    // Extract image
    const imgSrc = $el.find('img').first().attr('src') || '';

    return {
        product_id: productId,
        title: parsed.name || titleAttr.split(',')[0]?.trim() || '',
        brand: parsed.brand || $el.find('.new-item-box__description p:first-of-type').text().trim() || '',
        size: parsed.size || '',
        condition: parsed.condition || '',
        price: price,
        currency: 'USD',
        total_price: '',
        image_url: imgSrc,
        url: href ? `https://www.vinted.com${href}` : '',
        seller: '',
        favorite_count: 0,
        view_count: 0,
    };
}

const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    maxRequestRetries: 5,
    useSessionPool: true,
    sessionPoolOptions: {
        maxPoolSize: 5,
        sessionOptions: { maxUsageCount: 3 },
    },
    maxConcurrency: 2,
    requestHandlerTimeoutSecs: 120,
    navigationTimeoutSecs: 60,

    // Fingerprint generation for stealth (Chrome)
    browserPoolOptions: {
        useFingerprints: true,
        fingerprintOptions: {
            fingerprintGeneratorOptions: {
                browsers: ['chrome'],
                operatingSystems: ['windows', 'macos'],
                devices: ['desktop'],
            },
        },
    },

    // Pre-navigation hooks for stealth and API interception
    preNavigationHooks: [
        async ({ page, request }) => {
            // Reset captured data for this request
            capturedApiData = [];

            // Intercept API responses for catalog items
            page.on('response', async (response) => {
                const url = response.url();
                if (url.includes('/api/v2/catalog/items') || url.includes('/api/v2/items')) {
                    try {
                        const json = await response.json();
                        if (json.items && Array.isArray(json.items)) {
                            log.info(`Captured ${json.items.length} items from API`);
                            capturedApiData.push(...json.items);
                        }
                    } catch (e) {
                        // Not JSON or failed to parse
                    }
                }
            });

            // Block heavy resources for performance
            await page.route('**/*', (route) => {
                const type = route.request().resourceType();
                const url = route.request().url();

                if (['font', 'media'].includes(type) ||
                    url.includes('google-analytics') ||
                    url.includes('googletagmanager') ||
                    url.includes('facebook') ||
                    url.includes('doubleclick') ||
                    url.includes('pinterest') ||
                    url.includes('adsense') ||
                    url.includes('hotjar')) {
                    return route.abort();
                }
                return route.continue();
            });

            // Stealth: Hide webdriver property and automation indicators
            await page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
                Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
                window.chrome = { runtime: {} };

                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({ state: Notification.permission }) :
                        originalQuery(parameters)
                );
            });
        },
    ],

    async requestHandler({ page, request, crawler: crawlerInstance }) {
        const pageNo = request.userData?.pageNo || 1;
        log.info(`Processing page ${pageNo}: ${request.url}`);

        // Wait for page to load
        await page.waitForLoadState('domcontentloaded');
        await randomDelay(1000, 2000);

        // Handle cookie consent modal if present
        try {
            const acceptBtn = await page.$('button:has-text("Accept all"), button:has-text("Accept")');
            if (acceptBtn) {
                await acceptBtn.click();
                await randomDelay(500, 1000);
            }
        } catch (e) { /* Modal not present */ }

        // Handle region/welcome modal if present
        try {
            const closeBtn = await page.$('button[aria-label="Close"], [data-testid="modal-close"]');
            if (closeBtn) {
                await closeBtn.click();
                await randomDelay(500, 1000);
            }
        } catch (e) { /* Modal not present */ }

        // Wait for network idle to capture API responses
        await page.waitForLoadState('networkidle').catch(() => { });
        await randomDelay(2000, 3000);

        // Scroll to trigger lazy loading and potential API calls
        await page.evaluate(async () => {
            for (let i = 0; i < 3; i++) {
                window.scrollTo(0, document.body.scrollHeight * (i + 1) / 3);
                await new Promise(r => setTimeout(r, 500));
            }
        });
        await randomDelay(1000, 2000);

        let items = [];

        // PRIORITY 1: Use captured API data
        if (capturedApiData.length > 0) {
            log.info(`Using ${capturedApiData.length} items from API interception`);
            items = parseApiItems(capturedApiData);
        }

        // PRIORITY 2: Fall back to DOM extraction
        if (items.length === 0) {
            log.info('No API data captured, falling back to DOM extraction');

            const htmlContent = await page.content();
            const cheerio = await import('cheerio');
            const $ = cheerio.load(htmlContent);

            const productContainers = $('[data-testid^="product-item-id-"], .new-item-box__container');
            log.info(`Found ${productContainers.length} product containers in DOM`);

            productContainers.each((_, el) => {
                const item = parseItemFromDom(el, $);
                if (item.product_id || item.url) {
                    items.push(item);
                }
            });
        }

        // Deduplicate and save
        const newItems = [];
        for (const item of items) {
            const id = item.product_id || item.url;
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

        // Pagination: Queue next page if needed
        if (saved < RESULTS_WANTED && pageNo < MAX_PAGES) {
            const nextPageUrl = new URL(request.url);
            nextPageUrl.searchParams.set('page', String(pageNo + 1));

            log.info(`Queueing page ${pageNo + 1}: ${nextPageUrl.href}`);
            await crawlerInstance.addRequests([{
                url: nextPageUrl.href,
                userData: { pageNo: pageNo + 1 },
            }]);
        }
    },

    failedRequestHandler({ request }, error) {
        if (error.message?.includes('403')) {
            log.warning(`Blocked (403): ${request.url}`);
        } else {
            log.error(`Request ${request.url} failed: ${error.message}`);
        }
    },
});

await crawler.run([{ url: initialUrl, userData: { pageNo: 1 } }]);
log.info(`Scraping completed. Total items saved: ${saved}`);
await Actor.exit();
