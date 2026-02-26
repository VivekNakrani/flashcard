const backBtn = document.getElementById('backBtn');
        const folderTitle = document.getElementById('folderTitle');
        const deckList = document.getElementById('deckList');
        const globalLoader = document.getElementById('globalLoader');
        const chooseActionModal = document.getElementById('chooseActionModal');
        const openLearnBtn = document.getElementById('openLearnBtn');
        const openFlashBtn = document.getElementById('openFlashBtn');
        let openSpellingBtn = document.getElementById('openSpellingBtn');
        let openLineBtn = document.getElementById('openLineBtn');
        let openMatchBtn = document.getElementById('openMatchBtn');
        const openSettingsBtn = document.getElementById('openSettingsBtn');
        const studyActionsEl = document.querySelector('#chooseActionModal .study-actions');
        if (!openSpellingBtn && studyActionsEl) {
            const btn = document.createElement('button');
            btn.id = 'openSpellingBtn';
            btn.className = 'study-action study-action--secondary';
            btn.type = 'button';
            btn.innerHTML = '<span class="material-symbols-outlined study-action__icon" aria-hidden="true">spellcheck</span><span>Spelling</span>';
            studyActionsEl.appendChild(btn);
            openSpellingBtn = btn;
        }
        if (!openLineBtn && studyActionsEl) {
            const btn2 = document.createElement('button');
            btn2.id = 'openLineBtn';
            btn2.className = 'study-action study-action--secondary';
            btn2.type = 'button';
            btn2.innerHTML = '<span class="material-symbols-outlined study-action__icon" aria-hidden="true">subtitles</span><span>Line</span>';
            studyActionsEl.appendChild(btn2);
            openLineBtn = btn2;
        }
        if (!openMatchBtn && studyActionsEl) {
            const btn3 = document.createElement('button');
            btn3.id = 'openMatchBtn';
            btn3.className = 'study-action study-action--secondary';
            btn3.type = 'button';
            btn3.innerHTML = '<span class="material-symbols-outlined study-action__icon" aria-hidden="true">swap_horiz</span><span>Match</span>';
            studyActionsEl.appendChild(btn3);
            openMatchBtn = btn3;
        }
        const moveDeckModal = document.getElementById('moveDeckModal');
        const moveDeckList = document.getElementById('moveDeckList');
        const moveDeckCancelBtn = document.getElementById('moveDeckCancelBtn');
        const moveDeckSaveBtn = document.getElementById('moveDeckSaveBtn');
        const moveDeckStatus = document.getElementById('moveDeckStatus');
        const MOVE_BROWSER_ROOT = '__root__';
        let moveDeckBrowserCursor = MOVE_BROWSER_ROOT;
        let moveDeckParentByName = {};
        let moveDeckChildrenByParent = {};
        const deckSettingsModal = document.getElementById('deckSettingsModal');
        const deckSettingsMoveBtn = document.getElementById('deckSettingsMoveBtn');
        const deckSettingsDeleteBtn = document.getElementById('deckSettingsDeleteBtn');
        let selectedDeckForAction = '';

        const ordersCache = {
            folders: [],
            decks: {}
        };
        async function writeOrder(type, names, scope) {
            if (type === 'folder') {
                const resp = await fetch('/order/folders', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        order: names
                    })
                });
                if (resp.ok) {
                    ordersCache.folders = Array.isArray(names) ? names.slice() : [];
                    // Update CACHE_FOLDERS data in sessionStorage so navigation preserves order
                    const cached = getCache(CACHE_FOLDERS);
                    if (cached) {
                        saveCache(CACHE_FOLDERS, cached); // Re-save with updated timestamp
                    }
                }
            } else {
                const key = scope || 'root';
                const resp = await fetch('/order/decks', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        scope: key,
                        order: names
                    })
                });
                if (resp.ok) {
                    ordersCache.decks[key] = Array.isArray(names) ? names.slice() : [];
                    // Update deck cache in sessionStorage
                    const cached = getCache(CACHE_DECKS);
                    if (cached) {
                        saveCache(CACHE_DECKS, cached); // Re-save with updated timestamp
                    }
                }
            }
        }
        async function refreshDeckOrder(scope) {
            const key = scope || 'root';
            try {
                const resp = await fetch(`/order/decks?scope=${encodeURIComponent(key)}`);
                const arr = await resp.json().catch(() => []);
                ordersCache.decks[key] = Array.isArray(arr) ? arr : [];
            } catch {
                ordersCache.decks[key] = [];
            }
        }

        function applyOrder(list, type, scope) {
            const saved = type === 'folder' ? ordersCache.folders : (ordersCache.decks[scope || 'root'] || []);
            if (!Array.isArray(saved) || !saved.length) return list.slice();
            const indexByName = new Map(list.map((x, i) => [x.name, i]));
            const ordered = [];
            saved.forEach((n) => {
                const idx = indexByName.get(n);
                if (idx !== undefined) ordered.push(list[idx]);
            });
            list.forEach((x) => {
                if (!saved.includes(x.name)) ordered.push(x);
            });
            return ordered;
        }
        let draggingDeck = null;
        let dragTileEl = null;
        let dragTileHeight = 0;
        const isCoarsePointer = ("ontouchstart" in window) || window.matchMedia('(pointer: coarse)').matches;

        function ensurePlaceholder(container) {
            if (!container) return null;
            let ph = container.querySelector('.drop-placeholder');
            if (!ph) {
                ph = document.createElement('div');
                ph.className = 'drop-placeholder';
                ph.style.height = '48px';
                ph.style.margin = '8px 0';
                ph.style.border = '2px dashed var(--text-secondary)';
                ph.style.borderRadius = '12px';
                ph.style.background = '#eef0f4';
            } {
                let __h = dragTileHeight || 48;
                if (!__h) {
                    const __src = container.querySelector('.deck-tile');
                    if (__src) {
                        const __r = __src.getBoundingClientRect();
                        __h = Math.max(40, Math.round(__r.height));
                    }
                }
                ph.style.height = __h + 'px';
            }
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

        function attachTouchDnD(tile, name, scope, container) {
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
                    const tiles = Array.from(container.querySelectorAll('.deck-tile'));
                    const idx = tiles.indexOf(tile);
                    placePlaceholder(container, idx < 0 ? 0 : idx);
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
                const ph = container.querySelector('.drop-placeholder');
                if (ph && dragTileEl) {
                    container.insertBefore(dragTileEl, ph);
                }
                removePlaceholder(container);
                tile.classList.remove('is-dragging-hidden');
                tile.style.touchAction = 'auto';
                const newOrder = Array.from(container.querySelectorAll('.deck-title')).map(el => el.textContent);
                await writeOrder('deck', newOrder, scope);
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
                const idx = indexFromFinger(container, fingerY);
                placePlaceholder(container, idx);
            }, {
                passive: false
            });
            tile.addEventListener('touchend', () => {
                clearPress();
                commit();
            });
            tile.addEventListener('touchcancel', () => {
                clearPress();
                dragging = false;
                document.body.style.overflow = '';
                tile.classList.remove('is-dragging-hidden');
                tile.style.touchAction = 'auto';
                removePlaceholder(container);
                dragTileEl = null;
                dragTileHeight = 0;
            });
        }

        function attachDeckDnD(tile, name, scope) {
            tile.setAttribute('draggable', 'true');
            tile.addEventListener('dragstart', (e) => {
                draggingDeck = name;
                draggingDeckName = name; // For sub-folder drop detection
                e.dataTransfer.effectAllowed = 'move';
                dragTileEl = tile;
                dragTileHeight = Math.round(tile.getBoundingClientRect().height);
                tile.classList.add('is-dragging-hidden');
                const tiles = Array.from(deckList.querySelectorAll('.deck-tile'));
                const idx = tiles.indexOf(tile);
                placePlaceholder(deckList, idx < 0 ? 0 : idx);
            });
            tile.addEventListener('dragover', (e) => {
                e.preventDefault();
                const tiles = Array.from(deckList.querySelectorAll('.deck-tile'));
                const idx = tiles.indexOf(tile);
                placePlaceholder(deckList, idx < 0 ? 0 : idx);
            });
            tile.addEventListener('drop', async (e) => {
                e.preventDefault();
                const target = name;
                const dragged = draggingDeck;
                draggingDeck = null;
                const ph = deckList.querySelector('.drop-placeholder');
                if (ph && dragTileEl) {
                    deckList.insertBefore(dragTileEl, ph);
                }
                removePlaceholder(deckList);
                tile.classList.remove('is-dragging-hidden');
                const newOrder = Array.from(deckList.querySelectorAll('.deck-title')).map(el => el.textContent);
                await writeOrder('deck', newOrder, scope);
                dragTileEl = null;
                dragTileHeight = 0;
                draggingDeckName = null;
                clearFolderDropState();
            });
            tile.addEventListener('dragend', () => {
                tile.classList.remove('is-dragging-hidden');
                removePlaceholder(deckList);
                dragTileEl = null;
                dragTileHeight = 0;
                draggingDeckName = null;
                clearFolderDropState();
            });
            attachTouchDnD(tile, name, scope, deckList);
        }

        function showLoader() {
            if (globalLoader) globalLoader.classList.add('is-active');
        }

        function hideLoader() {
            if (globalLoader) globalLoader.classList.remove('is-active');
        }

        const breadcrumb = document.getElementById('breadcrumb');
        const subFoldersSection = document.getElementById('subFoldersSection');
        const subFolderGrid = document.getElementById('subFolderGrid');
        const decksHeader = document.getElementById('decksHeader');

        const params = new URLSearchParams(location.search);
        const folder = params.get('name') || 'Uncategorized';
        folderTitle.textContent = folder;

        let allFolders = [];
        let parentFolder = null;

        backBtn.addEventListener('click', () => {
            if (parentFolder) {
                location.href = `/folder?name=${encodeURIComponent(parentFolder)}`;
            } else {
                location.href = '/';
            }
        });

        // Build breadcrumb path from root to current folder
        function buildBreadcrumb() {
            breadcrumb.innerHTML = '';

            // Find the path from root to current folder
            const path = [];
            let current = folder;
            const visited = new Set();
            while (current && !visited.has(current)) {
                visited.add(current);
                const folderData = allFolders.find(f => (f.name || f) === current);
                path.unshift({
                    name: current,
                    parent: folderData ? folderData.parent : null
                });
                current = folderData ? folderData.parent : null;
            }

            // Set parent folder for back navigation
            parentFolder = path.length > 1 ? path[path.length - 2].name : null;

            // Always show breadcrumb with full path
            breadcrumb.style.display = 'flex';

            // Add home link
            const homeLink = document.createElement('a');
            homeLink.href = '/';
            homeLink.className = 'breadcrumb-item';
            homeLink.innerHTML = '<span class="material-symbols-outlined" style="font-size:20px;vertical-align:middle;">home</span>';
            homeLink.title = 'Home';
            breadcrumb.appendChild(homeLink);

            // Add each folder in path
            path.forEach((f, i) => {
                const sep = document.createElement('span');
                sep.className = 'breadcrumb-sep';
                sep.textContent = '›';
                breadcrumb.appendChild(sep);

                const link = document.createElement('a');
                link.className = 'breadcrumb-item' + (i === path.length - 1 ? ' is-current' : '');
                link.textContent = f.name;
                if (i < path.length - 1) {
                    link.href = `/folder?name=${encodeURIComponent(f.name)}`;
                }
                breadcrumb.appendChild(link);
            });

            // Update page title to show full path
            const fullPath = path.map(p => p.name).join(' › ');
            const last = path[path.length - 1];
            folderTitle.textContent = (last && last.name) ? last.name : folder;
        }

        // Drag and drop state for folders
        let draggingSubFolder = null;
        let folderDropTimer = null;
        let folderDropTarget = null;
        let draggingDeckName = null;

        // Sub-folder drag reorder state
        let dragFolderTileEl = null;
        let dragFolderTileHeight = 0;

        function ensureFolderPlaceholder(container) {
            if (!container) return null;
            let ph = container.querySelector('.folder-drop-placeholder');
            if (!ph) {
                ph = document.createElement('div');
                ph.className = 'folder-drop-placeholder';
                ph.style.height = '60px';
                ph.style.margin = '5px 0';
                ph.style.border = '2px dashed var(--accent)';
                ph.style.borderRadius = '14px';
                ph.style.background = 'rgba(59, 130, 246, 0.1)';
            }
            let __h = dragFolderTileHeight || 60;
            if (!__h) {
                const __src = container.querySelector('.folder-tile');
                if (__src) {
                    const __r = __src.getBoundingClientRect();
                    __h = Math.max(40, Math.round(__r.height));
                }
            }
            ph.style.height = __h + 'px';
            if (!ph.parentElement) container.appendChild(ph);
            return ph;
        }

        function removeFolderPlaceholder(container) {
            const ph = container ? container.querySelector('.folder-drop-placeholder') : null;
            if (ph && ph.parentElement) ph.parentElement.removeChild(ph);
        }

        function placeFolderPlaceholder(container, index) {
            if (!container) return;
            const tiles = Array.from(container.querySelectorAll('.folder-tile'));
            const ph = ensureFolderPlaceholder(container);
            if (!tiles.length) return;
            const clamped = Math.max(0, Math.min(index, tiles.length));
            if (clamped >= tiles.length) container.appendChild(ph);
            else container.insertBefore(ph, tiles[clamped]);
        }

        function folderIndexFromY(container, y) {
            const tiles = Array.from(container.querySelectorAll('.folder-tile'));
            for (let i = 0; i < tiles.length; i++) {
                const r = tiles[i].getBoundingClientRect();
                const mid = r.top + r.height / 2;
                if (y < mid) return i;
            }
            return tiles.length;
        }

        function attachFolderDnD(tile, folderName, container) {
            tile.setAttribute('draggable', 'true');

            tile.addEventListener('dragstart', (e) => {
                draggingSubFolder = folderName;
                e.dataTransfer.effectAllowed = 'move';
                dragFolderTileEl = tile;
                dragFolderTileHeight = Math.round(tile.getBoundingClientRect().height);
                setTimeout(() => tile.classList.add('is-dragging-hidden'), 0);
                const tiles = Array.from(container.querySelectorAll('.folder-tile'));
                const idx = tiles.indexOf(tile);
                placeFolderPlaceholder(container, idx < 0 ? 0 : idx);
            });

            tile.addEventListener('dragover', (e) => {
                e.preventDefault();
                // Only reorder if dragging a folder (not a deck)
                if (!draggingSubFolder) return;
                // Don't show reorder placeholder if hovering over a different folder (that's for nesting)
                if (draggingSubFolder !== folderName) return;
                const tiles = Array.from(container.querySelectorAll('.folder-tile'));
                const idx = tiles.indexOf(tile);
                placeFolderPlaceholder(container, idx < 0 ? 0 : idx);
            });

            tile.addEventListener('drop', async (e) => {
                e.preventDefault();
                clearFolderDropState();

                const ph = container.querySelector('.folder-drop-placeholder');
                if (ph && dragFolderTileEl) {
                    container.insertBefore(dragFolderTileEl, ph);
                }
                removeFolderPlaceholder(container);
                if (dragFolderTileEl) dragFolderTileEl.classList.remove('is-dragging-hidden');

                // Save new order
                const newOrder = Array.from(container.querySelectorAll('.folder-name')).map(el => el.textContent);
                await writeOrder('folder', newOrder, null);

                dragFolderTileEl = null;
                dragFolderTileHeight = 0;
                draggingSubFolder = null;
            });

            tile.addEventListener('dragend', () => {
                tile.classList.remove('is-dragging-hidden');
                removeFolderPlaceholder(container);
                dragFolderTileEl = null;
                dragFolderTileHeight = 0;
                draggingSubFolder = null;
                clearFolderDropState();
            });

            // Touch drag for mobile
            if (isCoarsePointer) {
                let dragging = false;
                let pressTimer = null;
                let fingerY = 0;
                let startY = 0;
                const LONG_PRESS_MS = 400;
                const MOVE_CANCEL_PX = 10;

                function startPress(y) {
                    startY = y;
                    pressTimer = setTimeout(() => {
                        dragging = true;
                        dragFolderTileEl = tile;
                        dragFolderTileHeight = Math.round(tile.getBoundingClientRect().height);
                        tile.classList.add('is-dragging-hidden');
                        tile.style.touchAction = 'none';
                        document.body.style.overflow = 'hidden';
                        const tiles = Array.from(container.querySelectorAll('.folder-tile'));
                        const idx = tiles.indexOf(tile);
                        placeFolderPlaceholder(container, idx < 0 ? 0 : idx);
                    }, LONG_PRESS_MS);
                }

                function clearPress() {
                    if (pressTimer) {
                        clearTimeout(pressTimer);
                        pressTimer = null;
                    }
                }

                async function commitDrag() {
                    if (!dragging) return;
                    dragging = false;
                    document.body.style.overflow = '';
                    const ph = container.querySelector('.folder-drop-placeholder');
                    if (ph && dragFolderTileEl) {
                        container.insertBefore(dragFolderTileEl, ph);
                    }
                    removeFolderPlaceholder(container);
                    tile.classList.remove('is-dragging-hidden');
                    tile.style.touchAction = 'auto';
                    const newOrder = Array.from(container.querySelectorAll('.folder-name')).map(el => el.textContent);
                    await writeOrder('folder', newOrder, null);
                    dragFolderTileEl = null;
                    dragFolderTileHeight = 0;
                }

                tile.style.touchAction = 'auto';
                tile.style.userSelect = 'none';

                tile.addEventListener('touchstart', (e) => {
                    const t = e.touches && e.touches[0];
                    if (!t) return;
                    startPress(t.clientY);
                }, {
                    passive: true
                });

                tile.addEventListener('touchmove', (e) => {
                    const t = e.touches && e.touches[0];
                    if (!t) return;
                    fingerY = t.clientY;
                    if (!dragging) {
                        if (Math.abs(t.clientY - startY) > MOVE_CANCEL_PX) {
                            clearPress();
                        }
                        return;
                    }
                    e.preventDefault();
                    const idx = folderIndexFromY(container, fingerY);
                    placeFolderPlaceholder(container, idx);
                }, {
                    passive: false
                });

                tile.addEventListener('touchend', () => {
                    clearPress();
                    commitDrag();
                });

                tile.addEventListener('touchcancel', () => {
                    clearPress();
                    dragging = false;
                    document.body.style.overflow = '';
                    tile.classList.remove('is-dragging-hidden');
                    tile.style.touchAction = 'auto';
                    removeFolderPlaceholder(container);
                    dragFolderTileEl = null;
                    dragFolderTileHeight = 0;
                });
            }
        }

        // Render sub-folders
        function renderSubFolders() {
            subFolderGrid.innerHTML = '';
            let subFolders = allFolders.filter(f => f.parent === folder);

            if (subFolders.length === 0) {
                subFoldersSection.style.display = 'none';
                return;
            }

            // Apply saved order
            subFolders = applyOrder(subFolders, 'folder', null);

            subFoldersSection.style.display = 'block';
            subFolders.forEach((f, i) => {
                const tile = document.createElement('div');
                tile.className = 'folder-tile tile-enter';
                tile.style.animationDelay = `${i * 40}ms`;
                tile.style.position = 'relative';

                const icon = document.createElement('span');
                icon.className = 'material-symbols-outlined folder-icon';
                icon.textContent = 'folder';

                const name = document.createElement('span');
                name.className = 'folder-name';
                name.textContent = f.name;

                tile.appendChild(icon);
                tile.appendChild(name);

                // Add kebab menu for sub-folder actions
                const kebab = document.createElement('button');
                kebab.className = 'kebab-btn';
                kebab.type = 'button';
                kebab.textContent = '⋮';

                const menu = document.createElement('div');
                menu.className = 'kebab-menu';

                // Move to parent (one level up)
                const mMoveUp = document.createElement('button');
                mMoveUp.className = 'kebab-item';
                mMoveUp.type = 'button';
                mMoveUp.textContent = parentFolder ? `Move to ${parentFolder}` : 'Move to Root';
                mMoveUp.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    menu.classList.remove('is-open');
                    // Move to grandparent (parent's parent) or root
                    const currentFolderData = allFolders.find(x => x.name === folder);
                    const newParent = currentFolderData ? currentFolderData.parent : null;
                    await moveFolderInto(f.name, newParent);
                });

                // Move to root
                const mMoveRoot = document.createElement('button');
                mMoveRoot.className = 'kebab-item';
                mMoveRoot.type = 'button';
                mMoveRoot.textContent = 'Move to Root';
                mMoveRoot.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    menu.classList.remove('is-open');
                    await moveFolderInto(f.name, null);
                });

                menu.appendChild(mMoveUp);
                if (parentFolder) { // Only show "Move to Root" if not already one level from root
                    menu.appendChild(mMoveRoot);
                }

                kebab.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const wasOpen = menu.classList.contains('is-open');

                    // Close all menus
                    document.querySelectorAll('.kebab-menu.is-open').forEach(m => {
                        m.classList.remove('is-open');
                        const p = m.closest('.folder-tile');
                        if (p) p.classList.remove('menu-open');
                    });

                    if (!wasOpen) {
                        menu.classList.add('is-open');
                        tile.classList.add('menu-open');
                    }
                });

                tile.appendChild(kebab);
                tile.appendChild(menu);

                tile.addEventListener('click', (e) => {
                    if (tile.classList.contains('folder-drop-target')) return;
                    if (e.target === kebab || menu.contains(e.target)) return;
                    location.href = `/folder?name=${encodeURIComponent(f.name)}`;
                });

                // Attach drag-and-drop for reordering
                attachFolderDnD(tile, f.name, subFolderGrid);

                // Allow dropping folders/decks INTO this folder (nesting) - only on hover+hold
                tile.addEventListener('dragenter', (e) => {
                    e.preventDefault();
                    const isDraggingOtherFolder = draggingSubFolder && draggingSubFolder !== f.name;
                    const isDraggingDeck = draggingDeckName;
                    if (!isDraggingOtherFolder && !isDraggingDeck) return;

                    clearFolderDropState();
                    tile.classList.add('folder-drop-target');
                    folderDropTarget = f.name;

                    folderDropTimer = setTimeout(async () => {
                        if (folderDropTarget === f.name) {
                            if (draggingSubFolder && draggingSubFolder !== f.name) {
                                // Move folder inside
                                await moveFolderInto(draggingSubFolder, f.name);
                            } else if (draggingDeckName) {
                                // Move deck inside
                                await moveDeckInto(draggingDeckName, f.name);
                            }
                        }
                    }, 800);
                });
                tile.addEventListener('dragleave', () => {
                    if (folderDropTarget === f.name) {
                        clearFolderDropState();
                    }
                });

                subFolderGrid.appendChild(tile);
            });
        }

        function clearFolderDropState() {
            if (folderDropTimer) clearTimeout(folderDropTimer);
            folderDropTimer = null;
            folderDropTarget = null;
            document.querySelectorAll('.folder-drop-target').forEach(el => el.classList.remove('folder-drop-target'));
        }

        async function moveFolderInto(folderName, targetParent) {
            try {
                const resp = await fetch('/folder/move', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: folderName,
                        parent: targetParent
                    })
                });
                if (resp.ok) {
                    draggingSubFolder = null;
                    await loadDecks();
                }
            } catch { }
        }

        async function moveDeckInto(deckName, targetFolder) {
            try {
                const resp = await fetch('/deck/move', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: deckName,
                        folder: targetFolder
                    })
                });
                if (resp.ok) {
                    draggingDeckName = null;
                    await loadDecks();
                }
            } catch { }
        }

        // Cross-page cache keys
        const CACHE_FOLDERS = 'flashcard_folders_cache';
        const CACHE_DECKS = 'flashcard_decks_cache';

        function saveCache(key, data) {
            return;
        }

        function getCache(key) {
            return null;
        }

        async function loadDecks() {
            // Try to load from cache first for instant display
            const cachedFolders = getCache(CACHE_FOLDERS);
            const cachedDecks = getCache(CACHE_DECKS);

            if (cachedFolders && cachedDecks) {
                // Show cached data immediately - NO background refresh, NO flicker
                allFolders = Array.isArray(cachedFolders.data || cachedFolders) ? (cachedFolders.data || cachedFolders) : [];
                const allDecks = Array.isArray(cachedDecks.data || cachedDecks) ? (cachedDecks.data || cachedDecks) : [];

                // Fetch deck order for this folder (always needed for correct sorting)
                try {
                    const deckOrderResp = await fetch(`/order/decks?scope=${encodeURIComponent(folder)}`);
                    const deckOrderData = await deckOrderResp.json().catch(() => []);
                    ordersCache.decks[folder] = Array.isArray(deckOrderData) ? deckOrderData : [];
                } catch {
                    ordersCache.decks[folder] = [];
                }

                // Build UI with cached data
                buildBreadcrumb();
                renderSubFolders();
                const list = allDecks.filter(d => ((d.folder || 'Uncategorized') === folder));
                const ordered = applyOrder(list, 'deck', folder);
                renderList(ordered);
                return; // Done - use cache for entire session
            }

            // No cache - show loader and fetch fresh data
            showLoader();
            try {
                const [foldersData, decksData, deckOrderData, folderOrderData] = await Promise.all([
                    fetch('/folders').then(r => r.json()).catch(() => ({
                        folders: []
                    })),
                    fetch('/decks').then(r => r.json()).catch(() => []),
                    fetch(`/order/decks?scope=${encodeURIComponent(folder)}`).then(r => r.json()).catch(() => []),
                    fetch('/order/folders').then(r => r.json()).catch(() => [])
                ]);

                // Save to cache so the home page can reuse this data
                allFolders = Array.isArray(foldersData.folders) ? foldersData.folders : [];
                saveCache(CACHE_FOLDERS, {
                    data: allFolders,
                    timestamp: Date.now()
                });
                const all = Array.isArray(decksData) ? decksData : [];
                saveCache(CACHE_DECKS, {
                    data: all,
                    timestamp: Date.now()
                });

                // Store folder order
                ordersCache.folders = Array.isArray(folderOrderData) ? folderOrderData : [];

                // Build breadcrumb, sub‑folders and ordered deck list
                buildBreadcrumb();
                renderSubFolders();

                const list = all.filter(d => ((d.folder || 'Uncategorized') === folder));
                ordersCache.decks[folder] = Array.isArray(deckOrderData) ? deckOrderData : [];
                const ordered = applyOrder(list, 'deck', folder);
                renderList(ordered);
            } catch (err) {
                console.error('loadDecks error:', err);
                renderList([]);
            } finally {
                hideLoader();
            }
        }

        async function refreshDecksInBackground() {
            try {
                const [foldersData, decksData, deckOrderData, folderOrderData] = await Promise.all([
                    fetch('/folders').then(r => r.json()).catch(() => null),
                    fetch('/decks').then(r => r.json()).catch(() => null),
                    fetch(`/order/decks?scope=${encodeURIComponent(folder)}`).then(r => r.json()).catch(() => null),
                    fetch('/order/folders').then(r => r.json()).catch(() => null)
                ]);

                let needsRerender = false;

                // Helper to compare folder lists by name and parent only (ignore count changes)
                function compareFolders(a, b) {
                    if (!a || !b || a.length !== b.length) return false;
                    const aMap = new Map(a.map(f => [f.name, f.parent || null]));
                    return b.every(f => aMap.get(f.name) === (f.parent || null));
                }

                if (foldersData && foldersData.folders) {
                    const newFolders = Array.isArray(foldersData.folders) ? foldersData.folders : [];
                    if (!compareFolders(newFolders, allFolders)) {
                        allFolders = newFolders;
                        saveCache(CACHE_FOLDERS, {
                            data: allFolders,
                            timestamp: Date.now()
                        });
                        needsRerender = true;
                    } else {
                        // Just update silently
                        allFolders = newFolders;
                        saveCache(CACHE_FOLDERS, {
                            data: allFolders,
                            timestamp: Date.now()
                        });
                    }
                }

                if (folderOrderData) {
                    const newOrder = Array.isArray(folderOrderData) ? folderOrderData : [];
                    if (JSON.stringify(newOrder) !== JSON.stringify(ordersCache.folders)) {
                        ordersCache.folders = newOrder;
                        needsRerender = true;
                    }
                }

                let decksChanged = false;

                if (decksData) {
                    const newDecks = Array.isArray(decksData) ? decksData : [];
                    const list = newDecks.filter(d => ((d.folder || 'Uncategorized') === folder));

                    // Check if decks actually changed (compare sorted names only)
                    const cachedDecksEntry = getCache(CACHE_DECKS) || {};
                    const currentAll = cachedDecksEntry.data || [];
                    const currentList = currentAll.filter(d => ((d.folder || 'Uncategorized') === folder));

                    const oldNames = currentList.map(d => d.name).sort().join(',');
                    const newNames = list.map(d => d.name).sort().join(',');

                    if (oldNames !== newNames) {
                        decksChanged = true;
                    }

                    // Check if order changed
                    if (deckOrderData) {
                        const newDeckOrder = Array.isArray(deckOrderData) ? deckOrderData : [];
                        if (JSON.stringify(newDeckOrder) !== JSON.stringify(ordersCache.decks[folder] || [])) {
                            ordersCache.decks[folder] = newDeckOrder;
                            decksChanged = true;
                        }
                    } else if (!decksChanged) {
                        // If no explicit order update, check if default order (alphabetical) changed due to new/removed items
                        // But wait, if names changed (added/removed), decksChanged is already true.
                        // Order matters if names are SAME but sequence different.
                        // If deckOrderData is missing, we use default sort.
                        // If the list of names changed, we already flagged it.
                        // If the list of names is SAME but default sort order changed? Unlikely unless casing changed.
                    }

                    saveCache(CACHE_DECKS, {
                        data: newDecks,
                        timestamp: Date.now()
                    });

                    // Only re-render if decks actually changed
                    if (decksChanged) {
                        const ordered = applyOrder(list, 'deck', folder);
                        renderList(ordered);
                    }
                }

                if (needsRerender) {
                    buildBreadcrumb();
                    renderSubFolders();
                }
            } catch { }
        }

        function renderList(items) {
            deckList.innerHTML = '';
            if (!items.length) {
                decksHeader.style.display = 'none';
                return;
            }
            decksHeader.style.display = 'flex';
            items.forEach((d, i) => {
                const wrap = document.createElement('div');
                wrap.className = 'deck-tile tile-enter';
                wrap.style.animationDelay = `${i * 40}ms`;
                const title = document.createElement('div');
                title.className = 'deck-title';
                title.textContent = d.name;
                wrap.appendChild(title);
                wrap.addEventListener('click', () => {
                    selectedDeckForAction = d.name;
                    const ttl = document.getElementById('chooseActionTitle');
                    if (ttl) ttl.textContent = d.name;
                    chooseActionModal.classList.add('is-open');
                    chooseActionModal.setAttribute('aria-hidden', 'false');
                });
                attachDeckDnD(wrap, d.name, folder);
                deckList.appendChild(wrap);
            });
        }

        loadDecks();

        // Close kebab menus when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.kebab-btn') && !e.target.closest('.kebab-menu')) {
                document.querySelectorAll('.kebab-menu.is-open').forEach(m => {
                    m.classList.remove('is-open');
                    const p = m.closest('.folder-tile');
                    if (p) p.classList.remove('menu-open');
                });
            }
        });

        function buildMoveDeckBrowserTreeForFolder(raw) {
            moveDeckParentByName = {};
            moveDeckChildrenByParent = {};
            const seen = new Set();
            raw.forEach((f) => {
                const nm = (f && f.name) ? f.name : String(f);
                if (nm === 'Uncategorized') return;
                if (seen.has(nm)) return;
                seen.add(nm);
                const parent = f && f.parent ? f.parent : '';
                moveDeckParentByName[nm] = parent || '';
                const key = parent || MOVE_BROWSER_ROOT;
                if (!moveDeckChildrenByParent[key]) moveDeckChildrenByParent[key] = [];
                moveDeckChildrenByParent[key].push(nm);
            });
            if (!moveDeckChildrenByParent[MOVE_BROWSER_ROOT]) moveDeckChildrenByParent[MOVE_BROWSER_ROOT] = [];
            if (!moveDeckChildrenByParent[MOVE_BROWSER_ROOT].includes('Uncategorized')) {
                moveDeckChildrenByParent[MOVE_BROWSER_ROOT].push('Uncategorized');
                moveDeckParentByName['Uncategorized'] = '';
            }
        }

        function getMoveDeckPathForFolder() {
            const path = [];
            let current = moveDeckBrowserCursor;
            const visited = new Set();
            while (current && current !== MOVE_BROWSER_ROOT && !visited.has(current)) {
                visited.add(current);
                path.unshift(current);
                const parent = moveDeckParentByName[current] || '';
                if (!parent) break;
                current = parent;
            }
            return path;
        }

        function renderMoveDeckBrowserForFolder() {
            if (!moveDeckList) return;
            moveDeckList.innerHTML = '';
            const path = getMoveDeckPathForFolder();
            const headerRow = document.createElement('div');
            headerRow.className = 'multi-deck-item';
            const headerSpan = document.createElement('span');
            headerSpan.style.fontWeight = '600';
            headerSpan.textContent = path.length ? `Location: Root / ${path.join(' / ')}` : 'Location: Root';
            headerRow.appendChild(headerSpan);
            moveDeckList.appendChild(headerRow);
            if (moveDeckBrowserCursor !== MOVE_BROWSER_ROOT) {
                const upBtn = document.createElement('button');
                upBtn.type = 'button';
                upBtn.className = 'multi-deck-item';
                upBtn.textContent = 'Up one level';
                upBtn.addEventListener('click', () => {
                    const current = moveDeckBrowserCursor;
                    const parent = moveDeckParentByName[current] || '';
                    moveDeckBrowserCursor = parent ? parent : MOVE_BROWSER_ROOT;
                    renderMoveDeckBrowserForFolder();
                });
                moveDeckList.appendChild(upBtn);
            }
            const key = moveDeckBrowserCursor === MOVE_BROWSER_ROOT ? MOVE_BROWSER_ROOT : moveDeckBrowserCursor;
            const children = (moveDeckChildrenByParent[key] || []).slice().sort((a, b) => a.localeCompare(b));
            children.forEach((name) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'multi-deck-item';
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.justifyContent = 'space-between';
                const nameSpan = document.createElement('span');
                nameSpan.textContent = name;
                row.appendChild(nameSpan);
                if (name !== 'Uncategorized') {
                    const icon = document.createElement('span');
                    icon.className = 'material-symbols-outlined';
                    icon.textContent = 'chevron_right';
                    row.appendChild(icon);
                }
                btn.appendChild(row);
                btn.addEventListener('click', () => {
                    moveDeckBrowserCursor = name;
                    renderMoveDeckBrowserForFolder();
                });
                moveDeckList.appendChild(btn);
            });
            if (moveDeckSaveBtn) moveDeckSaveBtn.disabled = moveDeckBrowserCursor === MOVE_BROWSER_ROOT;
        }

        async function loadFoldersIntoMoveList() {
            moveDeckList.innerHTML = '';
            let raw = [];
            if (Array.isArray(allFolders) && allFolders.length) {
                raw = allFolders.slice();
            } else {
                try {
                    const resp = await fetch('/folders');
                    const data = await resp.json().catch(() => ({
                        folders: []
                    }));
                    raw = Array.isArray(data.folders) ? data.folders : [];
                    allFolders = raw.slice();
                } catch {
                    raw = [];
                }
            }
            buildMoveDeckBrowserTreeForFolder(raw);
            moveDeckBrowserCursor = MOVE_BROWSER_ROOT;
            renderMoveDeckBrowserForFolder();
        }

        function openMoveDeckModal() {
            moveDeckStatus.textContent = '';
            loadFoldersIntoMoveList();
            if (deckSettingsModal) {
                deckSettingsModal.classList.remove('is-open');
                deckSettingsModal.setAttribute('aria-hidden', 'true');
            }
            moveDeckModal.classList.add('is-open');
            moveDeckModal.setAttribute('aria-hidden', 'false');
        }
        if (openLearnBtn) openLearnBtn.addEventListener('click', () => {
            if (!selectedDeckForAction) return;
            const fromParam = `&from=${encodeURIComponent(folder)}`;
            window.location.href = `/learn?deck=${encodeURIComponent(selectedDeckForAction)}${fromParam}`;
        });
        if (openFlashBtn) openFlashBtn.addEventListener('click', () => {
            if (!selectedDeckForAction) return;
            window.location.href = `/?mode=flash&deck=${encodeURIComponent(selectedDeckForAction)}`;
        });
        if (openSpellingBtn) openSpellingBtn.addEventListener('click', () => {
            if (!selectedDeckForAction) return;
            const fromParam = `&from=${encodeURIComponent(folder)}`;
            window.location.href = `/spelling?deck=${encodeURIComponent(selectedDeckForAction)}${fromParam}`;
        });
        if (openLineBtn) openLineBtn.addEventListener('click', () => {
            if (!selectedDeckForAction) return;
            const fromParam = `&from=${encodeURIComponent(folder)}`;
            window.location.href = `/line?deck=${encodeURIComponent(selectedDeckForAction)}${fromParam}`;
        });
        if (openMatchBtn) openMatchBtn.addEventListener('click', () => {
            if (!selectedDeckForAction) return;
            const fromParam = `&from=${encodeURIComponent(folder)}`;
            window.location.href = `/match?deck=${encodeURIComponent(selectedDeckForAction)}${fromParam}`;
        });

        function closeMoveDeckModal() {
            moveDeckModal.classList.remove('is-open');
            moveDeckModal.setAttribute('aria-hidden', 'true');
        }
        if (moveDeckCancelBtn) moveDeckCancelBtn.addEventListener('click', closeMoveDeckModal);
        if (moveDeckModal) moveDeckModal.addEventListener('click', (e) => {
            if (e.target && (e.target.dataset.close === 'true')) closeMoveDeckModal();
        });
        if (moveDeckSaveBtn) moveDeckSaveBtn.addEventListener('click', async () => {
            if (!selectedDeckForAction) return;
            if (!moveDeckBrowserCursor || moveDeckBrowserCursor === MOVE_BROWSER_ROOT) {
                moveDeckStatus.textContent = 'Choose a folder first';
                return;
            }
            const targetFolder = moveDeckBrowserCursor;
            moveDeckSaveBtn.disabled = true;
            moveDeckSaveBtn.textContent = 'Moving...';
            try {
                const resp = await fetch('/deck/move', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: selectedDeckForAction,
                        folder: targetFolder === 'Uncategorized' ? null : targetFolder
                    })
                });
                const out = await resp.json().catch(() => ({
                    ok: false
                }));
                if (!resp.ok || !out.ok) throw new Error(out.detail || 'Failed to move');
                moveDeckStatus.textContent = 'Moved';
                await loadDecks();
                closeMoveDeckModal();
                chooseActionModal.classList.remove('is-open');
                chooseActionModal.setAttribute('aria-hidden', 'true');
            } catch (err) {
                moveDeckStatus.textContent = String(err.message || err);
            } finally {
                moveDeckSaveBtn.disabled = false;
                moveDeckSaveBtn.textContent = 'Move';
            }
        });

        function openDeckSettingsModal() {
            if (!selectedDeckForAction) return;
            if (chooseActionModal) {
                chooseActionModal.classList.remove('is-open');
                chooseActionModal.setAttribute('aria-hidden', 'true');
            }
            if (deckSettingsModal) {
                const titleEl = document.getElementById('deckSettingsTitle');
                if (titleEl) titleEl.textContent = selectedDeckForAction;
                deckSettingsModal.classList.add('is-open');
                deckSettingsModal.setAttribute('aria-hidden', 'false');
            }
        }

        function closeDeckSettingsModal() {
            if (!deckSettingsModal) return;
            deckSettingsModal.classList.remove('is-open');
            deckSettingsModal.setAttribute('aria-hidden', 'true');
        }

        if (openSettingsBtn) openSettingsBtn.addEventListener('click', openDeckSettingsModal);
        if (deckSettingsModal) deckSettingsModal.addEventListener('click', (e) => {
            if (e.target && e.target.dataset && e.target.dataset.closeSettings === 'true') {
                closeDeckSettingsModal();
            }
        });
        if (deckSettingsMoveBtn) deckSettingsMoveBtn.addEventListener('click', () => {
            openMoveDeckModal();
        });
        if (deckSettingsDeleteBtn) deckSettingsDeleteBtn.addEventListener('click', async () => {
            if (!selectedDeckForAction) return;
            const ok = confirm(`Delete deck "${selectedDeckForAction}"? This cannot be undone.`);
            if (!ok) return;
            try {
                const resp = await fetch('/deck/delete', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: selectedDeckForAction
                    })
                });
                const out = await resp.json().catch(() => ({
                    ok: false
                }));
                if (!resp.ok || !out.ok) throw new Error(out.detail || 'Failed to delete deck');
                closeDeckSettingsModal();
                await loadDecks();
            } catch (e) {
                alert(String(e && e.message ? e.message : e || 'Failed to delete deck'));
            }
        });
        if (chooseActionModal) chooseActionModal.addEventListener('click', (e) => {
            if (e.target && (e.target.dataset.close === 'true')) {
                chooseActionModal.classList.remove('is-open');
                chooseActionModal.setAttribute('aria-hidden', 'true');
            }
        });
        const chooseActionCloseBtn = document.getElementById('chooseActionCloseBtn');
        if (chooseActionCloseBtn) chooseActionCloseBtn.addEventListener('click', () => {
            chooseActionModal.classList.remove('is-open');
            chooseActionModal.setAttribute('aria-hidden', 'true');
        });