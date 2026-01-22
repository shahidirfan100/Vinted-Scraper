// Vinted Scraper - Lightweight Playwright with correct selectors
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
log.info(`Starting Vinted scraper: ${initialUrl}`);
log.info(`Target: ${RESULTS_WANTED} results, max ${MAX_PAGES} pages`);

// Create proxy configuration
const proxyConfiguration = await Actor.createProxyConfiguration(proxyConfig || {
    useApifyProxy: true,
    apifyProxyGroups: ['RESIDENTIAL'],
});

let saved = 0;
const seenIds = new Set();

const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    maxRequestRetries: 3,
    useSessionPool: true,
    sessionPoolOptions: {
        maxPoolSize: 3,
        sessionOptions: { maxUsageCount: 5 },
    },
    maxConcurrency: 1,
    requestHandlerTimeoutSecs: 90,
    navigationTimeoutSecs: 45,

    // Stealth fingerprints
    browserPoolOptions: {
        useFingerprints: true,
        fingerprintOptions: {
            fingerprintGeneratorOptions: {
                browsers: ['chrome'],
                operatingSystems: ['windows'],
                devices: ['desktop'],
            },
        },
    },

    // Pre-navigation: Block resources & add stealth
    preNavigationHooks: [
        async ({ page }) => {
            // Block heavy resources for speed
            await page.route('**/*', (route) => {
                const type = route.request().resourceType();
                const url = route.request().url();

                if (['image', 'font', 'media'].includes(type) ||
                    url.includes('google-analytics') ||
                    url.includes('googletagmanager') ||
                    url.includes('facebook') ||
                    url.includes('hotjar') ||
                    url.includes('adsense')) {
                    return route.abort();
                }
                return route.continue();
            });

            // Stealth scripts
            await page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
                Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
                window.chrome = { runtime: {} };
            });
        },
    ],

    async requestHandler({ page, request, crawler: crawlerInstance }) {
        const pageNo = request.userData?.pageNo || 1;
        log.info(`Processing page ${pageNo}: ${request.url}`);

        // Wait for page load
        await page.waitForLoadState('domcontentloaded');

        // Handle cookie consent modal
        try {
            const acceptBtn = page.locator('button:has-text("Accept all"), button:has-text("Accept")').first();
            if (await acceptBtn.isVisible({ timeout: 3000 })) {
                await acceptBtn.click();
                await page.waitForTimeout(500);
            }
        } catch (e) { /* Modal not present */ }

        // Handle region/welcome modal
        try {
            const closeBtn = page.locator('button[aria-label="Close"]').first();
            if (await closeBtn.isVisible({ timeout: 2000 })) {
                await closeBtn.click();
                await page.waitForTimeout(500);
            }
        } catch (e) { /* Modal not present */ }

        // Wait for products to load - use correct selector
        await page.waitForSelector('[data-testid^="product-item-id-"]:not([data-testid*="--"])', { timeout: 15000 }).catch(() => { });
        await page.waitForTimeout(1500);

        // Scroll to load lazy content
        await page.evaluate(async () => {
            for (let i = 0; i < 3; i++) {
                window.scrollTo(0, document.body.scrollHeight * (i + 1) / 3);
                await new Promise(r => setTimeout(r, 300));
            }
            window.scrollTo(0, 0);
        });
        await page.waitForTimeout(1000);

        // Extract all product data from DOM using CORRECT selectors
        const items = await page.evaluate(() => {
            const products = [];

            // CORRECT SELECTOR: Only top-level containers, exclude nested elements with --
            const containers = document.querySelectorAll('[data-testid^="product-item-id-"]:not([data-testid*="--"])');

            containers.forEach((container) => {
                try {
                    // Get product ID from data-testid
                    const testId = container.getAttribute('data-testid') || '';
                    const productId = testId.replace('product-item-id-', '');

                    if (!productId || productId.includes('--')) return; // Skip nested elements

                    // Get link with href containing /items/
                    const link = container.querySelector('a[href*="/items/"]');
                    const href = link?.getAttribute('href') || '';
                    const url = href.startsWith('http') ? href : (href ? `https://www.vinted.com${href}` : '');

                    // Get title from link's title attribute
                    // Format: "Product name, brand: X, condition: Y, $price, $total includes Buyer Protection"
                    const titleAttr = link?.getAttribute('title') || '';

                    // Parse title from title attribute (everything before "brand:" or first comma)
                    let title = '';
                    const titleMatch = titleAttr.match(/^([^,]+)/);
                    if (titleMatch) {
                        title = titleMatch[1].trim();
                    }

                    // Get price from price-text element
                    const priceEl = container.querySelector('[data-testid*="price-text"]');
                    let price = priceEl?.textContent?.trim() || '';
                    price = price.replace('$', '').trim();

                    // Get brand from description-title
                    const brandEl = container.querySelector('[data-testid*="description-title"]');
                    const brand = brandEl?.textContent?.trim() || '';

                    // Get size and condition from description-subtitle
                    // Format: "S / US 4-6 · Very good" or just "Very good"
                    const subtitleEl = container.querySelector('[data-testid*="description-subtitle"]');
                    const subtitleText = subtitleEl?.textContent?.trim() || '';

                    let size = '';
                    let condition = '';

                    if (subtitleText.includes('·')) {
                        const parts = subtitleText.split('·').map(p => p.trim());
                        size = parts[0] || '';
                        condition = parts[1] || '';
                    } else {
                        // No dot separator - could be just condition or just size
                        // Usually it's condition if it matches known conditions
                        const knownConditions = ['New with tags', 'New without tags', 'Very good', 'Good', 'Satisfactory'];
                        if (knownConditions.some(c => subtitleText.toLowerCase().includes(c.toLowerCase()))) {
                            condition = subtitleText;
                        } else {
                            size = subtitleText;
                        }
                    }

                    // Get image URL
                    const imgEl = container.querySelector('img');
                    const imageUrl = imgEl?.src || imgEl?.getAttribute('data-src') || '';

                    // Get favorite count if available
                    const favEl = container.querySelector('[data-testid*="favourite"] span, [data-testid*="favourite"]');
                    let favoriteCount = 0;
                    if (favEl) {
                        const favText = favEl.textContent?.trim() || '';
                        const favMatch = favText.match(/\d+/);
                        if (favMatch) favoriteCount = parseInt(favMatch[0], 10);
                    }

                    products.push({
                        product_id: productId,
                        title: title || brand || 'Unknown',
                        brand: brand,
                        size: size,
                        condition: condition,
                        price: price,
                        currency: 'USD',
                        image_url: imageUrl,
                        url: url,
                        favorite_count: favoriteCount,
                    });
                } catch (e) {
                    // Skip problematic items
                }
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

            log.info(`Queueing page ${pageNo + 1}`);
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
