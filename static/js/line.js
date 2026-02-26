const params = new URLSearchParams(location.search);
        const deck = params.get('deck') || '';
        const lineList = document.getElementById('lineList');
        const globalLoader = document.getElementById('globalLoader');
        const backBtn = document.getElementById('backBtn');
        const homeBtn = document.getElementById('homeBtn');
        const refreshBtn = document.getElementById('refreshBtn');
        const progressText = document.getElementById('progressText');

        function showLoader() {
            globalLoader.classList.add('is-active');
        }

        function hideLoader() {
            globalLoader.classList.remove('is-active');
        }

        function setStatus(t) {
            progressText.textContent = t || '';
        }

        function init() {
            if (!deck) {
                setStatus('Open Line from a deck');
                return;
            }
            generate();
        }

        let lastItems = [];

        function renderRows(items) {
            lineList.innerHTML = '';
            lastItems = [];
            const shown = [];
            items.forEach((it, i) => {
                const hasContent = ((it.de || '').trim().length +
                    (it.en || '').trim().length +
                    (it.line_en || '').trim().length +
                    (it.line_de || '').trim().length) > 0;
                if (!hasContent) return;
                const card = document.createElement('div');
                card.className = 'rounded-xl bg-card-light dark:bg-card-dark p-4 shadow-sm';
                card.classList.add('tile-enter');
                card.style.animationDelay = `${i * 40}ms`;
                card.innerHTML = `
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <div class="text-xs font-semibold text-text-secondary-light dark:text-text-secondary-dark">German</div>
                            <div class="text-base font-semibold text-text-primary-light dark:text-text-primary-dark word-de" style="cursor:pointer;" data-word="${(it.de || '').replace(/"/g, '&quot;')}">${it.de || ''}</div>
                        </div>
                        <div>
                            <div class="text-xs font-semibold text-text-secondary-light dark:text-text-secondary-dark">English</div>
                            <div class="text-base font-semibold text-text-primary-light dark:text-text-primary-dark">${it.en || ''}</div>
                        </div>
                    </div>
                    <div class="mt-3">
                        <div class="text-xs font-semibold text-text-secondary-light dark:text-text-secondary-dark">German Line</div>
                        <div class="text-sm text-text-primary-light dark:text-text-primary-dark line-de">${it.line_de || ''}</div>
                    </div>
                    <div class="mt-3">
                        <div class="text-xs font-semibold text-text-secondary-light dark:text-text-secondary-dark">English Line</div>
                        <div class="text-sm text-text-primary-light dark:text-text-primary-dark">${it.line_en || ''}</div>
                    </div>
                `;
                lineList.appendChild(card);
                shown.push(it);
                lastItems.push(it);
                // attach word audio click
                const wordEl = card.querySelector('.word-de');
                if (wordEl && (it.de || '').trim()) {
                    wordEl.addEventListener('click', () => {
                        playWord((it.de || '').trim());
                    });
                }
                const btn = card.querySelector('.line-de');
                if (btn && (it.line_de || '').trim()) {
                    btn.style.cursor = 'pointer';
                    btn.addEventListener('click', () => {
                        playLine((it.line_de || '').trim());
                    });
                }
            });
            const total = items.length;
            setStatus(`Generated ${shown.length}${total ? ` of ${total}` : ''} lines`);
        }

        async function generate(refresh = false) {
            if (!deck) {
                setStatus('Select a deck');
                return;
            }
            showLoader();
            try {
                setStatus(refresh ? 'Refreshing...' : 'Generating...');
                const url = `/lines/generate?deck=${encodeURIComponent(deck)}${refresh ? '&refresh=1' : ''}`;
                const resp = await fetch(url);
                const out = await resp.json();
                if (!resp.ok) throw new Error(out.detail || 'Failed');
                renderRows(out.items || []);
                setStatus(`Generated ${out.count} lines`);
                hideLoader();
                const prefetch = fetch(`/preload_lines_audio?deck=${encodeURIComponent(deck)}`)
                    .then(r => r.json())
                    .then(j => {
                        const map = j && j.audio_urls ? j.audio_urls : {};
                        Object.entries(map).forEach(([t, u]) => lineAudioURLs.set(t, u));
                        if ('requestIdleCallback' in window) {
                            requestIdleCallback(() => preloadLineAudio(map));
                        } else {
                            setTimeout(() => preloadLineAudio(map), 300);
                        }
                    })
                    .catch(() => { });
                // Also preload word audio in background
                fetch(`/preload_deck_audio?deck=${encodeURIComponent(deck)}`)
                    .then(r => r.json())
                    .then(j => {
                        const map = j && j.audio_urls ? j.audio_urls : {};
                        Object.entries(map).forEach(([t, u]) => wordAudioURLs.set(t, u));
                        if ('requestIdleCallback' in window) {
                            requestIdleCallback(() => preloadWordAudio(map));
                        } else {
                            setTimeout(() => preloadWordAudio(map), 500);
                        }
                    })
                    .catch(() => { });
            } catch (e) {
                setStatus(String(e.message || e));
                hideLoader();
            }
        }

        const audio = new Audio();
        audio.preload = 'auto';
        const lineAudioURLs = new Map();
        const lineAudioCache = new Map();
        const wordAudioURLs = new Map();
        const wordAudioCache = new Map();

        function playLine(text) {
            const key = `audio:de:${text}`;
            const ls = localStorage.getItem(key);
            if (ls) {
                audio.src = ls;
            } else {
                const cached = lineAudioCache.get(text) || lineAudioURLs.get(text);
                audio.src = cached || `/tts?text=${encodeURIComponent(text)}&lang=de`;
            }
            audio.play().catch(() => { });
        }

        function playWord(text) {
            const cached = wordAudioCache.get(text) || wordAudioURLs.get(text);
            audio.src = cached || `/tts?text=${encodeURIComponent(text)}&lang=de`;
            audio.play().catch(() => { });
        }

        async function preloadLineAudio(map) {
            try {
                const entries = Object.entries(map);
                const tasks = entries.map(([text, url]) => (async () => {
                    try {
                        const r = await fetch(url);
                        if (!r.ok) return;
                        const b = await r.blob();
                        const objUrl = URL.createObjectURL(b);
                        lineAudioCache.set(text, objUrl);
                        const base64 = await new Promise((resolve, reject) => {
                            const fr = new FileReader();
                            fr.onloadend = () => resolve(fr.result);
                            fr.onerror = reject;
                            fr.readAsDataURL(b);
                        });
                        try {
                            localStorage.setItem(`audio:de:${text}`, base64);
                        } catch { }
                    } catch { }
                })());
                await Promise.allSettled(tasks);
            } catch { }
        }

        async function preloadWordAudio(map) {
            try {
                const entries = Object.entries(map);
                const tasks = entries.map(([text, url]) => (async () => {
                    try {
                        if (wordAudioCache.has(text)) return;
                        const r = await fetch(url);
                        if (!r.ok) return;
                        const b = await r.blob();
                        wordAudioCache.set(text, URL.createObjectURL(b));
                    } catch { }
                })());
                await Promise.allSettled(tasks);
            } catch { }
        }

        function exportCSV() {
            const rows = (lastItems || []).map(it => [it.de || '', it.en || '', it.line_en || '', it.line_de || ''].map(x => String(x).replace(/"/g, '""')));
            const header = ['German', 'English', 'English Line', 'German Line'];
            const csv = [header].concat(rows).map(r => r.map(x => `"${x}"`).join(',')).join('\n');
            const blob = new Blob([csv], {
                type: 'text/csv'
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = (deck || 'lines') + '.csv';
            document.body.appendChild(a);
            a.click();
            URL.revokeObjectURL(url);
            a.remove();
        }

        backBtn.addEventListener('click', () => { history.length > 1 ? history.back() : location.href = '/' });
        homeBtn.addEventListener('click', () => { location.href = '/' });
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                // Clear current list and request fresh data from the server
                lineList.innerHTML = '';
                lastItems = [];
                generate(true);
            });
        }
        init();