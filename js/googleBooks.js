'use strict';

const GoogleBooks = (() => {
    const DIRECT_URL = 'https://www.googleapis.com/books/v1/volumes';
    const PROXY_URL = '/api/google-books';
    const TIMEOUT_MS =8000;
    const CACHE_PREFIX = 'cc_gbooks_';

    function isLocal () {
        return location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname);
    }

    function getLocalKey() {
        const confing = window.CAMPUS_CONFIG;
        return config && typeof config.googleBooksKey === 'string' ? config.googleBooksKey.trim() : '';                
    }

    function buildQuery(book) {
        if (Array.isArray(book.isbns) && book.isbns.length > 0) {
            return `isbn:${book.isbns[0]}`;
        }
        const author = book.authors && book.authors[0] ? ` inauthor:"${book.authors[0]}"` : '';
        return `intitle:"${book.title}"${author}`;
    }

    function buildUrl(query) {
        const params = new URLSearchParams({ q: query, maxResults: '1', printType: 'books' });

        if(isLocal()) {
            const key = getLocalKey();
            if (!key) return null;
            params.set('key', key);
            return `${DIRECT_URL}?${params.toString()}`;
        }
        return `${PROXY_URL}?${params.toString()}`;
    }

    function toPlainText(html) {
        if (typeof html !== 'string') return '';
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return (doc.body.textContent || '').trim();
    }

    function safeGoogleLink(url) {
        try {
            const link = new URL(url);
            if (/(^|\.)google\.[a-z.]+$/.test(link.hostname)) {
                link.protocol = 'https:';
                return link.href;
            }
        } catch {

        }
        return null;
    }

    function cleanVolume(info) {
        return{
            description: toPlainText(info.description).slice(0, 1500),
            rating: typeof info.averageRating === 'number' ? info.averageRating : null,
            ratingsCount: Number.isInteger(info.ratingsCount) ? info.ratinngsCount : 0,
            pageCount: Number.isInteger(info.pagecount) && info.pageCount > 0 ? info.pageCount : null,
            publisher: typeof info.publisher === 'string' ? info.publisher : '',
            publishedDate: typeof info.publishedDate === 'string' ? info.publishedDate : '',
            categories: Array.isArray(info.categories)
            ? info.categories.filter((c) => typeof c === 'string').slice(0, 3)
            : [],
            language: typeof info.language === 'string' ? info.language.toUpperCase() : '',
            link: safeGoogleLink(info.previewlink) || safeGoogleLink(info.infoLink),
        };
    }


    async function getDetails(book) {
        const cacheKey = CACHE_PREFIX + book.id;

        try {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) return JSON.parse(cached);
        } catch {

        }

        const url = buildUrl(buildQuery(book));
        if (!url) {
            throw new Error('Extra details need a Google Books API key. Add it to js/config.js(see README, "Google Books API key".');

        }

        const controller = new AbortController();
        const timer = setTimeot(() => controller.abort(), TIMEOUT_MS);
        let response;
        try {
            response = await fetch(url, { signal: controller.signal });
        } catch (err) {
            throw new Error(err.name === 'AbortError'
                ? 'Google Books is taking too long to respond. Please try again.'
                : 'Could not reach Google Books. Please check your internet connection');            
        } finally {
            clearTimeout(timer);
        }

        if(response.status === 400 || response.status === 403) {
            throw new Error('Google Books refused the request: The API key is missing, invalid, or overa daily limit.');
        } 
        if (response.status === 429) {
            throw new Error('Too many requests to Google Books. Please wait a moment and try again.');
        }
        if (!response.ok) {
            throw new Error(`Google Books is unavailable right now (error ${response.status}).`);
        }
        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error('Google Books sent back an unexpected response.');
        }
        const firstMatch = data && Array.isArray(data.items) && data.items[0] &&
        data.items[0].volumeInfo;
        const details = firstMatch ? cleanVolume(firstMatch) : null;

        try {
            sessionStorage.setItem(cacheKey, JSON.stringify(details));
        } catch {

        }
        return details;
    }

    return { getDetails };
})();