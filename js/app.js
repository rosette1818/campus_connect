'use strict';
(() => {
    const els = {
        form: document.getElementById('search-form'),
        input: document.getElementById('search-input'),
        sort: document.getElementById('sort-select'),
        filter: document.getElementById('filter-select'),
        department: document.getElementById('department-select'),
        searchBtn: document.querySelector('.search-btn'),
        resultsMeta: document.getElementById('results-meta'),
        resultsGrid: document.getElementById('results-grid'),
        errorBanner: document.getElementById('error-banner'),
        loading: document.getElementById('loading-state'),
        emptyResults: document.getElementById('empty-results'),
        listGrid: document.getElementById('reading-list-grid'),
        listEmpty: document.getElementById('reading-list-empty'),
        clearAllBtn: document.getElementById('clear-all-btn'),
        savedCount: document.getElementById('saved-count'),

        previewDialog: document.getElementById('preview-dialog'),
        previewTitle: document.getElementById('preview-title'),
        previewFrame: document.getElementById('preview-frame'),
        previewDownload: document.getElementById('preview-download'),
        previewFormats: document.getElementById('preview-formats'),
        previewClose: document.getElementById('preview-close'),

        detailsDialog: document.getElementById('details-dialog'),
        detailsTitle: document.getElementById('details-title'),
        detailsBody: document.getElementById('details-body'),
        detailsLink: document.getElementById('details-link'),
        detailsClose: document.getElementById('details-close'),


    };

    let latestDetailsRequest = 0;

    const state = {
        query:'',
        books:[],
        total: 0,
        fromCache: false,
        isLoading: false,
    };


    function createEl(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if(text !== undefined) node.textContent = text;
        return node;
    }

    function clearChildren(node) {
        while (node.firstChild) node.removeChild(node.firstChild);
    }
    
    function showError(message) {
        els.errorBanner.textContent = message;
        els.errorBanner.hidden = false;
    }

    function hideError() {
        els.errorBanner.hidden = true;
        els.errorBanner.textContent = '';
    }

    function setLoading(isLoading) {
        state.isLoading = isLoading;
        els.loading.hidden = !isLoading;
        els.searchBtn.disabled = isLoading;
        els.searchBtn.textContent = isLoading ? 'Searching...' : 'Search';
        els.resultsGrid.setAttribute('aria-busy', String(isLoading));
        if (isLoading) {
            clearChildren(els.resultsGrid);
            els.emptyResults.hidden = true;
            els.resultsMeta.textContent = '';
        }
    }
   
    function setEmptyMessage(container, title, hint) {
        container.querySelector('.empty-title').textContent = title;
        container.querySelector('.empty-hint').textContent = hint;
    }

    function compareByYear(direction) {
        return (a, b) => {
            if(a.year === null && b.year === null) return 0;
            if (a.year === null) return 1;
            if (b.year === null) return -1;
            return direction * (a.year -b.year);

        };
    }

    function mainDepartment(book) {
        return Array.isArray(book.departments) && book.departments.length ? book.departments[0] : null;
    }

    function compareByDepartment(a, b) {
        const deptA = mainDepartment(a);
        const deptB = mainDepartment(b);
        if (deptA === deptB) return 0;
        if (deptA === null) return 1;
        if (deptB === null) return -1;
        return CampusAPI.departmentName(deptA).localeCompare(CampusAPI.departmentName(deptB));
    }

    function applySortAndFilter(books) {
        let result = books.slice();

        if(els.filter.value === 'cover') {
            result = result.filter((book) => book.coverId !== null);
        } else if (els.filter.value === 'fulltext') {
            result = result.filter((book) => book.hasFullText);
        }
        const dept = els.department.value;
        if (dept !== 'all') {
            result = result.filter((book) => Array.isArray(book.departments) && book.departments.includes(dept));
        }

        if (els.sort.value === 'newest') {
            result.sort(compareByYear(-1));
        } else if (els.sort.value === 'oldest') {
            result.sort(compareByYear(1));
        } else if (els.sort.value === 'department') {
            result.sort(compareByDepartment);
        }

        return result;
    } 


    function buildPlaceholder(title) {
        const box = createEl('div', 'cover-placeholder');
        box.setAttribute('aria-hidden', 'true');
        const firstLetter = title.trim().charAt(0).toUpperCase() || '?';
        box.append(createEl('span', 'placeholder-letter' , firstLetter));
        box.append(createEl('span', 'placeholder-text', 'No cover'));
        return box;        
    }

    function buildCover(book) {
        const src = CampusAPI.coverUrl(book.coverId, 'M');
        if (!src) return buildPlaceholder(book.title);

        const img = createEl('img', 'book-cover');
        img.src = src;
        img.alt = `Cover of ${book.title}`;
        img.loading = 'lazy';
        img.width = 84;
        img.height = 126;
        img.addEventListener('error', () => img.replaceWith(buildPlaceholder(book.title)), { once: true});
        return img;
    }

    function setSaveButtonState(button, isSaved) {
        button.textContent = isSaved ? 'Saved' : '+ Save to List';
        button.classList.toggle('is-saved', isSaved);
        button.setAttribute('aria-pressed', String(isSaved));
        button.title = isSaved ? 'Click to remove from your reading list' : 'Add to your reading list';
    }

    function buildSaveButton(book) {
        const button = createEl('button', 'btn btn-save');
        button.type = 'button';
        button.dataset.bookId = book.id;
        setSaveButtonState(button, ReadingList.has(book.id));

        button.addEventListener('click', () => {
            if (ReadingList.has(book.id)) {
                ReadingList.remove(book.id);
            } else if (!ReadingList.add(book)) {
                showError('Could not save this book. Your browser storage may be full or disabled.');
                return;
            }
            renderReadingList();
        });
        return button;
    }

    function buildRemoveButton(book) {
        const button = createEl('button', 'btn btn-remove', 'Remove');
        button.type = 'button';
        button.setAttribute('aria-label', `Remove ${book.title} from your reading list`);
        button.addEventListener('click', () => {
            ReadingList.remove(book.id);
            renderReadingList();
        });
        return button;
    }

    function buildReadButton(book) {
        if (book.access === 'public' && book.iaId) {
            const button = createEl('button', 'btn btn-read','Read & Download');
            button.type = 'button';
            button.addEventListener('click', () => openPreview(book));
            return button;
        }
        if (book.access === 'borrowable') {
            const link = createEl('a', 'btn btn-read', 'Borrow free');
            link.href = `https://openlibrary.org${book.id}`;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            return link;
        }
        return null;

    }

    async function openPreview(book) {
        els.previewTitle .textContent = book.title;
        els.previewFrame.src = CampusAPI.readerUrl(book.iaId);
        els.previewDownload.href = CampusAPI.downloadsUrl(book.iaId);
        els.previewFormats.href = CampusAPI.formatsUrl(book.iaId);
        els.previewDialog.showModal();

        const pdfLink = await CampusAPI.findPdfUrl(book.iaId);
        if (els.previewDialog.open && els.previewTitle.textContent === book.title) {
            els.previewDownload.href = pdfLink;
        }
    }

    function closePreview(book) {
        els.previewDialog.close();
    }

    function buildDetailsButton(book) {
        const button = createEl('button', 'btn btn-read', 'Details');
        button.type = 'button';
        button.addEventListener('click', () => openDetails(book));
        return button;
    }

    function showDetailsMessage(message, isError) {
        clearChildren(els.detailsBody);
        els.detailsBody.append(createEl('p', isError ? 'banner banner-error' : 'details-empty', message));
    }

    function renderDetails(details) {
        clearChildren(els.detailsBody);

        const facts = createEl('dl', 'details-facts');
        const addFact = (label, value)  => {
            if(!value) return;
            facts.append(createEl('dt', '', label), createEl('dd', '', value));
        };

        if (details.rating) {
            const stars = Math.round(details.rating);
            addFact('Rating', `${'\u2605'.repeat(stars)}${'\u2606'.repeat(5 - stars)} ${details.rating}/5 $({details.ratingsCount} ratings)`);
        }
        addFact('Pages', details.pageCount ? String(details.pageCount) : '');
        addFact('Publisher', details.publisher);
        addFact('Published', details.publishedDate);
        addFact('Categories', details.categories.join(' , '));
        addFact('Language', details.language);
        if (facts.firstChild) els.detailsBody.append(facts);

        els.detailsBody.append(createEl('h3', 'details-heading', 'Description'));
        els.detailsBody.append(createEl('p', 'details-description', details.description || 'No description available.'));

        if(details.link) {
            els.detailsLink.href = details.link;
            els.detailsLink.hidden = false;
            
    }
}

async function openDetails(book) {
    const requestId = ++latestDetailsRequest;

    els.detailsTitle.textContent = book.title;
    els.detailsLink.hidden = true;
    showDetailsMessage('Loading details from Google Books', false);
    els.detailsDialog.showModal();

    let details;
    try{
        details = await GoogleBooks.getDetails(book);
    } catch (error) {
        if (requestId === latestDetailsRequest) showDetailsMessage(error.message, true);
        return;
    }
    if(requestId !== latestDetailsRequest) return;

    if (details) {
        renderDetails(details);
    } else {
        showDetailsMessage('Google Books has no extra details for this book.', false);
    }    
}

function createBookCard(book, context) {
    const card = createEl('article', 'book-card');
    card.append(buildCover(book));

    const body = createEl('div', 'book-body');

    const dept = mainDepartment(book);
    body.append(createEl('span', dept ? 'dept-tag' : 'dept-tag dept-general', CampusAPI.departmentName(dept)));

    const title = createEl('h3', 'book-title');
    const link = createEl('a', '', book.title);
    link.href = `https://openlibrary.org${book.id}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    title.append(link);
    body.append(title);

    const authorText = book.authors.length ? `by ${book.authors.join(', ')}`  : 'Unknown author';
    const authors = createEl('p', 'book-authors', authorText);
    authors.title = authorText;
    body.append(authors);

    const yearText = book.year ? `First published ${book.year}` : 'Publication year unknown';
    body.append(createEl('p', 'book-year', yearText));

    if (book.access === 'public') {
        body.append(createEl('span', 'badge', 'Free to read and downoad'));
    }  else if (book.hasFullText) {
        body.append(createEl('span', 'badge badge-borrow', 'Free to borrow'));
    }

    const actions = createEl('div', 'book-actions');
    actions.append(context === 'list' ? buildRemoveButton(book) : buildSaveButton(book));
    const readButton = buildReadButton(book);
    if (readButton) actions.append(readButton);
    actions.append(buildDetailsButton(book));
    body.append(actions);

    card.append(body);
    return card;
}

function renderResults() {
    clearChildren (els.resultsGrid);
    els.emptyResults.hidden = true;

    if(!state.query) {
        els.resultsMeta.textContent = 'Type a title, author, or subject above to start. ';
        return;
    }

    if(state.books.length === 0) {
        els.resultsMeta.textContent = `0 results for "${state.query}"`;
        setEmptyMessage(
            els.emptyResults,
            'No books matched your search.',
            'Try a broader keyword or check the spelling.'
        );
        els.emptyResults.hidden = false;
        return;
    }

    const visible = applySortAndFilter(state.books);

    if (visible.length === 0){
        els.resultsMeta.textContent = `0 of ${state.books.length} results match this filter`;
        const deptChosen = els.department.value !== 'all';
        setEmptyMessage(
            els.emptyResults,
        'None of these results match your filters.',
        deptChosen
        ? 'Try "All Departments", or add a subject word to your search (e.g. "introduction programming").'
        : 'Switch the filter back to "All Books" to see everything.'
        );
        els.emptyResults.hidden = false;
        return;
        }

        let meta =`Showing ${visible.length} of ${state.total.toLocaleString()} results for "${state.query}"`;
        if (state.fromCache) meta += ' loaded instantly from cache';
        els.resultsMeta.textContent = meta;
        const fragment = document.createDocumentFragment();
        visible.forEach((book) => fragment.append(createBookCard(book, 'results')));
        els.resultsGrid.append(fragment);
}  


function syncSaveButtons() {
    const savedIds = new Set(ReadingList.getAll().map((book) => book.id));
    els.resultsGrid.querySelectorAll('.btn-save').forEach((button) => {
        setSaveButtonState(button, savedIds.has(button.dataset.bookId));
    });
}

function renderReadingList() {
    const saved = ReadingList.getAll();

    clearChildren(els.listGrid);
    const fragment = document.createDocumentFragment();
    saved.forEach((book) => fragment.append(createBookCard(book, 'list')));
    els.listGrid.append(fragment);

    els.listEmpty.hidden = saved.length > 0;
    els.clearAllBtn.hidden = saved.length === 0;
    els.savedCount.textContent = String(saved.length);

    syncSaveButtons();
}

async function handleSearch(event) {
    event.preventDefault();
    if (state.isLoading) return;

    hideError();

    const check = CampusAPI.validateQuery(els.input.value);
    if (!check.ok) {
        showError(check.error);
        els.input.focus();
        return;
    }
    els.input.value = check.value;

    setLoading(true);
    try {
        const result = await CampusAPI.searchBooks(check.value);
        state.query = check.value;
        state.books = result.books;
        state.total = result.total;
        state.fromCache = result.fromCache;
        
    } catch (error) {
        setLoading(false);
        state.query = '';
        state.books = [];
        els.resultsMeta.textContent = '';
        showError(error.message);
        return;
    }
    setLoading(false);
    renderResults();
}

function handleClearAll() {
    if (window.confirm('Remove all books from your reading list?')) {
        ReadingList.clear();
        renderReadingList();        
    }
}

els.form.addEventListener('submit', handleSearch);

els.sort.addEventListener('change', () => { if (state.query) renderResults(); });
els.filter.addEventListener('change', () => { if (state.query) renderResults(); });
els.department.addEventListener('change', () => { if (state.query) renderResults();});

els.input.addEventListener('input', hideError);


els.clearAllBtn.addEventListener('click', handleClearAll);
document.querySelectorAll('a[href="#discover"]').forEach((link) => {
    link.addEventListener('click', () => els.input.focus());
});

els.previewClose.addEventListener('click', closePreview);
els.previewDialog.addEventListener('click', (event) => {
    if (event.target === els.previewDialog) closePreview();
});

els.detailsClose.addEventListener('click',() => els.detailsDialog.close());
els.detailsDialog.addEventListener('click', (event) => {
    if (event.target === els.detailsDialog) els.detailsDialog.close();
});

els.previewDialog.addEventListener('close', () => {
    els.previewFrame.src = 'about:blank';
});

window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === ReadingList.STORAGE_KEY) renderReadingList();
});

renderResults();
renderReadingList();



 

})();