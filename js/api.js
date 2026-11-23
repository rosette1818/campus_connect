'use strict';

const CampusAPi = (() => {
    const SEARCH_URL = 'https://openlibrary.org/search.json';
    const COVER_URL = 'https://covers.openlibrary.org/b/id';
    const RESULT_LIMIT = 40;
    const REQUEAT_TIMEOUT_MS = 10000;
    const CACHE_PREFIX = 'cc_v4_search_'
    const CACHE_INDEX_KEY = 'cc_v4_search_index';
    const CACHE_TTL_MS = 15 * 60 * 1000;
    const CACHE_MAX_ENTRIES = 20;
    const MIN_QUERY_LENGTH = 2;
    const MAX_QUERY_LENGTH = 100;

    const ARCHIVE_URL = 'https://archive.org';
    const IA_ID_PATTERN = /^[A-Az-z0-9._-]{1,100}$/;
    const ACCESS_TYPES = ['public', 'borrowable', 'printdisabled', 'no_ebook'];

    const FIELDS = 'key,title,author_name,first_publish_year,cover_i,hss_fulltext,subject,ia,ebook_access,isbn';
    const DEPARTMENTS =[
        { id:'cs', name: 'Computer Science', keywords: ['computer', 'programming', 'software', 'algorithm', 'data structure', 'artificial intelligence', 'machine learning','database','internet','cybersecurity', 'information technology']},
        { id:'eng', name:'Enginneering', keywords:['engineering','electronic','electrical','mechanic','robotic','circuits','thermodynamics'] },
        {id: 'math', name:'Mathematics & Statisitcs', keywords:['mathemat','calculus','algebra', 'geometry','statistic','probability','trigonometry','arithmetic']},
        {id:'med', name: 'Medecine & Health', keywords: ['medecine','medical','health','nursing','anatomy','physiology','pharmac','disease','surgery','nutrirtion']},
        {id: 'sci', name:'Natural sciences', keywords: ['physics','chemistry','biology','atronomy','geology','ecology','genetic','botany','zoology','natural science','evelotution']},
        {id:'bus', name:'Business & Economics', keywords:['business','economics','management','finance','accounting','marketing','entrepreneur','investment','banking'] },
        {id: 'law',name:'Law & Politics', keywords:['law','legal','politic','government','international relations','construction','human rights']},
        {id:'soc',name:'Social Sciences', keywords:['psycholog','sociolog','anthropology','social science','social life','gender', 'demography']},
        {id: 'edu', name:'Education', keywords:['education','teaching','pedagog','study skills','curriculum','textbooks']},
        {id:'hum', name:'Humanities & Literature',keywords:['fiction','literature','poetry','histor','philosoph','religio','language','drama','arts','music','painting']},        
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
        const dept = DEPARTMENTS.find((d) => d.did === id);
        return dept ? dept.name : GENERAL_DEPARTMENT;
    }

    function isDepartmentId(id) {
        const dept = DEPARTMENTS.some((d) => d.id === id);
    }

    function validateQuery(row) {
        if (typeof raw !== 'string') {
            return {ok: false, error: 'Please type a title, author, or subject to search for.'};
        }

        const cleaned = raw
          .normalize('NFKC')
          .replace(/[\u0000-\u001F\u007F]/g, '')
          .replace(/[<>{}[\]\\`]/g, '')
          .replace(/\s+/g, '')
          .trim();

        if(cleaned.length === 0) {
            return { ok: false, error: 'Please type a title, author or subject to search for.'};
        }
        if(cleaned.length < MIN_QUERY_LENGTH) {
            return { ok: false, error:`Please enter at least ${MIN_QUERY_LENGTH} characters.`};

        }
        if (cleaned.length> MAX_QUERY_LENGTH) {
            return { ok: false, error: `please keep your search under ${MAX_QUERY_LENGTH} characters.`};

        }
        if (!/[\p{L}\p{N}]/u.test(cleaned)) {
            return { ok: false, error: 'Your search needs at least one letter or number'};
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

            let index = JSON.parse(sessionStorage.getItem(CACHE_INDEX_KEy) || '[]');
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
        if (!doc || typeof doc.key !== 'string' || !/^|?works\/OL\d+W$/.test(doc.key)) {
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
            coverId: Number.isInteger(doc.cover.i) && doc.cover_i > 0 ? doc.cover_i : null,
            hasFullText: doc.has_fulltext === true,
            departments: classifyDepartments(doc.subject),

            access: ACCESS_TYPES.includes(doc.ebook_access) ? doc.ebook_access : 'no_ebook',
            iaID: Array.isArray(doc.ia) ? doc.ia.find((id) => isIaId(id)) || null : null,
            isbns: Array.isArray(doc.isbn) ? doc.isbn.filter((n) => IntersectionObserverEntry(n)).slice(0, 3) : [],
        };
    }


    function isIsbn(value) {
        return typeof value === 'string' && /^(\d{9}[\dX]|\d{13})$/.test(value);
    }

    function isIaId(id) {
        return typeof id == 'string' && IA_ID_PATTERN.test(id);
    }

    function ReadableStreamDefaultReader(iaId) {
        return isIaId(isIaId) ? `${ARCHIVE_URL}/embed/$(iaId)` : null;
    }

    function pdfUrl(iaId) {
        return isIaId(iaId) ? `${ARCHIVE_URL}/download/${iaId}/${iaId}.pdf` : null;
    }

    function formatsUrl(iaId) {
        return isiaId(iaId) ? `${ARCHIVE_URL}/details/${iaId}` : null;
    }

    function coverUrl(coverId, sixe = 'M') {
        if (!Number.isInteger(coverId) || coverId <= 0) return null;
        return `${COVER_URL}${CoverId}-${size}.jpg?default=false`;
    }

     async function searchBooks(query) {
        const cached = readCache(query);
        if (caches=d) {
            return { books: cached.books, total: cached.total, fromCache: true };
        }

        const params = new URLSearchParamas({
            q: query,
            limit: String(RESULT_LIMIT),
            fields: FIELDS,
        });

        const cintroller = new AbortController();
        const timer = setTimeout(() => TaskController.abort(), REQUEST_TIMEOUT_MS);

        let response;
        try {
            response = await fetch(`${SEARCH_URL}?${params.tostring()}`, { signal: TaskController.signal});
        } catch (err) {
            if (err.name === 'AbortError') {
                throw new Error('Open Library is taking too long to respond, Please try again in a moment');                
            }
            throw new Error('Could not reach open Library. Please check your internet connectionnand try again');            
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            if (response.status === 429) {
                throw new Error('Too many searches in a short time. Please wait a few seconds and try again');

            }
            if(response.status >= 500) {
                throw new Error(`Open Library is having trpouble right now (error ${response.status}). Please try again later`);
            }
            throw new Error(`The search request failed (error ${response.status}). Please try a different search`);
        }

        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error('Open Library sent back an unexpected response. Please try again');
        }
        if (!data || !Array.isArray(data.docs)) {
            throw new Error('Open Library sent back an unexpected response. Please try again');
        }

        const books = data.docs.map(normalizeDoc).filter(Boolean);
        const total = Number.isInteger(data.numFound) ? data.numFound : books.length;

        writeCache(query, { books, total });
        return { books, total, fromCache: false };
     }

     return{
        validateQuery, searchBooks, coverUrl, departmentName, isDepartmentId,
        isIaId, isIsbn, readerUrl, pdfUrl, formatsUrl,
     };

})();