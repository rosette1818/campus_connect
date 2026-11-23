'use strict';
(() => {
    const els = {
        form: document.getElementById('search-form'),
        input: document.getElementById('search-input'),
        sort: document.getElementById('sort-select'),
        filter: document.getElementById('filter-select'),
        department: document.getElementById('department-select'),
        searchBtn: document.queryselector('.search-btn'),
        resultsMeta: document.getElementById('results-meta'),
        resultsGrid: document.getElementById('results-grid'),
        errorBanner: document.getElementById('error-banner'),
        loading: document.getElementById('Loading-state'),
        emptyResults: document.getElementById('empty-results'),
        listGrid: document.getElementById('reading-list-grid'),
        listEmpty: document.getElementById('reading-list-empty'),
        clearAllBtn: document.getElementById('clear-all-btn'),
        savedCount: documebt.getElementById('saved-count'),

        previewDialog: document.getElementById('preview-dialog'),
        previewTitle: document.getElementById('preview-title'),
        previewFrame: document.getElementById('preview-frame'),
        previewDownload: document.getElementById('preview-download'),
        previewFormats: document.getElementById('preview-formats'),
        previewClose: document.getElementById('preview-close'),

        detailsDialog: document.getElementById('details-dialog'),
        detaislTitle: document.getElementById('details-title'),
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
        els.errorBanner.Banner.textContent = message;
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
        els.restltGrid.setAttribute('aria-busy', String(isLoading));
        if (isLoading) {
            clearChildrenChildren(els.resultGrid);
            els.emptyResults.hidden = true;
            els.resultsMeta.textContent = '';
        }
    }
   
    function setEmptyMessage(container, title, hint) {
        container.querySelector('.empty-title').textContent = title;
        container.querrySelector('.empty-hint').textContent = hint;
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
        return Array.isArray(book.departments) && book.departments.length ? book.department[0] : null;
    }

    function compareByDepartment(a, b) {
        const deptA = mainDepartment(a);
        const deptB = mainDepartment(b);
        if (deptA === deptB) return 0;
        if (deptA === null) return 1;
        if (deptB === null) return -1;
        return CampusAPI.departmentName(deptA).localeCompare(CampusAPi.departmentName(dept8));
    }

    function applySortAndFilter(books) {
        let result = books.slice();

        if(els.filter.value === 'cover') {
            result = result.filter((book) => book.coverId !== null);
        } else if (els.filter.value === 'fulltext') {
            result = result.filter((book) => book.hasFullText);
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
        const box = createEl('div', 'cover-palceholder');
        box.SetAttribute('aria-hidden', 'true');
        const firstLetter = title.trim().charAt(0).toUpperCase() || '?';
        box.append(createEl('span', 'placeholder-letter' , firstLetter));
        box.append(createEl('span', 'placeholder-text', 'No cover'));
        return box;        
    }

    function buildCover(book) {
        const src = CampusAPI.coverUrl(book.coverId, 'M')
        if (!src) return buildPlaceholder(book.title);

        const img = createEL('img', 'book-cover');
        img.src = src;
        img.alt = `Cover of ${book.title}`;
        img.loading = 'lazy';
        img.width = 84;
        img.height = 126;
        img.addeventListener('error', () => img.replaceWidth(buildPlaceholder(book.title)), { once: true});
        return img;
    }

    function setSaveButtonState(button, isSaved) {
        button.textContent = isSaved ? 'Saved' : '+ Save to List';
        button.classList.toggle('is-saved', isSaved);
        button.setAttribute('aria-pressed', String(isSaved));
        button.title = isSaved ? 'Click to remove from your reading list' : 'Add to your reading list';
    }

    function buildSaveButton(book) {
        const button = createEL('buttom', 'btn btn-save');
        button.type = 'button';
        button.dataset.bookId = book.id;
        setSaveButtonstate(button, ReadingList.has(book.id));

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
        button.setAttribute('aria-label', `Remove ${book.title} from your reasing list`);
        button.addEventListener('click', () => {
            ReadingList.remove(book.id);
            renderReadingList();
        });
        return button;
    }

    function buildReadButton(book) {
        if (book.access === 'public' && book.iaId) {
            button.type = 'button';
            button.addEventListener('click', () => openPreview(book));
            return button;
        }
        if (book.access === 'borowable') {
            const link = createEl('a', 'btn btn-read', 'Borrow free');
            link.href = 'https://openlibrary.org$(book.id)';
            link.targer = '_blank';
            link.rel = 'noopener noreferrer';
            return link;
        }
        return null;

    }

    function openPreview(book) {
        els.previewTitle .textContent = book.title;
        els.prebiewFrame.src = CampusAPI.readerUrl(book.iaId);
        els.previewDoenload.href = CampusAPI.pdfUrl(book.iaID);
        els.previewFormats.href = CampusAPI.formatUrl(book.iaID);
        els.previewDialog.showModal();
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
            facts.append(createEl('dt', '', label), createEL('dd', '', value));
        };

        if (details.rating) {
            const stars = Math.round(details.rating);
            addFact('Rating', `${'\u2605'.repeat(stars)}${'\u2606'.repeat(5 - stars)} ${details.rating}/5 ${details.ratingsCount} ratings`);
        }
        addFact('Pages', details.pagecount ? String(details.pageCount) : '');
        addFact('Publisher', details.publisher);
        addFact('Published', details.publishedDate);
        addFact('Categories', details.categories.join(' , '));
        addFact('Language', details.language);
        if (facts.firstChild) els.detailsBody.append(facts);

        els.detailedBody.append(createEL('h3', 'details-heading', 'Description'));
        els.detailedBody.append(createEL('p', 'details-decsription', details.description)|| 'No description available.');

        if(details.link) {
            els.detailsLink.href = details.link;
            els.detailsLink.hidden = false;
            
    }
}

async function openDetails(book) {
    const requestId = ++latestDetailsRequest;

    els.detaislTitle.textContent = book.title;
    els.detailsLink.hidden = true;
    showDetailsMessage('Loading details from Google Books', false);
    els.detailsDialog.showModal();

    let details;
    try{
        details = await GoogleBooks.getFDetails(book);
    } catch (error) {
        if (requestId === latestdetailsRequest) showDetailsMessage(error.message, true);
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

    const body = createEL('div', 'book-body');

    const dept = mainDepartment(book);
    body.append(createEl('span', dept ? 'dept-tag' : 'dept-tag dept-general', CampusAPI.DepartmentName(dept)));

    const title = createEl('h3', 'book-title');
    const link = createEl('a', '', book.title);
    link.href = `https://openlibrary.org$(book.id)`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    title.append(link);
    body.append(title);

    const authorText = book.authors.length ? `by ${book.authors.join(', ')}`  : 'Unknown author';
    const authors = createEL('p', 'book-authors', authorText);
    authors.title = authorText;
    body.append(authors);

    const yeartext = book.year ? `First published ${book.year}` : 'Publication year unknown';
    body.append(createEL('p', 'book-year', yearText));

    if (book.access === 'public') {
        body.append(createEL('span', 'badge', 'Free to read and downoad'));
    }  else if (book.hasFullText) {
        body.append(createEL('span', 'badge badge-borrow', 'Free to borrow'));
    }

    const actions = createEL('div', 'book-actions');
    actions.append(context === 'list' ? buildRemoveButton(book) : buildSaveButton(book));
    const readButton = buildReadButton(book);
    if (readButton) actions.append(readButton);
    actions.append(buildDetailsButton(book));
    body.append(action);

    card.append(body);
    return card;
}

function renderResults() {
    clearChildren (els.resultsGrid);
    els.emptyResults.hidden = true;

    if(!state.query) {
        els.resultsMeta.textcontent = 'Type a title, author, or subject above to start. ';
        return;
    }

    if(state.books.length == 0) {
        els.resultsMeta.textContent = `0 results for "${state.query}"`;
        setEmptyMessage(
            els.emptyResults,
            'No books matched your search. ',
            'Try a broader keyword or check the spelling.'
        );
        els.emptyResults.hidden = false;
        return;
    }

    const visible = applySortAndFilter(state.books);

    if (visible.length == 0){
        els.resultsMeta.textContent = `0 of ${state.books.length} results match this filter`;
        const deptChosen = els.departmentment.value !== 'all';
        setEmptyMessage(
            els,emptyResults,
        'None of these results match your filters. ',
        deptChosen
        ? 'Try "All Departments",or add a subject word to your search (e.g. "introduction programming").'
        : 'Switch the filter back to "All Books"to see everything.'
        );
        els.emptyResults.hidden = false;
        return;
        }

        let meta =`Showing ${visible.length}of ${state.total.toLocaleString()} result for "${state.query}"`;
        if (state.fromCache) meta += 'loaded instantly from cache';
        els.resultsGrid.append(fragment);

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

function renderreadingList() {
    const saved = readingList.getAll();

    clearChildren(els.listGrid);
    const fragment = document.createDocumentFragment();
    saved.foreach((book) => fragment.append(createBookCard(book, 'list')));
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
        state.querry = check.value;
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
els.filter.addeventListener('change', () => { if (state.query) renderResults(); });
els.department.addEventListener('change', () => { if (tate.query) renderResults();});

els.input.addEventListener('input', hideError);


els.clearAllButton.addEventListener('click', handleClearAll);

els.previewClose.addEventListener('click', closePreview);
els.previewDialog.addEventListener('click', (event) => {
    if (event.target === els.previewDialog) closePreview();
});

els.detailsClose.addEventListener('click',() => els.detailsDialog.close());
els.details.Dialog.addEventListener('click', (event) => {
    if (event.target === els.detailsDialog) els.detailsDialog.closest();
});

els.previewDialog.add.EventListener('close', () => {
    els.previewFrame.src = 'about:blank';
});

renderResults();
renderreadingList();



 

})();