// Vinted Scraper - Hybrid approach: Playwright for session, got-scraping for data
import { Actor, log } from 'apify';
import { PlaywrightCrawler, Dataset } from 'crawlee';
import { gotScraping } from 'got-scraping';

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

// Build start URL from parameters
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

// Extract catalog ID from URL
function extractCatalogId(url) {
    const match = url.match(/catalog\/(\d+)/);
    return match ? match[1] : '1904';
}

const initialUrl = buildStartUrl();
const catalogId = extractCatalogId(initialUrl);

log.info(`Starting Vinted scraper with URL: ${initialUrl}`);
log.info(`Catalog ID: ${catalogId}, Target: ${RESULTS_WANTED} results`);

// Create proxy configuration
const proxyConfiguration = await Actor.createProxyConfiguration(proxyConfig || {
    useApifyProxy: true,
    apifyProxyGroups: ['RESIDENTIAL'],
});

let saved = 0;
const seenIds = new Set();
let sessionCookies = '';
let proxyUrl = '';

// Random delay utility
const randomDelay = (min = 500, max = 1500) =>
    new Promise(r => setTimeout(r, min + Math.random() * (max - min)));

// Parse API items
function parseApiItems(items) {
    return items.map(item => ({
        product_id: String(item.id || ''),
        title: item.title || '',
        brand: item.brand_title || item.brand || '',
        size: item.size_title || item.size || '',
        price: item.price || '',
        currency: item.currency || 'USD',
        total_price: item.total_item_price || '',
        condition: item.status || '',
        image_url: item.photo?.url || item.photos?.[0]?.url || '',
        url: item.url ? `https://www.vinted.com${item.url}` : `https://www.vinted.com/items/${item.id}`,
        seller: item.user?.login || '',
        favorite_count: item.favourite_count || 0,
    }));
}

// Parse DOM items fallback
function parseDomItems(html) {
    const items = [];

    // Extract items using regex patterns from the RSC stream
    const itemRegex = /"id":(\d+),"title":"([^"]+)".*?"brand_title":"([^"]*)".*?"size_title":"([^"]*)".*?"price":"([^"]+)"/g;
    let match;

    while ((match = itemRegex.exec(html)) !== null) {
        items.push({
            product_id: match[1],
            title: match[2],
            brand: match[3],
            size: match[4],
            price: match[5],
            currency: 'USD',
            url: `https://www.vinted.com/items/${match[1]}`,
        });
    }

    // Fallback: extract from data-testid elements
    const productIdRegex = /product-item-id-(\d+)/g;
    while ((match = productIdRegex.exec(html)) !== null) {
        if (!items.some(i => i.product_id === match[1])) {
            items.push({
                product_id: match[1],
                url: `https://www.vinted.com/items/${match[1]}`,
            });
        }
    }

    return items;
}

// Fetch data using got-scraping (fast HTTP)
async function fetchWithGotScraping(url, cookies, proxy) {
    const headers = {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache',
        'sec-ch-ua': '"Chromium";v=\"122\", \"Google Chrome\";v=\"122\"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'same-origin',
        'upgrade-insecure-requests': '1',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    };

    if (cookies) {
        headers['cookie'] = cookies;
    }

    const options = {
        headers,
        timeout: { request: 30000 },
        retry: { limit: 3 },
    };

    if (proxy) {
        options.proxyUrl = proxy;
    }

    const response = await gotScraping.get(url, options);
    return response.body;
}

// Fetch API data directly
async function fetchApiData(catalogId, page, cookies, proxy) {
    const apiUrl = `https://www.vinted.com/api/v2/catalog/items?catalog_ids[]=${catalogId}&page=${page}&per_page=24&order=newest_first`;

    const headers = {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.9',
        'sec-ch-ua': '"Chromium";v=\"122\", \"Google Chrome\";v=\"122\"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'x-requested-with': 'XMLHttpRequest',
    };

    if (cookies) {
        headers['cookie'] = cookies;
    }

    const options = {
        headers,
        timeout: { request: 20000 },
        retry: { limit: 2 },
    };

    if (proxy) {
        options.proxyUrl = proxy;
    }

    try {
        const response = await gotScraping.get(apiUrl, options);
        return JSON.parse(response.body);
    } catch (e) {
        log.warning(`API fetch failed: ${e.message}`);
        return null;
    }
}

// STEP 1: Use Playwright to bypass anti-bot and get session cookies
log.info('Step 1: Using Playwright to establish session...');

const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    maxRequestRetries: 3,
    maxConcurrency: 1,
    requestHandlerTimeoutSecs: 90,
    navigationTimeoutSecs: 45,

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

    preNavigationHooks: [
        async ({ page }) => {
            // Block heavy resources
            await page.route('**/*', (route) => {
                const type = route.request().resourceType();
                if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
                    return route.abort();
                }
                return route.continue();
            });

            // Stealth
            await page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
            });
        },
    ],

    async requestHandler({ page, request, proxyInfo }) {
        log.info(`Playwright: Loading ${request.url} to get cookies...`);

        // Wait for page load
        await page.waitForLoadState('domcontentloaded');
        await randomDelay(2000, 3000);

        // Handle cookie consent
        try {
            const acceptBtn = await page.$('button:has-text("Accept all"), button:has-text("Accept")');
            if (acceptBtn) {
                await acceptBtn.click();
                await randomDelay(1000, 1500);
            }
        } catch (e) { /* ignore */ }

        // Handle region modal
        try {
            const closeBtn = await page.$('button[aria-label="Close"]');
            if (closeBtn) {
                await closeBtn.click();
                await randomDelay(500, 1000);
            }
        } catch (e) { /* ignore */ }

        // Wait for content
        await page.waitForLoadState('networkidle').catch(() => { });
        await randomDelay(1000, 2000);

        // Extract cookies
        const cookies = await page.context().cookies();
        sessionCookies = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        log.info(`Got ${cookies.length} cookies from session`);

        // Store proxy URL for got-scraping
        if (proxyInfo) {
            proxyUrl = `http://${proxyInfo.username}:${proxyInfo.password}@${proxyInfo.hostname}:${proxyInfo.port}`;
        }

        // Try to extract initial data from page
        const html = await page.content();
        const initialItems = parseDomItems(html);

        if (initialItems.length > 0) {
            log.info(`Extracted ${initialItems.length} items from initial page`);
            const newItems = initialItems.filter(item => {
                if (seenIds.has(item.product_id)) return false;
                seenIds.add(item.product_id);
                return true;
            }).slice(0, RESULTS_WANTED);

            if (newItems.length > 0) {
                await Dataset.pushData(newItems);
                saved += newItems.length;
                log.info(`Saved ${newItems.length} items. Total: ${saved}/${RESULTS_WANTED}`);
            }
        }
    },

    failedRequestHandler({ request }, error) {
        log.error(`Playwright failed: ${error.message}`);
    },
});

// Run Playwright once to get session
await crawler.run([{ url: initialUrl }]);

// STEP 2: Use got-scraping for fast data fetching
if (saved < RESULTS_WANTED && sessionCookies) {
    log.info('Step 2: Using got-scraping for fast data fetching...');

    for (let page = 1; page <= MAX_PAGES && saved < RESULTS_WANTED; page++) {
        await randomDelay(1500, 3000);

        // Try API first (fastest)
        log.info(`Fetching page ${page} via API...`);
        const apiData = await fetchApiData(catalogId, page, sessionCookies, proxyUrl);

        if (apiData && apiData.items && apiData.items.length > 0) {
            log.info(`API returned ${apiData.items.length} items`);
            const items = parseApiItems(apiData.items);

            const newItems = items.filter(item => {
                if (seenIds.has(item.product_id)) return false;
                seenIds.add(item.product_id);
                return true;
            });

            const toSave = newItems.slice(0, RESULTS_WANTED - saved);
            if (toSave.length > 0) {
                await Dataset.pushData(toSave);
                saved += toSave.length;
                log.info(`Saved ${toSave.length} items. Total: ${saved}/${RESULTS_WANTED}`);
            }

            // Check if more pages available
            if (!apiData.pagination || page >= apiData.pagination.total_pages) {
                log.info('No more pages available');
                break;
            }
        } else {
            // Fallback to HTML fetch
            log.info(`API failed, fetching page ${page} via HTML...`);
            const pageUrl = new URL(initialUrl);
            pageUrl.searchParams.set('page', String(page));

            try {
                const html = await fetchWithGotScraping(pageUrl.href, sessionCookies, proxyUrl);
                const items = parseDomItems(html);

                if (items.length === 0) {
                    log.warning('No items found in HTML, might be blocked');
                    break;
                }

                const newItems = items.filter(item => {
                    if (seenIds.has(item.product_id)) return false;
                    seenIds.add(item.product_id);
                    return true;
                });

                const toSave = newItems.slice(0, RESULTS_WANTED - saved);
                if (toSave.length > 0) {
                    await Dataset.pushData(toSave);
                    saved += toSave.length;
                    log.info(`Saved ${toSave.length} items from HTML. Total: ${saved}/${RESULTS_WANTED}`);
                }
            } catch (e) {
                log.error(`HTML fetch failed: ${e.message}`);
                break;
            }
        }
    }
}

log.info(`Scraping completed. Total items saved: ${saved}`);
await Actor.exit();
