const backBtn = document.getElementById('backBtn');
        const homeBtn = document.getElementById('homeBtn');
        const matchBody = document.getElementById('matchBody');
        const completeOverlay = document.getElementById('completeOverlay');
        const accValue = document.getElementById('accValue');
        const timeValue = document.getElementById('timeValue');
        const continueBtn = document.getElementById('continueBtn');
        const reviewBtn = document.getElementById('reviewBtn');
        const goDeckBtn = document.getElementById('goDeckBtn');
        const leftCol = document.getElementById('leftCol');
        const rightCol = document.getElementById('rightCol');
        const showGermanToggle = document.getElementById('showGermanToggle');
        const progressText = document.getElementById('progressText');
        const feedback = document.getElementById('feedback');
        try {
            feedback.hidden = true;
        } catch { }
        const globalLoader = document.getElementById('globalLoader');

        function showLoader() {
            globalLoader.classList.add('is-active')
        }

        function hideLoader() {
            globalLoader.classList.remove('is-active')
        }
        const params = new URLSearchParams(location.search);
        let currentDeck = params.get('deck') || '';
        let currentFolder = params.get('from') || '';
        let cards = [];
        let originalCards = [];
        let used = new Set();
        let round = [];
        let matched = 0;
        let leftSelected = -1;
        let rightSelected = -1;
        let pendingIndices = [];
        let pendingRightIndices = [];
        let rightOrder = [];
        let showGermanLeft = false;
        let matchedIndices = new Set();
        let matchedRightIndices = new Set();
        let isAnimatingWrong = false;
        const audio = new Audio();
        const audioCache = new Map();
        let sessionStart = performance.now();
        let attempts = 0;
        let correctAttempts = 0;
        let mistakes = [];
        let doneShown = false;

        function setProgress() {
            progressText.textContent = `${used.size}/${cards.length}`
        }

        function play(text) {
            const key = `audio:de:${text}`;
            const ls = localStorage.getItem(key);
            if (ls) {
                audio.src = ls;
            } else {
                const cached = audioCache.get(text);
                if (cached) {
                    audio.src = cached;
                } else {
                    audio.src = `/tts?text=${encodeURIComponent(text)}&lang=de`;
                }
            }
            audio.play().catch(() => { })
        }

        function hydrateAudioLocal() {
            round.forEach(c => {
                const v = localStorage.getItem(`audio:de:${c.de}`);
                if (v) audioCache.set(c.de, v);
            });
        }
        async function preloadRoundAudio() {
            const tasks = round.map(c => fetch(`/tts?text=${encodeURIComponent(c.de)}&lang=de`).then(r => r.blob()).then(b => {
                const url = URL.createObjectURL(b);
                audioCache.set(c.de, url);
            }).catch(() => { }));
            await Promise.allSettled(tasks)
        }

        function pickRound() {
            round = [];
            matched = 0;
            leftSelected = -1;
            rightSelected = -1;
            const availableIdx = [...cards.keys()].filter(i => !used.has(i));
            const pool = Math.min(5, availableIdx.length);
            const seen = new Set();
            while (round.length < pool && availableIdx.length) {
                const j = Math.floor(Math.random() * availableIdx.length);
                const idx = availableIdx.splice(j, 1)[0];
                const c = cards[idx];
                const key = (c.en || '').trim().toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                round.push(c);
            }
        }

        function renderRound() {
            leftCol.innerHTML = '';
            rightCol.innerHTML = '';
            round.forEach((c, idx) => {
                const btn = document.createElement('button');
                if (showGermanLeft) {
                    btn.className = 'pair-text w-full';
                    btn.textContent = c.de;
                    btn.addEventListener('click', () => {
                        leftSelected = idx;
                        updateSelection();
                        checkMatch();
                    });
                } else {
                    btn.className = 'pair-btn w-full';
                    btn.innerHTML = '<span class="material-symbols-outlined">volume_up</span>';
                    btn.addEventListener('click', () => {
                        play(c.de);
                        leftSelected = idx;
                        updateSelection();
                        checkMatch();
                    });
                }
                if (matchedIndices.has(idx)) {
                    btn.classList.add('correct');
                    btn.disabled = true;
                }
                leftCol.appendChild(btn);
            });
            const texts = round.map(c => c.en);
            for (let i = texts.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [texts[i], texts[j]] = [texts[j], texts[i]];
            }
            texts.forEach((t, i) => {
                const div = document.createElement('button');
                div.className = 'pair-text w-full';
                div.textContent = t;
                div.addEventListener('click', () => {
                    rightSelected = i;
                    updateSelection(true, i);
                    checkMatch();
                });
                if (matchedRightIndices.has(i)) {
                    div.classList.add('correct');
                    div.disabled = true;
                }
                rightCol.appendChild(div);
            });
            rightOrder = texts.slice();
            hydrateAudioLocal();
            preloadRoundAudio();
        }

        function updateSelection(isRight = false, textOrIndex = '') {
            const l = Array.from(leftCol.children);
            l.forEach((el, i) => {
                el.classList.toggle('active', i === leftSelected)
            });
            const r = Array.from(rightCol.children);
            r.forEach((el) => {
                el.classList.remove('active')
            });
            if (isRight) {
                if (typeof textOrIndex === 'number' && r[textOrIndex]) {
                    r[textOrIndex].classList.add('active');
                } else {
                    r.forEach(el => {
                        if (el.textContent === textOrIndex) el.classList.add('active')
                    });
                }
            }
        }

        function clearActive() {
            Array.from(leftCol.children).forEach(el => el.classList.remove('active'));
            Array.from(rightCol.children).forEach(el => el.classList.remove('active'));
        }

        function checkMatch() {
            if (leftSelected < 0 || rightSelected < 0) return;
            const leftCard = round[leftSelected];
            const rightText = Array.from(rightCol.children)[rightSelected].textContent;
            const ok = rightText === leftCard.en;
            if (ok) {
                Array.from(leftCol.children)[leftSelected].classList.add('correct');
                Array.from(rightCol.children)[rightSelected].classList.add('correct');
                Array.from(leftCol.children)[leftSelected].disabled = true;
                Array.from(rightCol.children)[rightSelected].disabled = true;
                matched++;
                attempts++;
                correctAttempts++;
                pendingIndices.push(leftSelected);
                pendingRightIndices.push(rightSelected);
                matchedIndices.add(leftSelected);
                matchedRightIndices.add(rightSelected);
                clearActive();
                const originalIndex = cards.findIndex(c => c.en === leftCard.en && c.de === leftCard.de);
                if (originalIndex >= 0) used.add(originalIndex);
                setProgress();
                if (matched >= 3) {
                    replaceAfterThree();
                }
                if (used.size >= cards.length) {
                    showDone();
                }
            } else {
                attempts++;
                mistakes.push({
                    en: leftCard.en,
                    de: leftCard.de
                });
                const lEl = Array.from(leftCol.children)[leftSelected];
                const rEl = Array.from(rightCol.children)[rightSelected];
                clearActive();
                isAnimatingWrong = true;
                Array.from(leftCol.children).forEach(el => {
                    if (el !== lEl) el.classList.add('no-anim')
                });
                Array.from(rightCol.children).forEach(el => {
                    if (el !== rEl) el.classList.add('no-anim')
                });
                if (lEl) lEl.classList.add('wrong');
                if (rEl) rEl.classList.add('wrong');
                setTimeout(() => {
                    try {
                        if (lEl) lEl.classList.remove('wrong');
                        if (rEl) rEl.classList.remove('wrong');
                        Array.from(leftCol.children).forEach(el => el.classList.remove('no-anim'));
                        Array.from(rightCol.children).forEach(el => el.classList.remove('no-anim'));
                        isAnimatingWrong = false;
                    } catch {
                        Array.from(leftCol.children).forEach(el => el.classList.remove('no-anim'));
                        Array.from(rightCol.children).forEach(el => el.classList.remove('no-anim'));
                        isAnimatingWrong = false;
                    }
                }, 500);
            }
            leftSelected = -1;
            rightSelected = -1;
        }

        function replaceAfterThree() {
            const leftNodes = Array.from(leftCol.children);
            const rightNodes = Array.from(rightCol.children);
            const count = pendingIndices.length;
            if (used.size >= cards.length) {
                leftCol.innerHTML = '';
                rightCol.innerHTML = '';
                showDone();
                return;
            }
            if (count === 0) {
                if (used.size >= cards.length) {
                    showDone();
                }
                return;
            }
            // fade out matched items only
            for (let i = 0; i < count; i++) {
                const lIdx = pendingIndices[i];
                const rIdx = pendingRightIndices[i];
                if (leftNodes[lIdx]) leftNodes[lIdx].classList.add('fade-out');
                if (rightNodes[rIdx]) rightNodes[rIdx].classList.add('fade-out');
            }
            setTimeout(() => {
                const availableIdx = [...cards.keys()].filter(i => !used.has(i));
                const currentEn = new Set(round.filter((_, idx) => !pendingIndices.includes(idx)).map(c => (c.en || '').trim().toLowerCase()));
                const newCards = [];
                while (newCards.length < count && availableIdx.length) {
                    const j = Math.floor(Math.random() * availableIdx.length);
                    const idx = availableIdx.splice(j, 1)[0];
                    const candidate = cards[idx];
                    const key = (candidate.en || '').trim().toLowerCase();
                    if (currentEn.has(key)) continue;
                    currentEn.add(key);
                    newCards.push(candidate);
                }
                // shuffle new cards and independently shuffle right indices to avoid predictable patterns
                const shuffledNew = newCards.slice();
                for (let i = shuffledNew.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffledNew[i], shuffledNew[j]] = [shuffledNew[j], shuffledNew[i]];
                }
                const rightSlots = pendingRightIndices.slice();
                for (let i = rightSlots.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [rightSlots[i], rightSlots[j]] = [rightSlots[j], rightSlots[i]];
                }
                for (let i = 0; i < count; i++) {
                    const newCard = shuffledNew[i];
                    if (!newCard) continue;
                    const lIdx = pendingIndices[i];
                    const rIdx = rightSlots[i];
                    round[lIdx] = newCard;
                    // left element
                    const oldL = leftNodes[lIdx];
                    const newL = document.createElement('button');
                    if (showGermanLeft) {
                        newL.className = 'pair-text w-full';
                        newL.textContent = newCard.de;
                        newL.addEventListener('click', () => {
                            leftSelected = lIdx;
                            updateSelection();
                            checkMatch();
                        });
                    } else {
                        newL.className = 'pair-btn w-full';
                        newL.innerHTML = '<span class="material-symbols-outlined">volume_up</span>';
                        newL.addEventListener('click', () => {
                            play(newCard.de);
                            leftSelected = lIdx;
                            updateSelection();
                            checkMatch();
                        });
                    }
                    newL.classList.add('fade-in');
                    oldL.replaceWith(newL);
                    // right element
                    const oldR = rightNodes[rIdx];
                    const newR = document.createElement('button');
                    newR.className = 'pair-text w-full';
                    newR.textContent = newCard.en;
                    newR.addEventListener('click', () => {
                        rightSelected = rIdx;
                        updateSelection(true, rIdx);
                        checkMatch();
                    });
                    newR.classList.add('fade-in');
                    oldR.replaceWith(newR);
                    rightOrder[rIdx] = newCard.en;
                }
                setTimeout(() => {
                    Array.from(leftCol.children).forEach(el => el.classList.remove('fade-in'));
                    Array.from(rightCol.children).forEach(el => el.classList.remove('fade-in'));
                }, 720);
                matched = 0;
                pendingIndices = [];
                pendingRightIndices = [];
                matchedIndices.clear();
                matchedRightIndices.clear();
                setProgress();
                hydrateAudioLocal();
                preloadRoundAudio();
            }, 400);
        }

        function showDone() {
            if (doneShown) return;
            doneShown = true;
            leftCol.innerHTML = '';
            rightCol.innerHTML = '';
            const secs = Math.max(0, Math.round((performance.now() - sessionStart) / 1000));
            const mins = Math.floor(secs / 60);
            const rem = secs % 60;
            const acc = attempts > 0 ? Math.round((correctAttempts / attempts) * 100) : 100;
            accValue.textContent = acc + '%';
            timeValue.textContent = mins + 'm ' + rem + 's';
            setProgress();
            matchBody.hidden = true;
            feedback.hidden = true;
            completeOverlay.hidden = false;
            reviewBtn.hidden = acc === 100;
            reviewBtn.disabled = mistakes.length === 0;
        }

        function nextRound() {
            if (used.size >= cards.length) {
                showDone();
                return;
            }
            pickRound();
            renderRound();
            setProgress();
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

        function initFromCache(name) {
            const cached = getCache(`flashcard_cards_${name}`);
            if (!cached || !Array.isArray(cached) || !cached.length) return false;
            cards = cached;
            originalCards = cards.slice();
            used.clear();
            pickRound();
            renderRound();
            setProgress();
            try {
                feedback.hidden = true;
                feedback.textContent = '';
            } catch { }
            sessionStart = performance.now();
            attempts = 0;
            correctAttempts = 0;
            mistakes = [];
            doneShown = false;
            matchBody.hidden = false;
            completeOverlay.hidden = true;
            return true;
        }

        async function loadCards(name) {
            // Try instant load from cache
            const showedFromCache = initFromCache(name);
            if (!showedFromCache) showLoader();

            try {
                const resp = await fetch(`/cards?deck=${encodeURIComponent(name)}`);
                const data = await resp.json();
                saveCache(`flashcard_cards_${name}`, data);

                if (!showedFromCache) {
                    cards = Array.isArray(data) ? data : [];
                    originalCards = cards.slice();
                    used.clear();
                    pickRound();
                    renderRound();
                    setProgress();
                    try {
                        feedback.hidden = true;
                        feedback.textContent = '';
                    } catch { }
                    sessionStart = performance.now();
                    attempts = 0;
                    correctAttempts = 0;
                    mistakes = [];
                    doneShown = false;
                    matchBody.hidden = false;
                    completeOverlay.hidden = true;
                }
            } catch {
                if (!showedFromCache) {
                    cards = [];
                    used.clear();
                    leftCol.innerHTML = '';
                    rightCol.innerHTML = '';
                }
            } finally {
                hideLoader();
            }
        }
        backBtn.addEventListener('click', () => {
            history.length > 1 ? history.back() : location.href = '/'
        });
        homeBtn.addEventListener('click', () => {
            location.href = '/'
        });

        function animateToggleSwap() {
            const nodes = Array.from(leftCol.children);
            nodes.forEach((oldEl, idx) => {
                oldEl.classList.add('fade-out');
            });
            setTimeout(() => {
                nodes.forEach((oldEl, idx) => {
                    const c = round[idx];
                    const newBtn = document.createElement('button');
                    if (showGermanLeft) {
                        newBtn.className = 'pair-text w-full';
                        newBtn.textContent = c.de;
                        newBtn.addEventListener('click', () => {
                            leftSelected = idx;
                            updateSelection();
                            checkMatch();
                        });
                    } else {
                        newBtn.className = 'pair-btn w-full';
                        newBtn.innerHTML = '<span class="material-symbols-outlined">volume_up</span>';
                        newBtn.addEventListener('click', () => {
                            play(c.de);
                            leftSelected = idx;
                            updateSelection();
                            checkMatch();
                        });
                    }
                    if (matchedIndices.has(idx)) {
                        newBtn.classList.add('correct');
                        newBtn.disabled = true;
                    }
                    newBtn.classList.add('fade-in');
                    oldEl.replaceWith(newBtn);
                });
                setTimeout(() => {
                    Array.from(leftCol.children).forEach(el => el.classList.remove('fade-in'));
                }, 720);
            }, 360);
        }
        showGermanToggle.addEventListener('change', () => {
            if (isAnimatingWrong) {
                showGermanToggle.checked = !showGermanLeft;
                return;
            }
            showGermanLeft = !showGermanToggle.checked;
            try {
                localStorage.setItem('matchShowGermanLeft', showGermanLeft ? '1' : '0');
            } catch { }
            animateToggleSwap();
        });

        function shouldClear(t) {
            if (t.closest('.pair-btn,.pair-text')) return false;
            if (t.closest('#showGermanToggle')) return false;
            return true
        }
        document.addEventListener('click', (e) => {
            if (isAnimatingWrong) return;
            const t = e.target;
            if (!shouldClear(t)) return;
            clearActive();
            leftSelected = -1;
            rightSelected = -1;
        });
        // initialize toggle state
        try {
            const saved = localStorage.getItem('matchShowGermanLeft');
            showGermanLeft = (saved == null) ? true : (saved === '1');
        } catch {
            showGermanLeft = true
        }
        showGermanToggle.checked = !showGermanLeft;
        if (currentDeck) loadCards(currentDeck);
        continueBtn.addEventListener('click', () => {
            const fromParam = currentFolder ? `&from=${encodeURIComponent(currentFolder)}` : '';
            window.location.href = `/spelling?deck=${encodeURIComponent(currentDeck)}${fromParam}`;
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
            used.clear();
            pendingIndices = [];
            pendingRightIndices = [];
            matchedIndices.clear();
            matchedRightIndices.clear();
            matched = 0;
            sessionStart = performance.now();
            attempts = 0;
            correctAttempts = 0;
            mistakes = [];
            doneShown = false;
            completeOverlay.hidden = true;
            matchBody.hidden = false;
            pickRound();
            renderRound();
            setProgress();
        });