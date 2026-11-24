'use strict';
 const ReadingList = (() => {
    const STORAGE_KEY = 'campusconnect_reading_list';

    function isValidBook(book) {
        return (
            book !== null &&
            typeof book === 'object' &&
            typeof book.id === 'string' &&
            /^\/works\/OL\d+W$/.test(book.id) &&
            typeof book.title === 'string'
        );
    }

    function getAll() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            return Array.isArray(parsed) ? parsed.filter(isValidBook) : [];
        } catch {
            return [];
        }
    }

    function saveAll(list) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
            return true;
        } catch {
            return false;
        }
    }

    function has(id) {
        return getAll().some((book) => book.id === id);
    }

    function add(book) {
        if (!isValidBook(book)) return false;

        const list = getAll();
        if (list.some((saved) => saved.id === book.id)) return true;

        list.unshift({
            id: book.id,
            title: book.title,
            authors: Array.isArray(book.authors) ? book.authors.slice(0, 3) : [],
            year: Number.isInteger(book.year) ? book.year : null,
            coverId: Number.isInteger(book.coverId) ? book.coverId : null,
            hasFullText: book.hasFullText === true,
            departments: Array.isArray(book.departments)
            ? book.departments.filter((id) => CampusAPI.isDepartmentId(id))
            : [],
            access: typeof book.access === 'string' ? book.access : 'no_ebook',
            iaId: CampusAPI.isIaId(book.iaId) ? book.iaId : null,            
            isbns: Array.isArray(book.isbns) ? book.isbns.filter((n) => CampusAPI.isIsbn(n)).slice(0,3) : [],
            savedAt: Date.now(),

        });
        return saveAll(list);
    }

    function remove(id) {
        return saveAll(getAll().filter((book) => book.id !== id));
    }

    function clear() {
        try{
            localStorage.removeItem(STORAGE_KEY);
            return true;
        } catch {
            return false;
        }
    }

    return { STORAGE_KEY, getAll, has, add, remove, clear };
 })();

