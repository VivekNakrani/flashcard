const globalLoader = document.getElementById('globalLoader');

function showLoader() {
    if (globalLoader) globalLoader.classList.add('is-active');
}

function hideLoader() {
    if (globalLoader) globalLoader.classList.remove('is-active');
}
const homeBtn = document.getElementById('homeBtn');
const createDeckNavBtn = document.getElementById('createDeckNavBtn');
const flashNavBtn = document.getElementById('flashNavBtn');
const pdfNavBtn = document.getElementById('pdfNavBtn');
const randomNavBtn = document.getElementById('randomNavBtn');
const storyNavBtn = document.getElementById('storyNavBtn');
if (homeBtn) homeBtn.addEventListener('click', () => {
    showLoader();
    window.location.href = '/';
});
if (createDeckNavBtn) createDeckNavBtn.addEventListener('click', () => {
    showLoader();
    window.location.href = '/create';
});
if (flashNavBtn) flashNavBtn.addEventListener('click', () => {
    showLoader();
    window.location.href = '/?mode=flash';
});
if (pdfNavBtn) pdfNavBtn.addEventListener('click', () => {
    showLoader();
    window.location.href = '/pdf';
});
if (randomNavBtn) randomNavBtn.addEventListener('click', () => {
    showLoader();
    window.location.href = '/?mode=random';
});
if (storyNavBtn) storyNavBtn.addEventListener('click', () => {
    showLoader();
    window.location.href = '/story';
});
const uploadPdfBtn = document.getElementById('uploadPdfBtn');
const uploadPdfModal = document.getElementById('uploadPdfModal');
const uploadPdfNameInput = document.getElementById('uploadPdfNameInput');
const uploadPdfFileInput = document.getElementById('uploadPdfFileInput');
const uploadPdfChooseBtn = document.getElementById('uploadPdfChooseBtn');
const uploadPdfFileName = document.getElementById('uploadPdfFileName');
const uploadPdfCancelBtn = document.getElementById('uploadPdfCancelBtn');
const uploadPdfSaveBtn = document.getElementById('uploadPdfSaveBtn');
const renamePdfModal = document.getElementById('renamePdfModal');
const renamePdfNameInput = document.getElementById('renamePdfNameInput');
const renamePdfCancelBtn = document.getElementById('renamePdfCancelBtn');
const renamePdfSaveBtn = document.getElementById('renamePdfSaveBtn');
const renamePdfStatus = document.getElementById('renamePdfStatus');
const createPdfFolderModal = document.getElementById('createPdfFolderModal');
const createPdfFolderNameInput = document.getElementById('createPdfFolderNameInput');
const createPdfFolderCancelBtn = document.getElementById('createPdfFolderCancelBtn');
const createPdfFolderSaveBtn = document.getElementById('createPdfFolderSaveBtn');
const createPdfFolderStatus = document.getElementById('createPdfFolderStatus');
const pdfListEl = document.getElementById('pdfList');
const pdfRootFolderGrid = document.getElementById('pdfRootFolderGrid');
const pdfBackBtn = document.getElementById('pdfBackBtn');
const pdfPageTitleEl = document.getElementById('pdfPageTitle');
const movePdfModal = document.getElementById('movePdfModal');
const movePdfList = document.getElementById('movePdfList');
const movePdfCancelBtn = document.getElementById('movePdfCancelBtn');
const movePdfSaveBtn = document.getElementById('movePdfSaveBtn');
const movePdfStatus = document.getElementById('movePdfStatus');
const MOVE_PDF_BROWSER_ROOT = '__root__';
const urlFolderParam = new URLSearchParams(window.location.search).get('folder') || '';
let pdfItems = [];
let folderItems = [];
let selectedFolder = urlFolderParam || '';
let selectedPdfName = '';
let selectedPdfForMove = '';
let movePdfBrowserCursor = MOVE_PDF_BROWSER_ROOT;
let movePdfParentByName = {};
let movePdfChildrenByParent = {};
let dragTileEl = null;
let dragTileHeight = 0;
const isCoarsePointer = ("ontouchstart" in window) || window.matchMedia('(pointer: coarse)').matches;

function updatePdfHeader() {
    const isFolderView = !!selectedFolder;
    if (pdfBackBtn) {
        pdfBackBtn.style.display = isFolderView ? 'inline-flex' : 'none';
    }
    if (pdfPageTitleEl) {
        if (isFolderView) {
            pdfPageTitleEl.textContent = selectedFolder;
        } else {
            pdfPageTitleEl.textContent = 'PDFs';
        }
    }
    if (pdfRootFolderGrid) {
        if (isFolderView) {
            pdfRootFolderGrid.style.display = 'none';
        } else {
            pdfRootFolderGrid.style.display = 'grid';
        }
    }
}

function openUploadModal() {
    if (!uploadPdfModal) return;
    uploadPdfNameInput.value = '';
    uploadPdfFileInput.value = '';
    if (uploadPdfFileName) uploadPdfFileName.textContent = 'No file chosen';
    uploadPdfModal.classList.add('is-open');
    uploadPdfModal.setAttribute('aria-hidden', 'false');
}

function closeUploadModal() {
    if (!uploadPdfModal) return;
    uploadPdfModal.classList.remove('is-open');
    uploadPdfModal.setAttribute('aria-hidden', 'true');
}
if (pdfBackBtn) {
    pdfBackBtn.addEventListener('click', () => {
        window.location.href = '/pdf';
    });
}
if (uploadPdfBtn) uploadPdfBtn.addEventListener('click', openUploadModal);
if (uploadPdfCancelBtn) uploadPdfCancelBtn.addEventListener('click', closeUploadModal);
if (uploadPdfModal) uploadPdfModal.addEventListener('click', (e) => {
    if (e.target && e.target.dataset && e.target.dataset.closeUpload === 'true') {
        closeUploadModal();
    }
});
if (uploadPdfChooseBtn && uploadPdfFileInput) {
    uploadPdfChooseBtn.addEventListener('click', () => {
        uploadPdfFileInput.click();
    });
}
if (uploadPdfFileInput && uploadPdfFileName) {
    uploadPdfFileInput.addEventListener('change', () => {
        const file = uploadPdfFileInput.files && uploadPdfFileInput.files[0];
        uploadPdfFileName.textContent = file ? file.name : 'No file chosen';
    });
}
async function doUploadPdf() {
    const name = (uploadPdfNameInput.value || '').trim();
    const file = uploadPdfFileInput.files && uploadPdfFileInput.files[0];
    if (!name) {
        return;
    }
    if (!file) {
        return;
    }
    uploadPdfSaveBtn.disabled = true;
    uploadPdfSaveBtn.textContent = 'Uploading...';
    try {
        const form = new FormData();
        form.append('name', name);
        if (selectedFolder) form.append('folder', selectedFolder);
        form.append('file', file);
        const resp = await fetch('/pdf/upload', {
            method: 'POST',
            body: form
        });
        const out = await resp.json().catch(() => ({}));
        if (!resp.ok || !out.ok) {
            throw new Error(out.detail || 'Upload failed');
        }
        await loadPdfs();
        closeUploadModal();
    } catch (e) { } finally {
        uploadPdfSaveBtn.disabled = false;
        uploadPdfSaveBtn.textContent = 'Upload';
    }
}
if (uploadPdfSaveBtn) uploadPdfSaveBtn.addEventListener('click', () => {
    doUploadPdf();
});

function openRenameModal(name) {
    if (!renamePdfModal) return;
    selectedPdfName = name;
    renamePdfNameInput.value = name;
    renamePdfStatus.textContent = '';
    renamePdfModal.classList.add('is-open');
    renamePdfModal.setAttribute('aria-hidden', 'false');
}

function closeRenameModal() {
    if (!renamePdfModal) return;
    renamePdfModal.classList.remove('is-open');
    renamePdfModal.setAttribute('aria-hidden', 'true');
}
if (renamePdfCancelBtn) renamePdfCancelBtn.addEventListener('click', closeRenameModal);
if (renamePdfModal) renamePdfModal.addEventListener('click', (e) => {
    if (e.target && e.target.dataset && e.target.dataset.closeRename === 'true') closeRenameModal();
});
async function doRenamePdf() {
    const next = (renamePdfNameInput.value || '').trim();
    if (!selectedPdfName) return;
    if (!next) {
        renamePdfStatus.textContent = 'Enter name';
        return;
    }
    if (next === selectedPdfName) {
        closeRenameModal();
        return;
    }
    renamePdfSaveBtn.disabled = true;
    renamePdfSaveBtn.textContent = 'Saving...';
    renamePdfStatus.textContent = '';
    try {
        const resp = await fetch('/pdf/rename', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                old_name: selectedPdfName,
                new_name: next
            })
        });
        const out = await resp.json().catch(() => ({}));
        if (!resp.ok || !out.ok) {
            throw new Error(out.detail || 'Rename failed');
        }
        await loadPdfs();
        closeRenameModal();
    } catch (e) {
        renamePdfStatus.textContent = String(e && e.message ? e.message : e || 'Rename failed');
    } finally {
        renamePdfSaveBtn.disabled = false;
        renamePdfSaveBtn.textContent = 'Save';
    }
}
if (renamePdfSaveBtn) renamePdfSaveBtn.addEventListener('click', () => {
    doRenamePdf();
});

function openCreateFolderModal() {
    createPdfFolderStatus.textContent = '';
    createPdfFolderNameInput.value = '';
    createPdfFolderModal.classList.add('is-open');
    createPdfFolderModal.setAttribute('aria-hidden', 'false');
}

function closeCreateFolderModal() {
    createPdfFolderModal.classList.remove('is-open');
    createPdfFolderModal.setAttribute('aria-hidden', 'true');
}
if (createPdfFolderCancelBtn) createPdfFolderCancelBtn.addEventListener('click', closeCreateFolderModal);
if (createPdfFolderModal) createPdfFolderModal.addEventListener('click', (e) => {
    if (e.target && e.target.dataset && e.target.dataset.closeCreateFolder === 'true') closeCreateFolderModal();
});
async function doCreateFolder() {
    const raw = (createPdfFolderNameInput.value || '').trim();
    if (!raw) {
        createPdfFolderStatus.textContent = 'Enter folder name';
        return;
    }
    createPdfFolderSaveBtn.disabled = true;
    createPdfFolderSaveBtn.textContent = 'Creating...';
    createPdfFolderStatus.textContent = '';
    try {
        const resp = await fetch('/pdf/folder/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: raw
            })
        });
        const out = await resp.json().catch(() => ({}));
        if (!resp.ok || !out.ok) throw new Error(out.detail || 'Create failed');
        await loadFolders();
        closeCreateFolderModal();
    } catch (e) {
        createPdfFolderStatus.textContent = String(e && e.message ? e.message : e || 'Create failed');
    } finally {
        createPdfFolderSaveBtn.disabled = false;
        createPdfFolderSaveBtn.textContent = 'Create';
    }
}
if (createPdfFolderSaveBtn) createPdfFolderSaveBtn.addEventListener('click', () => {
    doCreateFolder();
});

async function doRenamePdfFolder(oldName, nextName) {
    const old = (oldName || '').trim();
    const next = (nextName || '').trim();
    if (!old || !next || next === old) return;
    try {
        const resp = await fetch('/pdf/folder/rename', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                old_name: old,
                new_name: next
            })
        });
        const out = await resp.json().catch(() => ({}));
        if (!resp.ok || !out.ok) {
            alert(out.detail || 'Rename failed');
            return;
        }
        if (selectedFolder === old) {
            selectedFolder = next;
            const params = new URLSearchParams(window.location.search);
            params.set('folder', next);
            window.history.replaceState(null, '', `/pdf?${params.toString()}`);
            updatePdfHeader();
        }
        await Promise.all([loadFolders(), loadPdfs()]);
    } catch (e) {
        alert(String(e && e.message ? e.message : e || 'Rename failed'));
    }
}

async function doDeletePdfFolder(name) {
    const safe = (name || '').trim();
    if (!safe) return;
    if (safe === 'Uncategorized') {
        alert('Cannot delete Uncategorized');
        return;
    }
    const ok = confirm(`Delete folder "${safe}"? PDFs inside will move to Uncategorized.`);
    if (!ok) return;
    try {
        const resp = await fetch('/pdf/folder/delete', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: safe
            })
        });
        const out = await resp.json().catch(() => ({}));
        if (!resp.ok || !out.ok) {
            alert(out.detail || 'Delete failed');
            return;
        }
        if (selectedFolder === safe) {
            window.location.href = '/pdf';
            return;
        }
        await Promise.all([loadFolders(), loadPdfs()]);
    } catch (e) {
        alert(String(e && e.message ? e.message : e || 'Delete failed'));
    }
}

async function doMovePdfFolder(name) {
    const src = (name || '').trim();
    if (!src) return;
    const target = prompt('Move all PDFs from this folder to (empty for Uncategorized)', '');
    if (target === null) return;
    const trimmed = (target || '').trim();
    try {
        const resp = await fetch('/pdf/folder/move', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                source: src,
                target: trimmed || null
            })
        });
        const out = await resp.json().catch(() => ({}));
        if (!resp.ok || !out.ok) {
            alert(out.detail || 'Move failed');
            return;
        }
        await Promise.all([loadFolders(), loadPdfs()]);
    } catch (e) {
        alert(String(e && e.message ? e.message : e || 'Move failed'));
    }
}

function ensurePlaceholder(container) {
    if (!container) return null;
    let ph = container.querySelector('.drop-placeholder');
    if (!ph) {
        ph = document.createElement('div');
        ph.className = 'drop-placeholder';
    }
    let h = dragTileHeight || 48;
    if (!h) {
        const src = container.querySelector('.deck-tile');
        if (src) {
            const r = src.getBoundingClientRect();
            h = Math.max(40, Math.round(r.height));
        }
    }
    ph.style.height = h + 'px';
    if (!ph.parentElement) container.appendChild(ph);
    return ph;
}

function removePlaceholder(container) {
    const ph = container ? container.querySelector('.drop-placeholder') : null;
    if (ph && ph.parentElement) ph.parentElement.removeChild(ph);
}

function placePlaceholder(container, index) {
    if (!container) return;
    const tiles = Array.from(container.querySelectorAll('.deck-tile'));
    const ph = ensurePlaceholder(container);
    if (!tiles.length) return;
    const clamped = Math.max(0, Math.min(index, tiles.length));
    if (clamped >= tiles.length) container.appendChild(ph);
    else container.insertBefore(ph, tiles[clamped]);
}

function indexFromFinger(container, fingerY) {
    const tiles = Array.from(container.querySelectorAll('.deck-tile'));
    for (let i = 0; i < tiles.length; i++) {
        const r = tiles[i].getBoundingClientRect();
        const mid = r.top + r.height / 2;
        if (fingerY < mid) return i;
    }
    return tiles.length;
}
async function writePdfOrder(names, scope) {
    try {
        await fetch('/order/pdfs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                scope: scope || 'root',
                order: names
            })
        });
    } catch (e) { }
}

function attachPdfDnD(tile, name, scope) {
    tile.setAttribute('draggable', 'true');
    tile.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        dragTileEl = tile;
        dragTileHeight = Math.round(tile.getBoundingClientRect().height);
        tile.classList.add('is-dragging-hidden');
        const tiles = Array.from(pdfListEl.querySelectorAll('.deck-tile'));
        const idx = tiles.indexOf(tile);
        placePlaceholder(pdfListEl, idx < 0 ? 0 : idx);
    });
    tile.addEventListener('dragover', (e) => {
        e.preventDefault();
        const tiles = Array.from(pdfListEl.querySelectorAll('.deck-tile'));
        const idx = tiles.indexOf(tile);
        placePlaceholder(pdfListEl, idx < 0 ? 0 : idx);
    });
    tile.addEventListener('drop', async (e) => {
        e.preventDefault();
        const ph = pdfListEl.querySelector('.drop-placeholder');
        if (ph && dragTileEl) {
            pdfListEl.insertBefore(dragTileEl, ph);
        }
        removePlaceholder(pdfListEl);
        tile.classList.remove('is-dragging-hidden');
        const newOrder = Array.from(pdfListEl.querySelectorAll('.deck-title')).map(el => {
            const d = el.dataset && el.dataset.name ? el.dataset.name : el.textContent;
            return d;
        });
        await writePdfOrder(newOrder, scope || 'root');
        dragTileEl = null;
        dragTileHeight = 0;
    });
    tile.addEventListener('dragend', () => {
        tile.classList.remove('is-dragging-hidden');
        removePlaceholder(pdfListEl);
        dragTileEl = null;
        dragTileHeight = 0;
    });
    attachTouchDnD(tile, name, scope);
}

function attachTouchDnD(tile, name, scope) {
    if (!isCoarsePointer) return;
    let dragging = false;
    let pressTimer = null;
    let fingerY = 0;
    let startY = 0;
    const LONG_PRESS_MS = 2000;
    const MOVE_CANCEL_PX = 10;

    function start(y) {
        startY = y;
        pressTimer = setTimeout(() => {
            dragging = true;
            dragTileEl = tile;
            dragTileHeight = Math.round(tile.getBoundingClientRect().height);
            tile.classList.add('is-dragging-hidden');
            tile.style.touchAction = 'none';
            document.body.style.overflow = 'hidden';
            const tiles = Array.from(pdfListEl.querySelectorAll('.deck-tile'));
            const idx = tiles.indexOf(tile);
            placePlaceholder(pdfListEl, idx < 0 ? 0 : idx);
        }, LONG_PRESS_MS);
    }

    function clearPress() {
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
        }
    }
    async function commit() {
        if (!dragging) return;
        dragging = false;
        document.body.style.overflow = '';
        const ph = pdfListEl.querySelector('.drop-placeholder');
        if (ph && dragTileEl) {
            pdfListEl.insertBefore(dragTileEl, ph);
        }
        removePlaceholder(pdfListEl);
        tile.classList.remove('is-dragging-hidden');
        tile.style.touchAction = 'auto';
        const newOrder = Array.from(pdfListEl.querySelectorAll('.deck-title')).map(el => el.textContent);
        await writePdfOrder(newOrder, scope || 'root');
        dragTileEl = null;
        dragTileHeight = 0;
    }
    tile.style.touchAction = 'auto';
    tile.style.userSelect = 'none';
    tile.addEventListener('touchstart', (e) => {
        const t = e.touches && e.touches[0];
        if (!t) return;
        start(t.clientY);
    }, {
        passive: true
    });
    tile.addEventListener('touchmove', (e) => {
        const t = e.touches && e.touches[0];
        if (!t) return;
        fingerY = t.clientY;
        if (!dragging) {
            if (Math.abs((t.clientY) - startY) > MOVE_CANCEL_PX) {
                clearPress();
            }
            return;
        }
        e.preventDefault();
        const idx = indexFromFinger(pdfListEl, fingerY);
        placePlaceholder(pdfListEl, idx);
    }, {
        passive: false
    });
    tile.addEventListener('touchend', () => {
        clearPress();
        commit();
    });
}

function buildRootFolderGrid() {
    if (!pdfRootFolderGrid) return;
    pdfRootFolderGrid.innerHTML = '';
    const allFolders = Array.isArray(folderItems) ? folderItems.slice() : [];
    const roots = allFolders.filter(f => !f.parent);
    if (!roots.length) {
        pdfRootFolderGrid.style.display = selectedFolder ? 'none' : 'grid';
        return;
    }
    const pdfCounts = {};
    pdfItems.forEach(p => {
        const f = p.folder || 'Uncategorized';
        pdfCounts[f] = (pdfCounts[f] || 0) + 1;
    });

    function getTotalPdfCount(folderName) {
        let total = pdfCounts[folderName] || 0;
        const children = allFolders.filter(f => f.parent === folderName);
        children.forEach(child => {
            total += getTotalPdfCount(child.name);
        });
        return total;
    }
    pdfRootFolderGrid.style.display = selectedFolder ? 'none' : 'grid';
    roots.forEach((f, i) => {
        const tile = document.createElement('div');
        tile.className = 'deck-tile tile-enter pdf-folder-tile';
        tile.style.animationDelay = `${i * 40}ms`;
        const main = document.createElement('div');
        main.className = 'pdf-folder-tile-main';
        const title = document.createElement('div');
        title.className = 'deck-title';
        title.textContent = f.name;
        const sub = document.createElement('div');
        sub.className = 'deck-subtitle';
        const subFolderCount = allFolders.filter(x => x.parent === f.name).length;
        const totalPdfs = getTotalPdfCount(f.name);
        if (subFolderCount > 0) {
            sub.textContent = `${subFolderCount} folder${subFolderCount === 1 ? '' : 's'} · ${totalPdfs} PDF${totalPdfs === 1 ? '' : 's'}`;
        } else {
            sub.textContent = `${totalPdfs} PDF${totalPdfs === 1 ? '' : 's'}`;
        }
        main.appendChild(title);
        main.appendChild(sub);
        tile.appendChild(main);
        if (f.name !== 'Uncategorized') {
            const kebab = document.createElement('button');
            kebab.className = 'kebab-btn folder-kebab-btn';
            kebab.type = 'button';
            kebab.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">more_vert</span>';
            const menu = document.createElement('div');
            menu.className = 'kebab-menu';
            const renameBtn = document.createElement('button');
            renameBtn.type = 'button';
            renameBtn.textContent = 'Rename folder';
            renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.classList.remove('is-open');
                const next = prompt('New folder name', f.name);
                if (next === null) return;
                doRenamePdfFolder(f.name, next);
            });
            const moveBtn = document.createElement('button');
            moveBtn.type = 'button';
            moveBtn.textContent = 'Move all PDFs...';
            moveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.classList.remove('is-open');
                doMovePdfFolder(f.name);
            });
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.textContent = 'Delete folder';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.classList.remove('is-open');
                doDeletePdfFolder(f.name);
            });
            menu.appendChild(renameBtn);
            menu.appendChild(moveBtn);
            menu.appendChild(deleteBtn);
            kebab.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = menu.classList.contains('is-open');
                document.querySelectorAll('.kebab-menu.is-open').forEach(m => {
                    m.classList.remove('is-open');
                    const p = m.closest('.deck-tile');
                    if (p) p.classList.remove('menu-open');
                });
                if (!isOpen) {
                    menu.classList.add('is-open');
                    tile.classList.add('menu-open');
                } else {
                    tile.classList.remove('menu-open');
                }
            });
            tile.appendChild(menu);
            tile.appendChild(kebab);
        }
        tile.addEventListener('click', (e) => {
            if (e.target.closest('.kebab-btn') || e.target.closest('.kebab-menu')) return;
            window.location.href = `/pdf?folder=${encodeURIComponent(f.name)}`;
        });
        pdfRootFolderGrid.appendChild(tile);
    });
    const createTile = document.createElement('div');
    createTile.className = 'deck-tile tile-enter create-tile';
    createTile.style.animationDelay = `${roots.length * 40}ms`;
    const plus = document.createElement('div');
    plus.className = 'create-tile__icon';
    plus.textContent = '+';
    createTile.appendChild(plus);
    createTile.addEventListener('click', () => {
        openCreateFolderModal();
    });
    pdfRootFolderGrid.appendChild(createTile);
}

function buildMovePdfBrowserTree() {
    movePdfParentByName = {};
    movePdfChildrenByParent = {};
    const raw = Array.isArray(folderItems) ? folderItems.slice() : [];
    const seen = new Set();
    raw.forEach((f) => {
        const nm = (f && f.name) ? f.name : String(f);
        if (nm === 'Uncategorized') return;
        if (seen.has(nm)) return;
        seen.add(nm);
        const parent = f && f.parent ? f.parent : '';
        movePdfParentByName[nm] = parent || '';
        const key = parent || MOVE_PDF_BROWSER_ROOT;
        if (!movePdfChildrenByParent[key]) movePdfChildrenByParent[key] = [];
        movePdfChildrenByParent[key].push(nm);
    });
    if (!movePdfChildrenByParent[MOVE_PDF_BROWSER_ROOT]) movePdfChildrenByParent[MOVE_PDF_BROWSER_ROOT] = [];
    if (!movePdfChildrenByParent[MOVE_PDF_BROWSER_ROOT].includes('Uncategorized')) {
        movePdfChildrenByParent[MOVE_PDF_BROWSER_ROOT].push('Uncategorized');
        movePdfParentByName['Uncategorized'] = '';
    }
}

function getMovePdfPath() {
    const path = [];
    let current = movePdfBrowserCursor;
    const visited = new Set();
    while (current && current !== MOVE_PDF_BROWSER_ROOT && !visited.has(current)) {
        visited.add(current);
        path.unshift(current);
        const parent = movePdfParentByName[current] || '';
        if (!parent) break;
        current = parent;
    }
    return path;
}

function renderMovePdfBrowser() {
    if (!movePdfList) return;
    movePdfList.innerHTML = '';
    const path = getMovePdfPath();
    const headerRow = document.createElement('div');
    headerRow.className = 'multi-deck-item';
    const headerSpan = document.createElement('span');
    headerSpan.style.fontWeight = '600';
    headerSpan.textContent = path.length ? `Location: Root / ${path.join(' / ')}` : 'Location: Root';
    headerRow.appendChild(headerSpan);
    movePdfList.appendChild(headerRow);
    if (movePdfBrowserCursor !== MOVE_PDF_BROWSER_ROOT) {
        const upBtn = document.createElement('button');
        upBtn.type = 'button';
        upBtn.className = 'multi-deck-item';
        upBtn.textContent = 'Up one level';
        upBtn.addEventListener('click', () => {
            const current = movePdfBrowserCursor;
            const parent = movePdfParentByName[current] || '';
            movePdfBrowserCursor = parent ? parent : MOVE_PDF_BROWSER_ROOT;
            renderMovePdfBrowser();
        });
        movePdfList.appendChild(upBtn);
    }
    const key = movePdfBrowserCursor === MOVE_PDF_BROWSER_ROOT ? MOVE_PDF_BROWSER_ROOT : movePdfBrowserCursor;
    const children = (movePdfChildrenByParent[key] || []).slice().sort((a, b) => a.localeCompare(b));
    children.forEach((name) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'multi-deck-item';
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';
        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined multi-deck-item-icon';
        icon.textContent = name === 'Uncategorized' ? 'category' : 'folder';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'multi-deck-item-label';
        nameSpan.textContent = name;
        row.appendChild(icon);
        row.appendChild(nameSpan);
        if (name !== 'Uncategorized') {
            const icon = document.createElement('span');
            icon.className = 'material-symbols-outlined multi-deck-item-chevron';
            icon.textContent = 'chevron_right';
            row.appendChild(icon);
        }
        btn.appendChild(row);
        btn.addEventListener('click', () => {
            movePdfBrowserCursor = name;
            renderMovePdfBrowser();
        });
        movePdfList.appendChild(btn);
    });
    if (movePdfSaveBtn) movePdfSaveBtn.disabled = movePdfBrowserCursor === MOVE_PDF_BROWSER_ROOT;
}

async function loadPdfFoldersIntoMoveList() {
    if (!movePdfList) return;
    movePdfList.innerHTML = '';
    let raw = [];
    if (Array.isArray(folderItems) && folderItems.length) {
        raw = folderItems.slice();
    } else {
        try {
            const resp = await fetch('/pdf/folders');
            const data = await resp.json().catch(() => ({
                folders: []
            }));
            raw = Array.isArray(data.folders) ? data.folders : [];
            folderItems = raw.slice();
        } catch {
            raw = [];
        }
    }
    buildMovePdfBrowserTree();
    movePdfBrowserCursor = MOVE_PDF_BROWSER_ROOT;
    renderMovePdfBrowser();
}

function openMovePdfModal() {
    if (!selectedPdfForMove) return;
    if (!movePdfModal) return;
    movePdfStatus.textContent = '';
    loadPdfFoldersIntoMoveList();
    movePdfModal.classList.add('is-open');
    movePdfModal.setAttribute('aria-hidden', 'false');
}

function buildPdfUrl(item) {
    const file = item.file || '';
    if (!file) return '';
    const key = file.startsWith('/') ? file.slice(1) : file;
    return `/r2/get?key=${encodeURIComponent(key)}`;
}

function buildPdfThumbUrl(item) {
    const t = item.thumb || '';
    if (!t) return '';
    const key = t.startsWith('/') ? t.slice(1) : t;
    return `/r2/get?key=${encodeURIComponent(key)}`;
}

function renderPdfList() {
    pdfListEl.innerHTML = '';
    if (!selectedFolder) {
        if (pdfListEl) pdfListEl.style.display = 'none';
        return;
    }
    if (!Array.isArray(pdfItems) || !pdfItems.length) {
        if (pdfListEl) pdfListEl.style.display = 'none';
        return;
    }
    if (pdfListEl) pdfListEl.style.display = 'grid';
    let base = pdfItems.slice();
    if (selectedFolder) {
        base = base.filter(p => (p.folder || 'Uncategorized') === selectedFolder);
    }
    const scope = selectedFolder || 'root';
    base.forEach((p, i) => {
        const tile = document.createElement('div');
        tile.className = 'deck-tile tile-enter';
        tile.style.animationDelay = `${i * 40}ms`;
        const thumbWrap = document.createElement('div');
        thumbWrap.className = 'pdf-thumb-wrap';
        const img = document.createElement('img');
        const thumbUrl = buildPdfThumbUrl(p);
        img.src = thumbUrl || '';
        img.alt = p.name || 'PDF';
        img.className = 'pdf-thumb-img';
        img.loading = 'lazy';
        thumbWrap.appendChild(img);
        tile.appendChild(thumbWrap);
        const headerRow = document.createElement('div');
        headerRow.className = 'pdf-card-header';
        const title = document.createElement('div');
        title.className = 'deck-title pdf-card-title';
        title.dataset.name = p.name;
        const displayName = (p.name || '').split('_').join(' ');
        title.textContent = displayName;
        const subtitle = document.createElement('div');
        subtitle.className = 'deck-subtitle pdf-card-subtitle';
        subtitle.textContent = p.folder ? p.folder : 'Uncategorized';
        const kebab = document.createElement('button');
        kebab.type = 'button';
        kebab.className = 'kebab-btn pdf-kebab-btn';
        kebab.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">more_vert</span>';
        const menu = document.createElement('div');
        menu.className = 'kebab-menu';
        const renameBtn = document.createElement('button');
        renameBtn.type = 'button';
        renameBtn.textContent = 'Rename';
        renameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.remove('is-open');
            tile.classList.remove('menu-open');
            openRenameModal(p.name);
        });
        const moveBtn = document.createElement('button');
        moveBtn.type = 'button';
        moveBtn.textContent = 'Move to folder';
        moveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.remove('is-open');
            tile.classList.remove('menu-open');
            selectedPdfForMove = p.name;
            openMovePdfModal();
        });
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            menu.classList.remove('is-open');
            tile.classList.remove('menu-open');
            const ok = confirm(`Delete PDF "${p.name}"?`);
            if (!ok) return;
            try {
                const resp = await fetch('/pdf/delete', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: p.name
                    })
                });
                const out = await resp.json().catch(() => ({}));
                if (!resp.ok || !out.ok) {
                    alert(out.detail || 'Delete failed');
                    return;
                }
                await loadPdfs();
            } catch (err) {
                alert(String(err && err.message ? err.message : err || 'Delete failed'));
            }
        });
        const replaceBtn = document.createElement('button');
        replaceBtn.type = 'button';
        replaceBtn.textContent = 'Replace';
        const replaceInput = document.createElement('input');
        replaceInput.type = 'file';
        replaceInput.accept = 'application/pdf';
        replaceInput.style.display = 'none';
        replaceInput.addEventListener('change', async () => {
            const file = replaceInput.files && replaceInput.files[0];
            if (!file) return;
            showLoader();
            try {
                const form = new FormData();
                form.append('name', p.name);
                if (p.folder) form.append('folder', p.folder);
                form.append('file', file);
                const resp = await fetch('/pdf/upload', { method: 'POST', body: form });
                const out = await resp.json().catch(() => ({}));
                if (!resp.ok || !out.ok) throw new Error(out.detail || 'Replace failed');
                await loadPdfs();
            } catch (err) {
                alert(String(err && err.message ? err.message : err || 'Replace failed'));
            } finally {
                hideLoader();
                replaceInput.value = '';
            }
        });
        replaceInput.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        replaceBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            menu.classList.remove('is-open');
            tile.classList.remove('menu-open');
            replaceInput.click();
        });
        document.body.appendChild(replaceInput);
        menu.appendChild(renameBtn);
        menu.appendChild(moveBtn);
        menu.appendChild(replaceBtn);
        menu.appendChild(deleteBtn);
        kebab.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = menu.classList.contains('is-open');
            document.querySelectorAll('.kebab-menu.is-open').forEach(m => {
                m.classList.remove('is-open');
                const p = m.closest('.deck-tile');
                if (p) p.classList.remove('menu-open');
            });
            const parentTile = kebab.closest('.deck-tile');
            if (!isOpen) {
                menu.classList.add('is-open');
                if (parentTile) parentTile.classList.add('menu-open');
            } else if (parentTile) {
                parentTile.classList.remove('menu-open');
            }
        });
        const actions = document.createElement('div');
        actions.className = 'pdf-kebab-actions';
        actions.appendChild(kebab);
        actions.appendChild(menu);
        headerRow.appendChild(title);
        headerRow.appendChild(actions);
        tile.appendChild(headerRow);
        tile.appendChild(subtitle);
        tile.addEventListener('click', () => {
            const url = buildPdfUrl(p);
            if (url) {
                window.open(url, '_blank');
            }
        });
        pdfListEl.appendChild(tile);
        attachPdfDnD(tile, p.name, scope);
    });
}
async function loadPdfs() {
    try {
        const resp = await fetch('/pdfs');
        const data = await resp.json().catch(() => []);
        pdfItems = Array.isArray(data) ? data : [];
        renderPdfList();
        buildRootFolderGrid();
    } catch (e) { }
}
async function loadFolders() {
    try {
        const resp = await fetch('/pdf/folders');
        const data = await resp.json().catch(() => ({
            folders: []
        }));
        folderItems = Array.isArray(data.folders) ? data.folders : [];
        buildRootFolderGrid();
    } catch (e) { }
}

async function doMovePdf() {
    if (!selectedPdfForMove) return;
    if (!movePdfBrowserCursor || movePdfBrowserCursor === MOVE_PDF_BROWSER_ROOT) {
        movePdfStatus.textContent = 'Choose a folder first';
        return;
    }
    const targetFolder = movePdfBrowserCursor;
    movePdfSaveBtn.disabled = true;
    movePdfSaveBtn.textContent = 'Moving...';
    movePdfStatus.textContent = '';
    try {
        const resp = await fetch('/pdf/move', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: selectedPdfForMove,
                folder: targetFolder === 'Uncategorized' ? null : targetFolder
            })
        });
        const out = await resp.json().catch(() => ({
            ok: false
        }));
        if (!resp.ok || !out.ok) throw new Error(out.detail || 'Failed to move');
        movePdfStatus.textContent = 'Moved';
        await loadPdfs();
        movePdfModal.classList.remove('is-open');
        movePdfModal.setAttribute('aria-hidden', 'true');
    } catch (err) {
        movePdfStatus.textContent = String(err.message || err);
    } finally {
        movePdfSaveBtn.disabled = false;
        movePdfSaveBtn.textContent = 'Move';
    }
}

function init() {
    showLoader();
    Promise.all([loadPdfs(), loadFolders()]).finally(() => {
        updatePdfHeader();
        hideLoader();
    });
}
window.addEventListener('load', init);
document.addEventListener('click', (e) => {
    if (!e.target.closest('.kebab-btn') && !e.target.closest('.kebab-menu')) {
        document.querySelectorAll('.kebab-menu.is-open').forEach(m => {
            m.classList.remove('is-open');
            const p = m.closest('.deck-tile');
            if (p) p.classList.remove('menu-open');
        });
    }
});
if (movePdfCancelBtn) movePdfCancelBtn.addEventListener('click', () => {
    if (!movePdfModal) return;
    movePdfModal.classList.remove('is-open');
    movePdfModal.setAttribute('aria-hidden', 'true');
});
if (movePdfModal) movePdfModal.addEventListener('click', (e) => {
    if (e.target && e.target.dataset && e.target.dataset.closeMovePdf === 'true') {
        movePdfModal.classList.remove('is-open');
        movePdfModal.setAttribute('aria-hidden', 'true');
    }
});
if (movePdfSaveBtn) movePdfSaveBtn.addEventListener('click', () => {
    doMovePdf();
});