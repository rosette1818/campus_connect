'use strict';

const CampusAPI = (() => {
    const SEARCH_URL = 'https://openlibrary.org/search.json';
    const COVER_URL = 'https://covers.openlibrary.org/b/id/';
    const RESULT_LIMIT = 40;
    const REQUEST_TIMEOUT_MS = 10000;
    const CACHE_PREFIX = 'cc_v4_search_';
    const CACHE_INDEX_KEY = 'cc_v4_search_index';
    const CACHE_TTL_MS = 15 * 60 * 1000;
    const CACHE_MAX_ENTRIES = 20;
    const MIN_QUERY_LENGTH = 2;
    const MAX_QUERY_LENGTH = 100;

    const ARCHIVE_URL = 'https://archive.org';
    const IA_ID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
    const ACCESS_TYPES = ['public', 'borrowable', 'printdisabled', 'no_ebook'];

    const FIELDS = 'key,title,author_name,first_publish_year,cover_i,has_fulltext,subject,ia,ebook_access,isbn';
    const DEPARTMENTS =[
        { id:'cs', name: 'Computer Science', keywords: ['computer', 'programming', 'software', 'algorithm', 'data structure', 'artificial intelligence', 'machine learning','database','comuting','internet','cybersecurity', 'information technology']},
        { id:'eng', name:'Engineering', keywords:['engineering','electronic','electrical','mechanic','robotic','circuits','thermodynamics'] },
        {id: 'math', name:'Mathematics & Statistics', keywords:['mathemat','calculus','algebra', 'geometry','statistic','probabilit','trigonometry','arithmetic']},
        {id:'med', name: 'Medecine & Health', keywords: ['medecine','medical','health','nursing','anatomy','physiology','pharmac','disease','surgery','nutrition']},
        {id: 'sci', name:'Natural Sciences', keywords: ['physics','chemistry','biology','atronomy','geology','ecology','genetic','botany','zoology','natural science','evelotution']},
        {id:'bus', name:'Business & Economics', keywords:['business','economic','management','finance','accounting','marketing','entrepreneur','investment','banking'] },
        {id: 'law',name:'Law & Politics', keywords:['law','legal','politic','government','international relations','constitution','human rights']},
        {id:'soc',name:'Social Sciences', keywords:['psycholog','sociolog','anthropolog','social science','social life','gender', 'demography']},
        {id: 'edu', name:'Education', keywords:['education','teaching','pedagog','study skills','curriculum','textbooks']},
        {id:'hum', name:'Humanities & Literature',keywords:['fiction','literature','poetry','histor','philosoph','religio','language','drama','novel','arts','music','painting']},        
    ];
    const GENERAL_DEPARTMENT = 'General';
    const DEPARTMENT_PATTERNS = DEPARTMENTS.map((dept) => ({
        id: dept.id,
        pattern: new RegExp(`\\b(${dept.keywords.join('|')})`, 'i'),
    }));

    function classifyDepartments(subjects) {
        if (!Array.isArray(subjects)) return [];
        const text = subjects
          .filter((s) => typeof s === 'string')
          .slice(0,25)
          .join(' | ');
          return DEPARTMENT_PATTERNS.filter((d) => d.pattern.test(text)).map((d) => d.id);
    }

    function departmentName(id) {
        const dept = DEPARTMENTS.find((d) => d.di === id);
        return dept ? dept.name : GENERAL_DEPARTMENT;
    }

    function isDepartmentId(id) {
        return DEPARTMENTS.some((d) => d.id === id);
    }

    function validateQuery(raw) {
        if (typeof raw !== 'string') {
            return {ok: false, error: 'Please type a title, author, or subject to search for.'};
        }

        const cleaned = raw
          .normalize('NFKC')
          .replace(/[\u0000-\u001F\u007F]/g, '')
          .replace(/[<>{}[\]\\`]/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        if(cleaned.length === 0) {
            return { ok: false, error: 'Please type a title, author or, subject to search for.'};
        }
        if(cleaned.length < MIN_QUERY_LENGTH) {
            return { ok: false, error:`Please enter at least ${MIN_QUERY_LENGTH} characters.`};

        }
        if (cleaned.length> MAX_QUERY_LENGTH) {
            return { ok: false, error: `Please keep your search under ${MAX_QUERY_LENGTH} characters.`};

        }
        if (!/[\p{L}\p{N}]/u.test(cleaned)) {
            return { ok: false, error: 'Your search needs at least one letter or number.'};
        }

        return { ok: true, value: cleaned};
    }


    function cacheKey(query) {
        return CACHE_PREFIX + query.toLowerCase();
    }

    function readCache(query) {
        try {
            const raw = sessionStorage.getItem(cacheKey(query));
            if (!raw) return null;

            const entry = JSON.parse(raw);
            const isExpired = !entry || Date.now() - entry.savedAt >CACHE_TTL_MS;
            if (isExpired || !Array.isArray(entry.books)) {
                sessionStorage.removeItem(cacheKey(query));
                return null
            }
            return entry;
        } catch {
            return null;
        }
    }

    function writeCache(query, data) {
        try {
            const key = cacheKey(query);

            let index = JSON.parse(sessionStorage.getItem(CACHE_INDEX_KEY) || '[]');
            if (!Array.isArray(index)) index = [];
            index = index.filter((k) => k !== key);
            index.push(key);
            while (index.length > CACHE_MAX_ENTRIES) {
                sessionStorage.removeItem(index.shift());
            }

            sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), ...data}));
            sessionStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
        } catch {

        }
    }


    function normalizeDoc(doc) {
        if (!doc || typeof doc.key !== 'string' || !/^\/works\/OL\d+W$/.test(doc.key)) {
            return null;
        }

        const title = typeof doc.title === 'string' && doc.title.trim() ? doc.title.trim() : 'Untitled';
        const authors = Array.isArray(doc.author_name)
        ? doc.author_name.filter((a) => typeof a === 'string' && a.trim()).slice(0, 3)
        : [];

        return{
            id: doc.key,
            title,
            authors,
            year: Number.isInteger(doc.first_publish_year) ? doc.first_publish_year : null,
            coverId: Number.isInteger(doc.cover_i) && doc.cover_i > 0 ? doc.cover_i : null,
            hasFullText: doc.has_fulltext === true,
            departments: classifyDepartments(doc.subject),

            access: ACCESS_TYPES.includes(doc.ebook_access) ? doc.ebook_access : 'no_ebook',
            iaId: Array.isArray(doc.ia) ? doc.ia.find((id) => isIaId(id)) || null : null,
            isbns: Array.isArray(doc.isbn) ? doc.isbn.filter((n) => isIsbn(n)).slice(0, 3) : [],
        };
    }


    function isIsbn(value) {
        return typeof value === 'string' && /^(\d{9}[\dX]|\d{13})$/.test(value);
    }

    function isIaId(id) {
        return typeof id === 'string' && IA_ID_PATTERN.test(id);
    }

    function readerUrl(iaId) {
        return isIaId(iaId) ? `${ARCHIVE_URL}/embed/${iaId}` : null;
    }

    function downloadsUrl(iaId) {
        return isIaId(iaId) ? `${ARCHIVE_URL}/download/${iaId}` : null;
    }

    async function findPdfUrl(iaId) {
        const fallback = downloadsUrl(iaId);
        if (!fallback) return null;
        try {
            const response = await fetch (`${ARCHIVE_URL}/metadata/${iaId}/files`);
            if (!response.ok) return fallback;
            const data = await response.json();
            const files = Array.isArray(data.result) ? data.result : [];
            const pdf = files.find((file) => typeof file.name === 'string' && file.name.toLowerCase().endsWith('.pdf'));
            if (!pdf) return fallback;
            const safeName = pdf.name.split('/').map(encodeURIComponent).join('/');
            return `${ARCHIVE_URL}/download/${iaId}/${safeName}`;
        } catch {
            return fallback;
        }
    }

    function formatsUrl(iaId) {
        return isIaId(iaId) ? `${ARCHIVE_URL}/details/${iaId}` : null;
    }

    function coverUrl(coverId, size = 'M') {
        if (!Number.isInteger(coverId) || coverId <= 0) return null;
        return `${COVER_URL}${coverId}-${size}.jpg?default=false`;
    }

     async function searchBooks(query) {
        const cached = readCache(query);
        if (cached) {
            return { books: cached.books, total: cached.total, fromCache: true };
        }

        const params = new URLSearchParams({
            q: query,
            limit: String(RESULT_LIMIT),
            fields: FIELDS,
        });

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        let response;
        try {
            response = await fetch(`${SEARCH_URL}?${params.toString()}`, { signal: controller.signal});
        } catch (err) {
            if (err.name === 'AbortError') {
                throw new Error('Open Library is taking too long to respond. Please try again in a moment');                
            }
            throw new Error('Could not reach open Library. Please check your internet connection and try again');            
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            if (response.status === 429) {
                throw new Error('Too many searches in a short time. Please wait a few seconds and try again.');

            }
            if(response.status >= 500) {
                throw new Error(`Open Library is having trouble right now (error ${response.status}). Please try again later.`);
            }
            throw new Error(`The search request failed (error ${response.status}). Please try a different search.`);
        }

        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error('Open Library sent back an unexpected response. Please try again.');
        }
        if (!data || !Array.isArray(data.docs)) {
            throw new Error('Open Library sent back an unexpected response. Please try again.');
        }

        const books = data.docs.map(normalizeDoc).filter(Boolean);
        const total = Number.isInteger(data.numFound) ? data.numFound : books.length;

        writeCache(query, { books, total });
        return { books, total, fromCache: false };
     }

     return{
        validateQuery, searchBooks, coverUrl, departmentName, isDepartmentId,
        isIaId, isIsbn, readerUrl, downloadsUrl, findPdfUrl, formatsUrl,
     };

})();