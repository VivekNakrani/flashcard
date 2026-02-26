const backBtn = document.getElementById('backBtn');
        const homeBtn = document.getElementById('homeBtn');
        const deckSelect = document.getElementById('deckSelect');
        const englishWord = document.getElementById('englishWord');
        const deTooltip = document.getElementById('deTooltip');
        const playAudioBtn = document.getElementById('playAudioBtn');
        const spellingInput = document.getElementById('spellingInput');
        const checkBtn = document.getElementById('checkBtn');
        const nextBtn = document.getElementById('nextBtn');
        const feedback = document.getElementById('feedback');
        const progressText = document.getElementById('progressText');
        const globalLoader = document.getElementById('globalLoader');
        const completeOverlay = document.getElementById('completeOverlay');
        const continueBtn = document.getElementById('continueBtn');
        const reviewBtn = document.getElementById('reviewBtn');
        const accValue = document.getElementById('accValue');
        const timeValue = document.getElementById('timeValue');
        const practiceCardEl = document.querySelector('.practice-card');

        function showLoader() {
            globalLoader.classList.add('is-active')
        }

        function hideLoader() {
            globalLoader.classList.remove('is-active')
        }
        const params = new URLSearchParams(location.search);
        let currentDeck = params.get('deck') || '';
        let cards = [];
        let index = 0;
        let correctCount = 0;
        const audio = new Audio();
        const audioCache = new Map();
        const audioBlobUrls = new Map();
        let autoNextTimer = null;
        let mistakes = [];
        let sessionStart = performance.now();
        let attempts = 0;
        let doneShown = false;

        function setProgress() {
            progressText.textContent = `${Math.min(index + 1, cards.length)}/${cards.length}`
        }

        function renderCurrent() {
            if (!cards.length) {
                englishWord.textContent = 'Select a deck';
                spellingInput.value = '';
                feedback.textContent = '';
                closeTooltip();
                setProgress();
                clearAutoNext();
                return;
            }
            const c = cards[index];
            englishWord.textContent = c.en;
            spellingInput.value = '';
            feedback.textContent = '';
            closeTooltip();
            setProgress();
            spellingInput.focus();
            clearAutoNext();
        }
        // Cross-page cache
        function getCache(key) {
            try {
                const d = sessionStorage.getItem(key);
                return d ? JSON.parse(d) : null;
            } catch {
                return null;
            }
        }

        function saveCache(key, data) {
            try {
                sessionStorage.setItem(key, JSON.stringify(data));
            } catch { }
        }

        function initCardsFromCache() {
            if (!currentDeck) return false;
            const cached = getCache(`flashcard_cards_${currentDeck}`);
            if (!cached || !Array.isArray(cached) || !cached.length) return false;
            cards = cached;
            index = 0;
            correctCount = 0;
            mistakes = [];
            attempts = 0;
            doneShown = false;
            sessionStart = performance.now();
            completeOverlay.hidden = true;
            if (practiceCardEl) practiceCardEl.hidden = false;
            hydrateAudioFromLocalStorage();
            renderCurrent();
            return true;
        }

        async function loadDecks() {
            // Try instant load from cache
            const cachedDecks = getCache('flashcard_decks_cache');
            let showedFromCache = false;

            if (currentDeck) {
                // Populate deck select from cache instantly
                if (cachedDecks && Array.isArray(cachedDecks)) {
                    deckSelect.innerHTML = '';
                    const ph = document.createElement('option');
                    ph.value = '';
                    ph.textContent = 'Select a deck';
                    deckSelect.appendChild(ph);
                    cachedDecks.forEach(d => {
                        const opt = document.createElement('option');
                        opt.value = d.name;
                        opt.textContent = d.name;
                        deckSelect.appendChild(opt);
                    });
                    deckSelect.value = currentDeck;
                }
                // Try to show cards from cache instantly
                showedFromCache = initCardsFromCache();
            }

            if (!showedFromCache) showLoader();

            try {
                if (currentDeck) {
                    const [decksResp, cardsResp] = await Promise.all([
                        fetch('/decks').then(r => r.json()).catch(() => []),
                        fetch(`/cards?deck=${encodeURIComponent(currentDeck)}`).then(r => r.json()).catch(() => [])
                    ]);

                    // Save to cache
                    saveCache('flashcard_decks_cache', decksResp);
                    saveCache(`flashcard_cards_${currentDeck}`, cardsResp);

                    // Update deck select
                    deckSelect.innerHTML = '';
                    const ph = document.createElement('option');
                    ph.value = '';
                    ph.textContent = 'Select a deck';
                    deckSelect.appendChild(ph);
                    (Array.isArray(decksResp) ? decksResp : []).forEach(d => {
                        const opt = document.createElement('option');
                        opt.value = d.name;
                        opt.textContent = d.name;
                        deckSelect.appendChild(opt);
                    });
                    deckSelect.value = currentDeck;

                    // Only re-render if data changed or wasn't cached
                    if (!showedFromCache) {
                        cards = Array.isArray(cardsResp) ? cardsResp : [];
                        index = 0;
                        correctCount = 0;
                        mistakes = [];
                        attempts = 0;
                        doneShown = false;
                        sessionStart = performance.now();
                        completeOverlay.hidden = true;
                        if (practiceCardEl) practiceCardEl.hidden = false;
                        clearDeckAudio();
                        hydrateAudioFromLocalStorage();
                        renderCurrent();
                    }
                    preloadDeckAudio(currentDeck);
                } else {
                    const resp = await fetch('/decks');
                    const list = await resp.json();
                    saveCache('flashcard_decks_cache', list);
                    deckSelect.innerHTML = '';
                    const ph = document.createElement('option');
                    ph.value = '';
                    ph.textContent = 'Select a deck';
                    deckSelect.appendChild(ph);
                    list.forEach(d => {
                        const opt = document.createElement('option');
                        opt.value = d.name;
                        opt.textContent = d.name;
                        deckSelect.appendChild(opt);
                    });
                    deckSelect.value = '';
                }
            } catch (e) {
                if (!showedFromCache) {
                    deckSelect.innerHTML = '';
                    const ph = document.createElement('option');
                    ph.value = '';
                    ph.textContent = 'No decks';
                    deckSelect.appendChild(ph);
                }
            } finally {
                hideLoader();
            }
        }
        async function loadCards(name) {
            showLoader();
            try {
                const resp = await fetch(`/cards?deck=${encodeURIComponent(name)}`);
                const data = await resp.json();
                cards = Array.isArray(data) ? data : [];
                index = 0;
                correctCount = 0;
                mistakes = [];
                attempts = 0;
                doneShown = false;
                sessionStart = performance.now();
                completeOverlay.hidden = true;
                if (practiceCardEl) practiceCardEl.hidden = false;
                clearDeckAudio();
                hydrateAudioFromLocalStorage();
                renderCurrent();
                preloadDeckAudio(name);
            } catch (e) {
                cards = [];
                index = 0;
                correctCount = 0;
                renderCurrent();
            } finally {
                hideLoader();
            }
        }

        function playAudio() {
            if (!cards.length) {
                return;
            }
            const c = cards[index];
            const key = `audio:de:${c.de}`;
            const ls = localStorage.getItem(key);
            if (ls) {
                audio.src = ls;
            } else {
                const cached = audioCache.get(c.de);
                if (cached) {
                    audio.src = cached;
                } else {
                    audio.src = `/tts?text=${encodeURIComponent(c.de)}&lang=de`;
                }
            }
            audio.play().catch(() => { })
        }

        function normalizeForCompare(s) {
            let out = String(s || '').toLowerCase();
            out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            out = out.replace(/\s*\([^)]*\)\s*/g, ' ');
            out = out.replace(/\s*\[[^\]]*\]\s*/g, ' ');
            out = out.replace(/\s*\{[^}]*\}\s*/g, ' ');
            out = out.replace(/\s+/g, ' ').trim();
            return out;
        }

        function stripOptionalForDisplay(s) {
            return String(s || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
        }

        function check() {
            if (!cards.length) {
                return;
            }
            const c = cards[index];
            const val = normalizeForCompare(spellingInput.value);
            const target = normalizeForCompare(c.de);
            if (!val) {
                feedback.textContent = '';
                clearAutoNext();
                return;
            }
            attempts++;
            if (val === target) {
                const disp = stripOptionalForDisplay(c.de);
                feedback.textContent = `Correct: ${disp}`;
                feedback.className = 'mt-3 text-sm text-green-600 dark:text-green-400';
                correctCount++;
                clearAutoNext();
                autoNextTimer = setTimeout(() => {
                    next();
                }, 1000);
            } else {
                feedback.textContent = `Incorrect: ${c.de}`;
                feedback.className = 'mt-3 text-sm text-red-600 dark:text-red-400';
                mistakes.push({
                    en: c.en,
                    de: c.de
                });
                clearAutoNext();
            }
        }

        function next() {
            if (!cards.length) {
                return;
            }
            clearAutoNext();
            if (index < cards.length - 1) {
                index++;
                renderCurrent();
            } else {
                showDone();
            }
        }

        function showDone() {
            if (doneShown) return;
            doneShown = true;
            const secs = Math.max(0, Math.round((performance.now() - sessionStart) / 1000));
            const mins = Math.floor(secs / 60);
            const rem = secs % 60;
            const acc = attempts > 0 ? Math.round((correctCount / attempts) * 100) : 100;
            accValue.textContent = acc + '%';
            timeValue.textContent = mins + 'm ' + rem + 's';
            if (practiceCardEl) practiceCardEl.hidden = true;
            completeOverlay.hidden = false;
            reviewBtn.hidden = acc === 100;
            reviewBtn.disabled = mistakes.length === 0;
        }
        backBtn.addEventListener('click', () => {
            history.length > 1 ? history.back() : location.href = '/'
        });
        homeBtn.addEventListener('click', () => {
            location.href = '/'
        });
        deckSelect.addEventListener('change', e => {
            currentDeck = e.target.value;
            loadCards(currentDeck)
        });
        playAudioBtn.addEventListener('click', playAudio);
        checkBtn.addEventListener('click', check);
        nextBtn.addEventListener('click', next);
        continueBtn.addEventListener('click', () => {
            if (!currentDeck) return;
            const from = params.get('from');
            const fromParam = from ? `&from=${encodeURIComponent(from)}` : '';
            window.location.href = `/match?deck=${encodeURIComponent(currentDeck)}${fromParam}`;
        });
        reviewBtn.addEventListener('click', () => {
            if (reviewBtn.disabled) return;
            const map = new Map();
            mistakes.forEach(m => {
                const k = (m.en || '') + '|' + (m.de || '');
                if (!map.has(k)) map.set(k, m);
            });
            cards = Array.from(map.values()).map(m => ({
                en: m.en,
                de: m.de
            }));
            index = 0;
            correctCount = 0;
            attempts = 0;
            mistakes = [];
            doneShown = false;
            completeOverlay.hidden = true;
            if (practiceCardEl) practiceCardEl.hidden = false;
            renderCurrent();
        });
        spellingInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) {
                    next();
                } else {
                    check();
                }
            }
        });
        let tooltipOpen = false;

        function updateTooltipPosition() {
            const rect = englishWord.getBoundingClientRect();
            const h = deTooltip.offsetHeight || 28;
            deTooltip.style.left = (rect.left + rect.width / 2) + 'px';
            deTooltip.style.top = (rect.top - h - 8) + 'px';
        }

        function openTooltip(text) {
            deTooltip.textContent = text;
            deTooltip.classList.remove('hidden');
            updateTooltipPosition();
            tooltipOpen = true;
        }

        function closeTooltip() {
            deTooltip.classList.add('hidden');
            tooltipOpen = false;
        }
        englishWord.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!cards.length) return;
            const c = cards[index];
            if (tooltipOpen) {
                closeTooltip();
            } else {
                openTooltip(c.de);
            }
        });
        deTooltip.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        document.addEventListener('click', () => {
            if (tooltipOpen) closeTooltip();
        });
        window.addEventListener('scroll', () => {
            if (tooltipOpen) updateTooltipPosition();
        }, {
            passive: true
        });
        window.addEventListener('resize', () => {
            if (tooltipOpen) updateTooltipPosition();
        });

        function hydrateAudioFromLocalStorage() {
            cards.forEach(c => {
                const v = localStorage.getItem(`audio:de:${c.de}`);
                if (v) audioCache.set(c.de, v);
            });
        }
        async function preloadDeckAudio(name) {
            try {
                const resp = await fetch(`/preload_deck_audio?deck=${encodeURIComponent(name)}`);
                if (!resp.ok) return;
                const data = await resp.json();
                const entries = Object.entries(data && data.audio_urls ? data.audio_urls : {});
                const tasks = entries.map(([text, url]) => fetchAudioAndCache(text, url));
                await Promise.allSettled(tasks);
            } catch { }
        }
        async function fetchAudioAndCache(text, url) {
            try {
                const r = await fetch(url);
                if (!r.ok) {
                    audioCache.set(text, url);
                    return;
                }
                const blob = await r.blob();
                const objUrl = URL.createObjectURL(blob);
                audioCache.set(text, objUrl);
                audioBlobUrls.set(text, objUrl);
                const base64 = await blobToBase64(blob);
                try {
                    localStorage.setItem(`audio:de:${text}`, String(base64));
                } catch { }
            } catch {
                audioCache.set(text, url);
            }
        }

        function blobToBase64(blob) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }

        function clearDeckAudio() {
            try {
                audioBlobUrls.forEach(u => {
                    try {
                        URL.revokeObjectURL(u);
                    } catch { }
                });
                audioBlobUrls.clear();
                audioCache.clear();
            } catch { }
        }

        function clearAutoNext() {
            if (autoNextTimer) {
                try {
                    clearTimeout(autoNextTimer);
                } catch { };
                autoNextTimer = null;
            }
        }
        loadDecks();