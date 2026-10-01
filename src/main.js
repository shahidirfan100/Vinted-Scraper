import { Actor, log } from 'apify';
import { Impit } from 'impit';

const CATEGORY_MAP = {
    women: { id: '1904', slug: '1904-women' },
    men: { id: '5', slug: '5-men' },
    kids: { id: '47', slug: '47-kids' },
    home: { id: '2000', slug: '2000-home' },
};

function toPositiveInt(value, fallback) {
    return Number.isFinite(+value) ? Math.max(1, +value) : fallback;
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function jitterBackoff(attempt) {
    const base = 800 * 2 ** (attempt - 1);
    return base + Math.floor(Math.random() * 600);
}

function buildStartUrl({ startUrl, keyword, category, minPrice, maxPrice }) {
    if (startUrl) {
        try {
            return new URL(startUrl).href;
        } catch {
            log.warning(`Invalid startUrl "${startUrl}". Falling back to category URL.`);
        }
    }

    const normalizedCategory = String(category || 'women').toLowerCase();
    const categoryEntry = CATEGORY_MAP[normalizedCategory] || CATEGORY_MAP.women;
    const url = new URL(`https://www.vinted.com/catalog/${categoryEntry.slug}`);

    if (keyword) url.searchParams.set('search_text', keyword);
    if (minPrice != null) url.searchParams.set('price_from', String(minPrice));
    if (maxPrice != null) url.searchParams.set('price_to', String(maxPrice));

    return url.href;
}

// Vinted's /api/v2/catalog/items JSON endpoint was retired in 2026 and now returns 404.
// The catalog page still server-renders the full item list inside the Next.js RSC payload,
// which is streamed through self.__next_f.push([1, "<chunk>"]) calls.
function extractFlightPayload(html) {
    const chunks = [];
    const re = /self\.__next_f\.push\(\[1,\s*("(?:[^"\\]|\\.)*")\s*\]\)/g;
    let match;
    while ((match = re.exec(html)) !== null) {
        try {
            chunks.push(JSON.parse(match[1]));
        } catch {
            // Ignore malformed flight chunk and keep streaming.
        }
    }
    return chunks.join('');
}

function readJsonAt(text, start) {
    const first = text[start];
    if (first !== '[' && first !== '{') return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
        const char = text[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"') {
            inString = true;
            continue;
        }
        if (char === '[' || char === '{') {
            depth++;
        } else if (char === ']' || char === '}') {
            depth--;
            if (depth === 0) {
                try {
                    return { value: JSON.parse(text.slice(start, i + 1)), end: i + 1 };
                } catch {
                    return null;
                }
            }
        }
    }
    return null;
}

function parseCatalogPage(html) {
    const flight = extractFlightPayload(html);

    const itemsKey = '"items":{"items":';
    const itemsIndex = flight.indexOf(itemsKey);
    if (itemsIndex < 0) {
        return { items: [], pagination: null };
    }

    const items = readJsonAt(flight, itemsIndex + itemsKey.length)?.value || [];

    let pagination = null;
    const paginationKey = '"pagination":';
    const paginationIndex = flight.indexOf(paginationKey, itemsIndex);
    if (paginationIndex >= 0) {
        pagination = readJsonAt(flight, paginationIndex + paginationKey.length)?.value || null;
    }

    return { items, pagination };
}

function extractBrand(itemBox) {
    return String(itemBox?.firstLine || '').trim();
}

function extractSize(itemBox) {
    const secondLine = String(itemBox?.secondLine || '').trim();
    if (!secondLine) return 'Not specified';

    if (secondLine.includes('·')) {
        const [candidate] = secondLine.split('·').map((part) => part.trim());
        if (candidate) return candidate;
    }

    return secondLine;
}

function extractCondition(itemBox) {
    const secondLine = String(itemBox?.secondLine || '').trim();
    if (!secondLine) return '';

    if (secondLine.includes('·')) {
        const parts = secondLine
            .split('·')
            .map((part) => part.trim())
            .filter(Boolean);
        return parts.at(-1) || '';
    }

    return secondLine;
}

function normalizeItem(productItem, { origin, page }) {
    if (!productItem || productItem.id == null) return null;

    const itemBox = productItem.itemBox || {};
    const photos = Array.isArray(productItem.photos) ? productItem.photos : [];
    const price = productItem.price || {};
    const totalPrice = productItem.totalItemPrice || {};
    const serviceFee = productItem.serviceFee || {};
    const user = productItem.user || {};

    return {
        product_id: String(productItem.id),
        title: productItem.title || 'Unknown',
        brand: extractBrand(itemBox),
        size: extractSize(itemBox),
        condition: extractCondition(itemBox),
        price: price.amount || '',
        total_price: totalPrice.amount || '',
        currency: price.currencyCode || 'USD',
        service_fee: serviceFee.amount || '',
        image_url: productItem.thumbnailUrl || photos[0]?.url || '',
        image_full_url: photos[0]?.url || productItem.thumbnailUrl || '',
        image_dominant_color: productItem.dominantColor || '',
        image_dominant_color_opaque: '',
        image_count: photos.length,
        url: productItem.url ? `${origin}${productItem.url}` : '',
        favorite_count: Number(productItem.favouriteCount || 0),
        view_count: 0,
        is_favourite: Boolean(productItem.isFavourite),
        is_visible: true,
        is_promoted: Boolean(productItem.isPromoted),
        content_source: '',
        seller_id: user.id != null ? String(user.id) : '',
        seller_username: user.login || '',
        seller_profile_url: user.profileUrl || (user.id != null ? `${origin}/member/${user.id}` : ''),
        seller_avatar_url: user.photo?.url || user.thumbnailUrl || '',
        seller_is_business: Boolean(user.isBusiness),
        show_1st_time_discount: Boolean(productItem.priceWithDiscount),
        search_score: null,
        matched_queries: [],
        page,
    };
}

async function fetchCatalogPage({ client, pageUrl }) {
    try {
        const response = await client.fetch(pageUrl, { timeout: 60000 });
        const html = await response.text();
        return { statusCode: response.status, html };
    } catch (error) {
        log.warning(`Network error on ${pageUrl}: ${error.message}`);
        return { statusCode: 0, html: '' };
    }
}

await Actor.main(async () => {
    const input = (await Actor.getInput()) || {};
    const {
        startUrl,
        keyword = '',
        category = 'women',
        minPrice: minPriceRaw,
        maxPrice: maxPriceRaw,
        results_wanted: resultsWantedRaw = 20,
        max_pages: maxPagesRaw = 50,
        proxyConfiguration: proxyConfig,
    } = input;

    const resultsWanted = toPositiveInt(resultsWantedRaw, 20);
    const maxPages = toPositiveInt(maxPagesRaw, 50);

    let minPrice = minPriceRaw;
    let maxPrice = maxPriceRaw;
    if (minPrice != null && maxPrice != null && Number(minPrice) > Number(maxPrice)) {
        log.warning(`Invalid price range: minPrice (${minPrice}) > maxPrice (${maxPrice}). Ignoring price filters.`);
        minPrice = undefined;
        maxPrice = undefined;
    }

    if (!startUrl && !keyword) {
        log.warning('No startUrl or keyword provided. Using default category.');
    }

    const initialUrl = buildStartUrl({
        startUrl,
        keyword: String(keyword || '').trim(),
        category,
        minPrice,
        maxPrice,
    });
    const { origin } = new URL(initialUrl);

    const proxyConfiguration = await Actor.createProxyConfiguration(proxyConfig || { useApifyProxy: false });
    const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl() : undefined;

    // One impit instance: reuses the impersonated Chrome profile and connection pool.
    // Chrome is verified to negotiate TLS successfully with Vinted (unlike chrome100-chrome116).
    const client = new Impit({
        browser: 'chrome',
        ...(proxyUrl && { proxyUrl }),
    });

    log.info(`Starting Vinted catalog scraper: ${initialUrl}`);
    log.info(`Target: ${resultsWanted} results, max ${maxPages} pages`);

    let saved = 0;
    const seenIds = new Set();

    for (let pageNo = 1; pageNo <= maxPages && saved < resultsWanted; pageNo++) {
        const pageUrl = new URL(initialUrl);
        pageUrl.searchParams.set('page', String(pageNo));

        let pageData = null;

        for (let attempt = 1; attempt <= 4; attempt++) {
            const { statusCode, html } = await fetchCatalogPage({ client, pageUrl: pageUrl.href });

            if (statusCode === 200) {
                pageData = parseCatalogPage(html);
                break;
            }

            const waitMs = jitterBackoff(attempt);
            log.warning(`Unexpected status ${statusCode} on page ${pageNo}, retry ${attempt}/4 in ${waitMs}ms.`);
            await sleep(waitMs);
        }

        if (!pageData) {
            log.warning(`Failed to fetch page ${pageNo} after retries. Skipping.`);
            continue;
        }

        const { items } = pageData;
        const totalPages = Number(pageData.pagination?.total_pages || 0);
        if (pageNo === 1) {
            log.info(`Pagination: ${totalPages || 'unknown'} total pages.`);
        }
        log.info(`Page ${pageNo}: received ${items.length} raw items`);

        if (items.length === 0) {
            log.info(`No items on page ${pageNo}, stopping.`);
            break;
        }

        const outputItems = [];
        for (const entry of items) {
            const normalized = normalizeItem(entry?.productItem, { origin, page: pageNo });
            if (!normalized) continue;
            if (seenIds.has(normalized.product_id)) continue;

            seenIds.add(normalized.product_id);
            outputItems.push(normalized);
            saved++;

            if (saved >= resultsWanted) break;
        }

        if (outputItems.length > 0) {
            await Actor.pushData(outputItems);
        }

        log.info(`Saved ${outputItems.length} items from page ${pageNo}. Total: ${saved}/${resultsWanted}`);

        if (totalPages > 0 && pageNo >= totalPages) {
            log.info(`Reached final page (${totalPages}).`);
            break;
        }
    }

    log.info(`Completed. Total items saved: ${saved}`);
});
