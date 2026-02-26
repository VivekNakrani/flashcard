const backBtn = document.getElementById('backBtn');
    const deckTitle = document.getElementById('deckTitle');
    const cardList = document.getElementById('cardList');
    const globalLoader = document.getElementById('globalLoader');
    const editModal = document.getElementById('editModal');
    const editEn = document.getElementById('editEn');
    const editDe = document.getElementById('editDe');
    const editCancel = document.getElementById('editCancel');
    const editSave = document.getElementById('editSave');
    const manageCard = document.getElementById('manageCard');
    const manageToggle = document.getElementById('manageToggle');
    const params = new URLSearchParams(location.search);
    const deckSelectEdit = document.getElementById('deckSelectEdit');
    const deckLabelEdit = document.getElementById('deckLabelEdit');
    const renameInput = document.getElementById('renameInput');
    const renameBtn = document.getElementById('renameBtn');
    const deleteDeckBtn = document.getElementById('deleteDeckBtn');
    const navAddBtn = document.getElementById('navAddBtn');
    const audioPlayer = new Audio();
    const audioCache = new Map();
    const MAX_CACHE_SIZE = 50;
    let deck = params.get('deck') || '';
    if (deck) deckTitle.textContent = deck;
    if (renameInput) renameInput.value = deck || '';
    let cards = [];
    let editingIndex = -1;
    let didInitialAnimation = false;
    if (navAddBtn) navAddBtn.addEventListener('click', () => {
        editingIndex = -1;
        editEn.value = '';
        editDe.value = '';
        editModal.classList.remove('hidden');
    });
    if (deckLabelEdit && manageCard) {
        deckLabelEdit.addEventListener('click', () => {
            manageCard.classList.remove('collapsed');
            manageCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    }
    function showLoader() {
        if (globalLoader) globalLoader.classList.add('is-active');
    }

    function hideLoader() {
        if (globalLoader) globalLoader.classList.remove('is-active');
    }
    backBtn.addEventListener('click', () => {
        location.href = '/';
    });
    if (manageToggle && manageCard) {
        manageToggle.addEventListener('click', () => {
            manageCard.classList.toggle('collapsed');
        });
    }
    async function loadCards() {
        showLoader();
        try {
            const r = await fetch(`/cards?deck=${encodeURIComponent(deck)}`);
            const data = r.ok ? await r.json() : [];
            cards = Array.isArray(data) ? data : [];
            renderList();
            hydrateAudioFromLocalStorage();
            if (deck) preloadDeckAudio();
            hideLoader();
        } catch {
            cards = [];
            renderList();
            hideLoader();
        }
    }

    function renderList() {
        cardList.innerHTML = '';
        if (!cards.length) {
            const none = document.createElement('div');
            none.className = 'text-center text-neutral-gray';
            none.textContent = 'No cards';
            cardList.appendChild(none);
        }
        cards.forEach((c, i) => {
            const row = document.createElement('div');
            row.className = 'flex items-center gap-4 rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800/50' + (didInitialAnimation ? '' : ' row-enter');
            if (!didInitialAnimation) row.style.animationDelay = `${i * 40}ms`;
            const left = document.createElement('div');
            left.className = 'flex flex-1 flex-col justify-center';
            const de = document.createElement('p');
            de.className = 'text-base font-medium text-near-black dark:text-white';
            de.textContent = c.de;
            const en = document.createElement('p');
            en.className = 'text-sm text-neutral-gray dark:text-gray-400';
            en.textContent = c.en;
            left.appendChild(de);
            left.appendChild(en);
            const right = document.createElement('div');
            right.className = 'flex shrink-0 items-center gap-2';
            const btnEdit = document.createElement('button');
            btnEdit.className = 'flex size-10 items-center justify-center rounded-full text-neutral-gray transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700';
            btnEdit.innerHTML = '<span class="material-symbols-outlined text-xl">edit</span>';
            btnEdit.addEventListener('click', () => openEdit(i));
            const btnDelete = document.createElement('button');
            btnDelete.className = 'flex size-10 items-center justify-center rounded-full text-destructive-red transition-colors hover:bg-red-50 dark:hover:bg-red-500/10';
            btnDelete.innerHTML = '<span class="material-symbols-outlined text-xl">delete</span>';
            btnDelete.addEventListener('click', () => deleteCard(i));
            row.appendChild(left);
            row.appendChild(right);
            right.appendChild(btnEdit);
            right.appendChild(btnDelete);
            row.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                const t = (c.de || '').trim();
                if (t) speak(t);
            });
            cardList.appendChild(row);
        });
        didInitialAnimation = true;
    }

    function openEdit(i) {
        editingIndex = i;
        const c = cards[i];
        editEn.value = c.en || '';
        editDe.value = c.de || '';
        editModal.classList.remove('hidden');
    }

    function closeEdit() {
        editingIndex = -1;
        editModal.classList.add('hidden');
    }
    editCancel.addEventListener('click', closeEdit);
    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) closeEdit();
    });
    editSave.addEventListener('click', async () => {
        const en = (editEn.value || '').trim();
        const de = (editDe.value || '').trim();
        if (!en || !de) return;
        if (editingIndex === -1) cards.unshift({ en, de });
        else cards[editingIndex] = { en, de };
        closeEdit();
        renderList();
        const p1 = saveDeckSilent();
        const p2 = preloadAudioForWord(de);
        Promise.allSettled([p1, p2]).then(() => {
            renderList();
        });
    });
    async function saveDeck() {
        showLoader();
        try {
            const content = cards.map(r => `${r.en},${r.de}`).join('\n');
            const resp = await fetch('/deck/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: deck,
                    content
                })
            });
            await resp.json();
            await loadCards();
        } catch {
            hideLoader();
        } finally {
            hideLoader();
        }
    }
    async function saveDeckSilent() {
        try {
            const content = cards.map(r => `${r.en},${r.de}`).join('\n');
            return fetch('/deck/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: deck, content })
            }).then(r => r.json()).catch(() => ({}));
        } catch {
            return Promise.resolve({});
        }
    }
    async function deleteCard(i) {
        const removed = cards.splice(i, 1)[0];
        renderList();
        saveDeckSilent();
        if (removed && removed.de) removeAudioCacheForWord(removed.de);
    }


    loadCards();

    async function loadDecks() {
        showLoader();
        try {
            const resp = await fetch('/decks');
            const list = await resp.json();
            const items = Array.isArray(list) ? list : [];
            deckSelectEdit.innerHTML = '';
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = 'Select deck';
            placeholder.disabled = false;
            deckSelectEdit.appendChild(placeholder);
            items.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.name;
                opt.textContent = d.name;
                deckSelectEdit.appendChild(opt);
            });
            if (deck) {
                deckSelectEdit.value = deck;
            }
            deckSelectEdit.addEventListener('change', async (e) => {
                deck = e.target.value || '';
                deckTitle.textContent = deck || 'Deck';
                cards = [];
                cardList.innerHTML = '';
                if (renameInput) renameInput.value = deck || '';
                if (deck) {
                    await loadCards();
                }
            });
            hideLoader();
        } catch {
            hideLoader();
        }
    }

    function sanitizeName(n) {
        return (n || '').trim().replace(/[^a-zA-Z0-9_\-]+/g, '_').substring(0, 50)
    }
    if (renameBtn) renameBtn.addEventListener('click', async () => {
        const newRaw = (renameInput && renameInput.value || '').trim();
        const newName = sanitizeName(newRaw);
        if (!deck) {
            alert('Please select a deck.');
            return
        }
        if (!newName) {
            alert('Please enter a new name.');
            return
        }
        if (newName === deck) {
            alert('New name must be different.');
            return
        }
        renameBtn.disabled = true;
        renameBtn.textContent = 'Renaming...';
        try {
            const resp = await fetch('/deck/rename', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    old_name: deck,
                    new_name: newName
                })
            });
            const out = await resp.json().catch(() => ({
                ok: false
            }));
            if (!resp.ok || !out.ok) throw new Error(out.detail || 'Failed to rename deck');
            deck = newName;
            deckTitle.textContent = deck;
            await loadDecks();
            deckSelectEdit.value = deck;
            await loadCards();
            renameBtn.textContent = 'Renamed';
            setTimeout(() => {
                renameBtn.disabled = false;
                renameBtn.textContent = 'Rename'
            }, 800)
        } catch (e) {
            alert(String(e.message || e));
            renameBtn.disabled = false;
            renameBtn.textContent = 'Rename'
        }
    });
    if (deleteDeckBtn) deleteDeckBtn.addEventListener('click', async () => {
        if (!deck) {
            alert('Please select a deck.');
            return
        }
        deleteDeckBtn.disabled = true;
        deleteDeckBtn.textContent = 'Deleting...';
        try {
            const resp = await fetch('/deck/delete', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: deck
                })
            });
            const out = await resp.json().catch(() => ({
                ok: false
            }));
            if (!resp.ok || !out.ok) throw new Error(out.detail || 'Failed to delete deck');
            deleteDeckBtn.textContent = 'Deleted';
            setTimeout(() => {
                location.href = '/'
            }, 600)
        } catch (e) {
            alert(String(e.message || e));
            deleteDeckBtn.disabled = false;
            deleteDeckBtn.textContent = 'Delete deck'
        }
    });

    loadDecks();

    async function speak(text) {
        if (!text) return;
        try {
            audioPlayer.pause();
            audioPlayer.currentTime = 0;
            const cacheKey = `audio:de:${text}`;
            const stored = localStorage.getItem(cacheKey);
            if (stored && !audioCache.has(text)) {
                audioCache.set(text, stored);
            }
            if (audioCache.has(text)) {
                audioPlayer.src = audioCache.get(text);
                await audioPlayer.play();
                return;
            }
            const resp = await fetch(`/tts?text=${encodeURIComponent(text)}&lang=de`);
            if (resp.ok) {
                const blob = await resp.blob();
                const url = URL.createObjectURL(blob);
                audioCache.set(text, url);
                audioPlayer.src = url;
                await audioPlayer.play();
            }
        } catch { }
    }

    function cleanupAudioCache() {
        if (audioCache.size > MAX_CACHE_SIZE) {
            const entries = Array.from(audioCache.entries());
            const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE);
            toRemove.forEach(([key, url]) => {
                if (typeof url === 'string' && url.startsWith('blob:')) {
                    try { URL.revokeObjectURL(url); } catch { }
                }
                audioCache.delete(key);
            });
        }
    }

    function hydrateAudioFromLocalStorage() {
        cards.forEach(c => {
            const key = `audio:de:${c.de}`;
            const val = localStorage.getItem(key);
            if (val) audioCache.set(c.de, val);
        });
    }

    async function preloadDeckAudio() {
        if (!deck) return;
        try {
            const resp = await fetch(`/preload_deck_audio?deck=${encodeURIComponent(deck)}`);
            if (!resp.ok) return;
            const data = await resp.json().catch(() => ({}));
            const entries = Object.entries((data && data.audio_urls) || {});
            const tasks = entries.map(([text, url]) => fetchAudioAndCache(text, url));
            await Promise.allSettled(tasks);
        } catch { }
    }

    function preloadAudioForWord(text) {
        if (!text) return Promise.resolve();
        const url = `/tts?text=${encodeURIComponent(text)}&lang=de`;
        return fetchAudioAndCache(text, url);
    }

    async function fetchAudioAndCache(text, url) {
        const cacheKey = `audio:de:${text}`;
        if (audioCache.has(text) || localStorage.getItem(cacheKey)) return;
        try {
            const response = await fetch(url);
            if (!response.ok) return;
            const blob = await response.blob();
            const objUrl = URL.createObjectURL(blob);
            cleanupAudioCache();
            audioCache.set(text, objUrl);
            try {
                const base64 = await blobToBase64(blob);
                localStorage.setItem(cacheKey, base64);
            } catch { }
        } catch { }
    }

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function removeAudioCacheForWord(text) {
        if (!text) return;
        try {
            const val = audioCache.get(text);
            if (val && typeof val === 'string' && val.startsWith('blob:')) {
                try { URL.revokeObjectURL(val); } catch { }
            }
            audioCache.delete(text);
        } catch { }
        try {
            localStorage.removeItem(`audio:de:${text}`);
        } catch { }
    }