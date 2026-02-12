import crypto from 'node:crypto';
import { Actor, log } from 'apify';
import { gotScraping } from 'crawlee';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const API_BASE = 'https://www.vinted.com/api/v2/catalog/items';

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
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitterBackoff(attempt) {
    const base = 800 * (2 ** (attempt - 1));
    return base + Math.floor(Math.random() * 600);
}

function buildStartUrl({ startUrl, keyword, category, minPrice, maxPrice }) {
    if (startUrl) return startUrl;

    const normalizedCategory = String(category || 'women').toLowerCase();
    const categoryEntry = CATEGORY_MAP[normalizedCategory] || CATEGORY_MAP.women;
    const url = new URL(`https://www.vinted.com/catalog/${categoryEntry.slug}`);

    if (keyword) url.searchParams.set('search_text', keyword);
    if (minPrice != null) url.searchParams.set('price_from', String(minPrice));
    if (maxPrice != null) url.searchParams.set('price_to', String(maxPrice));

    return url.href;
}

function normalizeApiParams(initialUrl, { keyword, minPrice, maxPrice }) {
    const url = new URL(initialUrl);
    const params = new URLSearchParams(url.searchParams);
    params.delete('page');
    params.delete('per_page');

    const catalogIds = [
        ...params.getAll('catalog[]'),
        ...params.getAll('catalog_ids[]'),
    ].filter(Boolean);
    if (catalogIds.length > 0) params.set('catalog_ids', catalogIds.join(','));
    params.delete('catalog[]');
    params.delete('catalog_ids[]');

    const pathCatalogId = url.pathname.match(/\/catalog\/(\d+)/)?.[1];
    if (!params.get('catalog_ids') && pathCatalogId) params.set('catalog_ids', pathCatalogId);

    if (keyword) params.set('search_text', keyword);
    if (minPrice != null) params.set('price_from', String(minPrice));
    if (maxPrice != null) params.set('price_to', String(maxPrice));

    return params;
}

function updateCookieStore(cookieStore, setCookieHeader) {
    const setCookies = Array.isArray(setCookieHeader) ? setCookieHeader : (setCookieHeader ? [setCookieHeader] : []);
    for (const rawCookie of setCookies) {
        const pair = rawCookie.split(';', 1)[0];
        const separatorIndex = pair.indexOf('=');
        if (separatorIndex <= 0) continue;
        const name = pair.slice(0, separatorIndex).trim();
        const value = pair.slice(separatorIndex + 1).trim();
        if (!name) continue;
        cookieStore.set(name, value);
    }
}

function buildCookieHeader(cookieStore) {
    return [...cookieStore.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

function extractSize(item) {
    const direct = String(item.size_title || '').trim();
    if (direct) return direct;

    const secondLine = String(item.item_box?.second_line || '').trim();
    if (!secondLine) return 'Not specified';

    if (secondLine.includes('·')) {
        const [candidate] = secondLine.split('·').map((part) => part.trim());
        if (candidate) return candidate;
    }

    if (secondLine !== String(item.status || '').trim()) return secondLine;
    return 'Not specified';
}

function extractCondition(item) {
    const direct = String(item.status || '').trim();
    if (direct) return direct;

    const secondLine = String(item.item_box?.second_line || '').trim();
    if (!secondLine) return '';

    if (secondLine.includes('·')) {
        const parts = secondLine.split('·').map((part) => part.trim()).filter(Boolean);
        return parts.at(-1) || '';
    }

    return secondLine;
}

async function createApiSession({ proxyConfiguration, startUrl }) {
    const proxySessionId = crypto.randomUUID();
    const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl(proxySessionId) : undefined;
    const cookieStore = new Map();

    const response = await gotScraping({
        url: startUrl,
        proxyUrl,
        throwHttpErrors: false,
        timeout: { request: 60000 },
        headers: {
            'user-agent': USER_AGENT,
            'accept-language': 'en-US,en;q=0.9',
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
    });

    updateCookieStore(cookieStore, response.headers['set-cookie']);

    if (response.statusCode >= 400) {
        throw new Error(`Session bootstrap failed with status ${response.statusCode}`);
    }

    const anonId = cookieStore.get('anon_id') || crypto.randomUUID();
    const accessToken = cookieStore.get('access_token_web');

    if (!accessToken) {
        const responseHint = String(response.body || '').slice(0, 200).replace(/\s+/g, ' ');
        throw new Error(`Missing access_token_web after bootstrap request. Status: ${response.statusCode}. Response hint: ${responseHint}`);
    }

    return {
        proxyUrl,
        cookieStore,
        anonId,
        accessToken,
        csrfToken: crypto.randomUUID(),
    };
}

async function requestCatalogPage({
    session,
    pageNo,
    perPage,
    startUrl,
    apiParams,
}) {
    const query = new URLSearchParams(apiParams);
    query.set('page', String(pageNo));
    query.set('per_page', String(perPage));

    const response = await gotScraping({
        url: `${API_BASE}?${query.toString()}`,
        proxyUrl: session.proxyUrl,
        throwHttpErrors: false,
        timeout: { request: 60000 },
        headers: {
            'user-agent': USER_AGENT,
            'accept-language': 'en-US,en;q=0.9',
            accept: 'application/json, text/plain, */*',
            referer: startUrl,
            cookie: buildCookieHeader(session.cookieStore),
            'x-anon-id': session.anonId,
            'x-csrf-token': session.csrfToken,
            authorization: `Bearer ${session.accessToken}`,
        },
    });

    updateCookieStore(session.cookieStore, response.headers['set-cookie']);
    return response;
}

function normalizeItem(item) {
    const id = item?.id != null ? String(item.id) : '';
    if (!id) return null;

    const path = item.path || '';
    const fullUrl = item.url || (path ? `https://www.vinted.com${path}` : '');
    const priceCurrency = item.price?.currency_code || item.total_item_price?.currency_code || 'USD';

    return {
        product_id: id,
        title: item.title || item.brand_title || 'Unknown',
        brand: item.brand_title || '',
        size: extractSize(item),
        condition: extractCondition(item),
        price: item.price?.amount || '',
        total_price: item.total_item_price?.amount || '',
        currency: priceCurrency,
        service_fee: item.service_fee?.amount || '',
        image_url: item.photo?.url || item.photos?.[0]?.url || '',
        image_full_url: item.photo?.full_size_url || item.photo?.url || item.photos?.[0]?.full_size_url || '',
        url: fullUrl,
        favorite_count: Number(item.favourite_count || 0),
        view_count: Number(item.view_count || 0),
        is_favourite: Boolean(item.is_favourite),
        is_visible: Boolean(item.is_visible),
        is_promoted: Boolean(item.promoted),
        content_source: item.content_source || '',
        seller_id: item.user?.id != null ? String(item.user.id) : '',
        seller_username: item.user?.login || '',
        seller_profile_url: item.user?.profile_url || '',
        seller_is_business: Boolean(item.user?.business),
        search_score: item.search_tracking_params?.score ?? null,
        matched_queries: item.search_tracking_params?.matched_queries || [],
    };
}

await Actor.main(async () => {
    const input = (await Actor.getInput()) || {};
    const {
        startUrl,
        keyword = '',
        category = 'women',
        minPrice,
        maxPrice,
        results_wanted: resultsWantedRaw = 20,
        max_pages: maxPagesRaw = 50,
        proxyConfiguration: proxyConfig,
    } = input;

    const resultsWanted = toPositiveInt(resultsWantedRaw, 20);
    const maxPages = toPositiveInt(maxPagesRaw, 50);
    const perPage = 96;

    if (minPrice != null && maxPrice != null && Number(minPrice) > Number(maxPrice)) {
        throw new Error(`Invalid price range: minPrice (${minPrice}) is greater than maxPrice (${maxPrice}).`);
    }

    const initialUrl = buildStartUrl({
        startUrl,
        keyword: String(keyword || '').trim(),
        category,
        minPrice,
        maxPrice,
    });
    const apiParams = normalizeApiParams(initialUrl, {
        keyword: String(keyword || '').trim(),
        minPrice,
        maxPrice,
    });

    const defaultProxyGroups = ['RESIDENTIAL'];
    const proxyConfiguration = await Actor.createProxyConfiguration(proxyConfig || {
        useApifyProxy: true,
        apifyProxyGroups: defaultProxyGroups,
    });

    log.info(`Starting Vinted API scraper: ${initialUrl}`);
    log.info(`Target: ${resultsWanted} results, max ${maxPages} pages, per page ${perPage}`);

    let session = await createApiSession({ proxyConfiguration, startUrl: initialUrl });
    let saved = 0;
    const seenIds = new Set();

    for (let pageNo = 1; pageNo <= maxPages && saved < resultsWanted; pageNo++) {
        let pageData = null;

        for (let attempt = 1; attempt <= 4; attempt++) {
            const response = await requestCatalogPage({
                session,
                pageNo,
                perPage,
                startUrl: initialUrl,
                apiParams,
            });

            if (response.statusCode === 200) {
                try {
                    pageData = JSON.parse(response.body);
                    break;
                } catch (error) {
                    throw new Error(`Failed to parse JSON from catalog API: ${error.message}`);
                }
            }

            if (response.statusCode === 401 || response.statusCode === 403) {
                log.warning(`Auth/session rejected on page ${pageNo} (status ${response.statusCode}). Refreshing session.`);
                session = await createApiSession({ proxyConfiguration, startUrl: initialUrl });
            } else if (response.statusCode === 429 || response.statusCode >= 500) {
                const waitMs = jitterBackoff(attempt);
                log.warning(`Transient error ${response.statusCode} on page ${pageNo}, retry ${attempt}/4 in ${waitMs}ms.`);
                await sleep(waitMs);
            } else {
                throw new Error(`Catalog API returned status ${response.statusCode}: ${response.body?.slice(0, 300) || 'No body'}`);
            }
        }

        if (!pageData) {
            throw new Error(`Failed to fetch page ${pageNo} after retries.`);
        }

        const items = Array.isArray(pageData.items) ? pageData.items : [];
        const totalPages = Number(pageData.pagination?.total_pages || 0);
        if (pageNo === 1) {
            log.info(`Pagination: API reports ${totalPages || 'unknown'} total pages.`);
        }
        log.info(`API page ${pageNo}: received ${items.length} raw items`);

        if (items.length === 0) {
            log.info(`No items on page ${pageNo}, stopping.`);
            break;
        }

        const outputItems = [];
        for (const item of items) {
            const normalized = normalizeItem(item);
            if (!normalized) continue;
            if (seenIds.has(normalized.product_id)) continue;

            normalized.page = pageNo;

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
            log.info(`Reached final API page (${totalPages}).`);
            break;
        }
    }

    log.info(`Completed. Total items saved: ${saved}`);
});
