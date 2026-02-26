// DOM
        const backBtn = document.getElementById('backBtn');
        const headerTitle = document.getElementById('headerTitle');
        const progressContainer = document.getElementById('progressContainer');
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        const mainContent = document.getElementById('mainContent');
        const loadingState = document.getElementById('loadingState');
        const loadingText = document.getElementById('loadingText');
        const storyListView = document.getElementById('storyListView');
        const storyList = document.getElementById('storyList');
        const createStoryBtn = document.getElementById('createStoryBtn');
        const storyContent = document.getElementById('storyContent');
        const storyCard = document.getElementById('storyCard');
        const storyTitle = document.getElementById('storyTitle');
        const storySubtitle = document.getElementById('storySubtitle');
        const segmentsContainer = document.getElementById('segmentsContainer');
        const completedState = document.getElementById('completedState');
        const continueContainer = document.getElementById('continueContainer');
        const continueBtn = document.getElementById('continueBtn');
        const restartBtn = document.getElementById('restartBtn');
        const backToListBtn = document.getElementById('backToListBtn');
        const actionPopup = document.getElementById('actionPopup');
        const actionPopupBackdrop = document.getElementById('actionPopupBackdrop');
        const actionPopupTitle = document.getElementById('actionPopupTitle');
        const actionPopupSubtitle = document.getElementById('actionPopupSubtitle');
        const deleteStoryBtn = document.getElementById('deleteStoryBtn');
        const cancelActionBtn = document.getElementById('cancelActionBtn');
        const createModal = document.getElementById('createModal');
        const createModalBackdrop = document.getElementById('createModalBackdrop');
        const createModalClose = document.getElementById('createModalClose');
        const storyTopicInput = document.getElementById('storyTopicInput');
        const storyTextInput = document.getElementById('storyTextInput');
        const storyLevelSelect = document.getElementById('storyLevelSelect');
        const createStorySubmit = document.getElementById('createStorySubmit');
        const randomStoryBtn = document.getElementById('randomStoryBtn');
        const tooltip = document.getElementById('tooltip');
        const storyLevelBadge = document.getElementById('storyLevelBadge');
        const srtFileInput = document.getElementById('srtFileInput');
        const audioToggleBtn = document.getElementById('audioToggleBtn');
        const audioToggleIcon = document.getElementById('audioToggleIcon');
        const refreshTranslationsBtn = document.getElementById('refreshTranslationsBtn');

        // State
        const params = new URLSearchParams(location.search);
        let currentDeck = params.get('deck') || '';
        let story = null;
        let vocabulary = {};
        let sentenceUnits = [];

        // Common German words fallback dictionary
        const commonWords = {
            'ich': 'I',
            'du': 'you',
            'er': 'he',
            'sie': 'she/they',
            'es': 'it',
            'wir': 'we',
            'ihr': 'you (pl.)',
            'der': 'the',
            'die': 'the',
            'das': 'the',
            'ein': 'a/an',
            'eine': 'a/an',
            'ist': 'is',
            'bin': 'am',
            'bist': 'are',
            'sind': 'are',
            'war': 'was',
            'waren': 'were',
            'hat': 'has',
            'habe': 'have',
            'haben': 'have',
            'hatte': 'had',
            'hatten': 'had',
            'und': 'and',
            'oder': 'or',
            'aber': 'but',
            'weil': 'because',
            'wenn': 'if/when',
            'nicht': 'not',
            'kein': 'no/none',
            'keine': 'no/none',
            'was': 'what',
            'wer': 'who',
            'wo': 'where',
            'wie': 'how',
            'warum': 'why',
            'wann': 'when',
            'hier': 'here',
            'dort': 'there',
            'da': 'there',
            'jetzt': 'now',
            'dann': 'then',
            'immer': 'always',
            'sehr': 'very',
            'so': 'so',
            'auch': 'also',
            'nur': 'only',
            'noch': 'still/yet',
            'mit': 'with',
            'zu': 'to',
            'in': 'in',
            'an': 'at/on',
            'auf': 'on',
            'für': 'for',
            'von': 'from',
            'mein': 'my',
            'dein': 'your',
            'sein': 'his',
            'ihr': 'her',
            'unser': 'our',
            'ja': 'yes',
            'nein': 'no',
            'gut': 'good',
            'schlecht': 'bad',
            'groß': 'big',
            'klein': 'small',
            'kann': 'can',
            'muss': 'must',
            'will': 'want',
            'soll': 'should',
            'darf': 'may',
            'gehen': 'go',
            'kommen': 'come',
            'sehen': 'see',
            'machen': 'make/do',
            'sagen': 'say',
            'mehr': 'more',
            'alle': 'all',
            'viel': 'much',
            'wenig': 'little',
            'etwas': 'something',
            'ans': 'to the',
            'ins': 'into the',
            'beim': 'at the',
            'zum': 'to the',
            'vom': 'from the'
        };
        let currentSegmentIndex = 0;
        let renderedSegmentCount = 0;
        let audioPlayer = new Audio();
        let audioCache = new Map();
        const AUDIO_PREFETCH_BATCH = 25;
        let audioPrefetchEnd = 0;
        let characters = [];
        let allDecks = [];
        let allStories = [];
        let isReadingMode = false;
        let selectedStoryForAction = null;
        let longPressTimer = null;
        const LONG_PRESS_DURATION = 500;
        let isAudioEnabled = true;

        const avatarClasses = ['avatar-1', 'avatar-2', 'avatar-3', 'avatar-4'];

        function addToVocabulary(de, en) {
            if (!de || !en) return;
            const lower = de.toLowerCase();
            const cleaned = lower.replace(/[.,!?;:'"„"»«()]/g, '');
            if (!vocabulary[lower]) vocabulary[lower] = en;
            if (cleaned && !vocabulary[cleaned]) vocabulary[cleaned] = en;
            lower.split(/\s+/).forEach(part => {
                const partClean = part.replace(/[.,!?;:'"„"»«()]/g, '');
                if (partClean && !vocabulary[partClean]) {
                    vocabulary[partClean] = en;
                }
            });
        }

        function getAvatarClass(name) {
            const idx = characters.indexOf(name);
            return avatarClasses[idx % avatarClasses.length];
        }

        function getInitial(name) {
            return (name || 'N')[0].toUpperCase();
        }

        // Init
        async function init() {
            if (currentDeck) {
                await loadStory(currentDeck);
            } else {
                await loadStoryList();
            }
        }

        async function loadStoryList() {
            // Check cache first for instant rendering
            try {
                const cachedStories = sessionStorage.getItem('cached_stories');
                const cachedDecks = sessionStorage.getItem('cached_decks_for_stories');

                if (cachedStories && cachedDecks) {
                    allStories = JSON.parse(cachedStories);
                    allDecks = JSON.parse(cachedDecks);

                    // Show cached text immediately
                    loadingState.style.display = 'none';
                    storyListView.style.display = 'block';
                    storyContent.style.display = 'none';
                    completedState.style.display = 'none';
                    continueContainer.style.display = 'none';

                    headerTitle.style.display = 'block';
                    createStoryBtn.style.display = 'flex';
                    progressContainer.style.display = 'none';
                    progressText.style.display = 'none';
                    if (audioToggleBtn) audioToggleBtn.style.display = 'none';
                    if (refreshTranslationsBtn) refreshTranslationsBtn.style.display = 'none';
                    mainContent.classList.remove('with-continue');
                    isReadingMode = false;

                    renderStoryList();
                } else {
                    // Only show loader if no cache
                    loadingState.style.display = 'flex';
                    loadingText.textContent = 'Loading stories...';
                    storyListView.style.display = 'none';
                    storyContent.style.display = 'none';
                    completedState.style.display = 'none';
                    continueContainer.style.display = 'none';

                    headerTitle.style.display = 'block';
                    createStoryBtn.style.display = 'flex';
                    progressContainer.style.display = 'none';
                    progressText.style.display = 'none';
                    if (audioToggleBtn) audioToggleBtn.style.display = 'none';
                    if (refreshTranslationsBtn) refreshTranslationsBtn.style.display = 'none';
                    mainContent.classList.remove('with-continue');
                    isReadingMode = false;
                }
            } catch (e) {
                // Ignore cache errors
            }

            try {
                const [storiesResp, decksResp] = await Promise.all([
                    fetch('/stories/list'),
                    fetch('/decks')
                ]);

                const storiesData = await storiesResp.json();
                const decksData = await decksResp.json();

                const newStories = storiesData.stories || [];
                const newDecks = Array.isArray(decksData) ? decksData : [];

                // Compare with current data to avoid re-render (which restarts animation)
                const isStoriesChanged = JSON.stringify(newStories) !== JSON.stringify(allStories);
                const isDecksChanged = JSON.stringify(newDecks) !== JSON.stringify(allDecks);

                if (!isStoriesChanged && !isDecksChanged) {
                    loadingState.style.display = 'none';
                    return; // Data is same, skip re-render
                }

                allStories = newStories;
                allDecks = newDecks;

                // Update cache
                try {
                    sessionStorage.setItem('cached_stories', JSON.stringify(allStories));
                    sessionStorage.setItem('cached_decks_for_stories', JSON.stringify(allDecks));
                } catch (e) { }

                loadingState.style.display = 'none';
                renderStoryList();

            } catch (error) {
                console.error('Failed to load stories:', error);

                // Only show error state if we didn't show cached content
                if (storyListView.style.display === 'none') {
                    loadingState.innerHTML = `
                        <div class="empty-state">
                            <div class="empty-state__emoji">😕</div>
                            <h3 class="empty-state__title">Failed to load stories</h3>
                            <button class="continue-btn" onclick="location.href='/'">Go to Home</button>
                        </div>
                    `;
                }
            }
        }

        function renderStoryList() {
            storyListView.style.display = 'block';

            if (allStories.length === 0) {
                storyList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state__emoji">📖</div>
                        <h3 class="empty-state__title">No stories yet</h3>
                        <p class="empty-state__text">Create your first AI-generated story!</p>
                    </div>
                `;
                return;
            }

            // Sort by most recent
            allStories.sort((a, b) => {
                const dateA = a.last_modified ? new Date(a.last_modified) : new Date(0);
                const dateB = b.last_modified ? new Date(b.last_modified) : new Date(0);
                return dateB - dateA;
            });

            storyList.innerHTML = allStories.map((s, i) => {
                const title = s.title_de || s.deck;
                const subtitle = s.title_en || '';
                const level = s.level || '';
                // Stagger animation: 40ms per item
                const delay = i * 40;
                return `
                    <div class="story-item tile-enter" style="animation-delay: ${delay}ms;" data-deck="${s.deck}" data-title="${title}">
                        ${level ? `<span class="story-item__level">${level}</span>` : ''}
                        <!-- <h3 class="story-item__title">${title}</h3> -->
                        ${subtitle ? `<p class="story-item__subtitle">${subtitle}</p>` : ''}
                    </div>
                `;
            }).join('');

            // Add click and long-press handlers
            storyList.querySelectorAll('.story-item').forEach(item => {
                // Click to open
                item.addEventListener('click', (e) => {
                    if (longPressTimer) return; // Ignore if long press was triggered
                    const deck = item.dataset.deck;
                    loadStory(deck);
                });

                // Long press to delete
                item.addEventListener('pointerdown', (e) => {
                    item.classList.add('holding');
                    longPressTimer = setTimeout(() => {
                        item.classList.remove('holding');
                        openActionPopup(item.dataset.deck, item.dataset.title);
                        longPressTimer = null;
                    }, LONG_PRESS_DURATION);
                });

                item.addEventListener('pointerup', () => {
                    item.classList.remove('holding');
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                });

                item.addEventListener('pointerleave', () => {
                    item.classList.remove('holding');
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                });

                item.addEventListener('pointercancel', () => {
                    item.classList.remove('holding');
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                });
            });
        }

        // function getTimeAgo(date) {
        //     const now = new Date();
        //     const diff = now - date;
        //     const minutes = Math.floor(diff / 60000);
        //     const hours = Math.floor(diff / 3600000);
        //     const days = Math.floor(diff / 86400000);

        //     if (minutes < 1) return 'Just now';
        //     if (minutes < 60) return `${minutes}m ago`;
        //     if (hours < 24) return `${hours}h ago`;
        //     if (days < 7) return `${days}d ago`;
        //     return date.toLocaleDateString();
        // }

        // Action popup
        function openActionPopup(deck, title) {
            selectedStoryForAction = deck;
            actionPopupTitle.textContent = title;
            actionPopupSubtitle.textContent = `From deck: ${deck}`;
            actionPopup.classList.add('visible');
        }

        function closeActionPopup() {
            actionPopup.classList.remove('visible');
            selectedStoryForAction = null;
        }

        function deleteSelectedStory() {
            if (!selectedStoryForAction) return;

            const deck = selectedStoryForAction;
            closeActionPopup();

            // Remove from UI immediately
            allStories = allStories.filter(s => s.deck !== deck);
            renderStoryList();

            // Delete in background (fire-and-forget)
            fetch(`/story/delete?deck=${encodeURIComponent(deck)}`, {
                method: 'DELETE'
            }).catch(err => console.warn('Background delete failed:', err));
        }

        function splitTextIntoSentences(text) {
            const result = [];
            if (!text) return result;
            let current = '';
            for (let i = 0; i < text.length; i++) {
                const ch = text[i];
                current += ch;
                if (ch === '.' || ch === '!' || ch === '?') {
                    let j = i + 1;
                    while (j < text.length && /\s/.test(text[j])) {
                        j++;
                    }
                    result.push(current.trim());
                    current = '';
                    i = j - 1;
                }
            }
            if (current.trim()) {
                result.push(current.trim());
            }
            return result;
        }

        function rebuildSentenceUnits() {
            sentenceUnits = [];
            if (!story || !Array.isArray(story.segments)) return;
            for (let segIndex = 0; segIndex < story.segments.length; segIndex++) {
                const seg = story.segments[segIndex] || {};
                const textDe = (seg.text_de || '').trim();
                const textEn = (seg.text_en || '').trim();
                if (!textDe) continue;
                const deParts = splitTextIntoSentences(textDe);
                const enParts = textEn ? splitTextIntoSentences(textEn) : [];
                deParts.forEach((deSentence, idx) => {
                    sentenceUnits.push({
                        segmentIndex: segIndex,
                        sentenceIndex: idx,
                        text_de: deSentence,
                        text_en: enParts[idx] || textEn,
                        type: seg.type || 'narration',
                        speaker: seg.speaker || 'narrator',
                        highlight_pairs: seg.highlight_pairs || [],
                        highlight_words: seg.highlight_words || [],
                        full_vocabulary: seg.full_vocabulary || null
                    });
                });
            }
        }

        async function loadStory(deck, refresh = false) {
            currentDeck = deck;

            // Clear previous caches
            audioCache.forEach(url => {
                if (url.startsWith('blob:')) URL.revokeObjectURL(url);
            });
            audioCache.clear();
            audioPrefetchEnd = 0;
            vocabulary = {};

            loadingState.style.display = 'flex';
            loadingText.textContent = refresh ? 'Creating new story with AI...' : 'Loading story...';
            storyListView.style.display = 'none';
            storyContent.style.display = 'none';
            completedState.style.display = 'none';
            continueContainer.style.display = 'none';

            // Switch to reading mode header
            headerTitle.style.display = 'none';
            createStoryBtn.style.display = 'none';
            progressContainer.style.display = 'block';
            progressText.style.display = 'block';
            if (audioToggleBtn) audioToggleBtn.style.display = 'inline-flex';
            if (refreshTranslationsBtn) refreshTranslationsBtn.style.display = 'inline-flex';
            mainContent.classList.add('with-continue');
            isReadingMode = true;

            try {
                const url = `/story/generate?deck=${encodeURIComponent(deck)}${refresh ? '&refresh=true' : ''}`;
                const resp = await fetch(url);
                const data = await resp.json();

                if (!resp.ok) throw new Error(data.detail || 'Failed to load story');

                story = data.story;
                characters = story.characters || [];

                vocabulary = {};
                if (story.vocabulary && Object.keys(story.vocabulary).length > 0) {
                    Object.entries(story.vocabulary).forEach(([de, en]) => {
                        addToVocabulary(de, en);
                    });
                } else if (story.segments) {
                    story.segments.forEach(seg => {
                        (seg.highlight_pairs || []).forEach(pair => {
                            addToVocabulary(pair.de, pair.en);
                        });
                    });
                }

                if (!story.segments || story.segments.length === 0) {
                    throw new Error('Story has no content');
                }

                rebuildSentenceUnits();
                if (!sentenceUnits.length) {
                    throw new Error('Story has no content');
                }

                currentSegmentIndex = 0;

                // Start story immediately, prefetch audio in background
                showStory();

            } catch (error) {
                console.error('Failed to load story:', error);
                loadingState.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state__emoji">😕</div>
                        <h3 class="empty-state__title">Failed to load story</h3>
                        <p class="empty-state__text">${error.message}</p>
                        <button class="continue-btn" onclick="loadStory('${deck}', true)">Try Again</button>
                        <button class="btn-secondary" onclick="loadStoryList()">Back to Stories</button>
                    </div>
                `;
            }
        }

        async function loadStoryWithTopic(topic, level) {
            // Generate a unique ID for this story
            const storyId = 'custom_' + Date.now();
            currentDeck = storyId;

            // Clear previous caches
            audioCache.forEach(url => {
                if (url.startsWith('blob:')) URL.revokeObjectURL(url);
            });
            audioCache.clear();
            audioPrefetchEnd = 0;
            vocabulary = {};

            loadingState.style.display = 'flex';
            loadingText.textContent = 'Creating your story with AI...';
            storyListView.style.display = 'none';
            storyContent.style.display = 'none';
            completedState.style.display = 'none';
            continueContainer.style.display = 'none';

            // Switch to reading mode header
            headerTitle.style.display = 'none';
            createStoryBtn.style.display = 'none';
            progressContainer.style.display = 'block';
            progressText.style.display = 'block';
            if (audioToggleBtn) audioToggleBtn.style.display = 'inline-flex';
            if (refreshTranslationsBtn) refreshTranslationsBtn.style.display = 'inline-flex';
            mainContent.classList.add('with-continue');
            isReadingMode = true;

            try {
                const resp = await fetch('/story/generate/custom', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ topic: topic, story_id: storyId, level: level || 'A2' })
                });
                const data = await resp.json();

                if (!resp.ok) throw new Error(data.detail || 'Failed to create story');

                story = data.story;
                currentDeck = data.story_id || storyId;
                characters = story.characters || [];

                vocabulary = {};
                if (story.vocabulary && Object.keys(story.vocabulary).length > 0) {
                    Object.entries(story.vocabulary).forEach(([de, en]) => {
                        addToVocabulary(de, en);
                    });
                } else if (story.segments) {
                    story.segments.forEach(seg => {
                        (seg.highlight_pairs || []).forEach(pair => {
                            addToVocabulary(pair.de, pair.en);
                        });
                    });
                }

                if (!story.segments || story.segments.length === 0) {
                    throw new Error('Story has no content');
                }

                rebuildSentenceUnits();
                if (!sentenceUnits.length) {
                    throw new Error('Story has no content');
                }

                currentSegmentIndex = 0;

                // Start story immediately, prefetch audio in background
                showStory();

                // Reload story list in background to show the new story
                fetch('/stories/list').then(r => r.json()).then(data => {
                    allStories = data.stories || [];
                }).catch(() => { });

            } catch (error) {
                console.error('Failed to create story:', error);
                loadingState.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state__emoji">😕</div>
                        <h3 class="empty-state__title">Failed to create story</h3>
                        <p class="empty-state__text">${error.message}</p>
                        <button class="continue-btn" onclick="openCreateModal()">Try Again</button>
                        <button class="btn-secondary" onclick="loadStoryList()">Back to Stories</button>
                    </div>
                `;
            }
        }

        async function loadStoryFromText(text, level) {
            const storyId = 'text_' + Date.now();
            currentDeck = storyId;

            audioCache.forEach(url => {
                if (url.startsWith('blob:')) URL.revokeObjectURL(url);
            });
            audioCache.clear();
            audioPrefetchEnd = 0;
            vocabulary = {};

            loadingState.style.display = 'flex';
            loadingText.textContent = 'Processing your story...';
            storyListView.style.display = 'none';
            storyContent.style.display = 'none';
            completedState.style.display = 'none';
            continueContainer.style.display = 'none';

            headerTitle.style.display = 'none';
            createStoryBtn.style.display = 'none';
            progressContainer.style.display = 'block';
            progressText.style.display = 'block';
            if (audioToggleBtn) audioToggleBtn.style.display = 'inline-flex';
            if (refreshTranslationsBtn) refreshTranslationsBtn.style.display = 'inline-flex';
            mainContent.classList.add('with-continue');
            isReadingMode = true;

            try {
                const resp = await fetch('/story/from_text', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: text, story_id: storyId, level: level || 'A2' })
                });
                const data = await resp.json();

                if (!resp.ok) throw new Error(data.detail || 'Failed to process story');

                story = data.story;
                currentDeck = data.story_id || storyId;
                characters = story.characters || [];

                vocabulary = {};
                if (story.vocabulary && Object.keys(story.vocabulary).length > 0) {
                    Object.entries(story.vocabulary).forEach(([de, en]) => {
                        addToVocabulary(de, en);
                    });
                } else if (story.segments) {
                    story.segments.forEach(seg => {
                        (seg.highlight_pairs || []).forEach(pair => {
                            addToVocabulary(pair.de, pair.en);
                        });
                    });
                }

                if (!story.segments || story.segments.length === 0) {
                    throw new Error('Story has no content');
                }

                rebuildSentenceUnits();
                if (!sentenceUnits.length) {
                    throw new Error('Story has no content');
                }

                currentSegmentIndex = 0;
                showStory();
                ensureAudioPrefetchAround(0);
            } catch (error) {
                console.error('Failed to process story:', error);
                loadingState.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state__emoji">😕</div>
                        <h3 class="empty-state__title">Failed to process story</h3>
                        <p class="empty-state__text">${error.message}</p>
                        <button class="btn-secondary" onclick="loadStoryList()">Back to Stories</button>
                    </div>
                `;
            }
        }

        async function loadStoryFromSrt(file) {
            if (!file) return;

            audioCache.forEach(url => {
                if (url.startsWith('blob:')) URL.revokeObjectURL(url);
            });
            audioCache.clear();
            audioPrefetchEnd = 0;
            vocabulary = {};

            loadingState.style.display = 'flex';
            loadingText.textContent = 'Loading subtitles...';
            storyListView.style.display = 'none';
            storyContent.style.display = 'none';
            completedState.style.display = 'none';
            continueContainer.style.display = 'none';

            headerTitle.style.display = 'none';
            createStoryBtn.style.display = 'none';
            progressContainer.style.display = 'block';
            progressText.style.display = 'block';
            if (audioToggleBtn) audioToggleBtn.style.display = 'inline-flex';
            if (refreshTranslationsBtn) refreshTranslationsBtn.style.display = 'inline-flex';
            mainContent.classList.add('with-continue');
            isReadingMode = true;

            try {
                const form = new FormData();
                form.append('file', file);

                const resp = await fetch('/story/upload_srt', {
                    method: 'POST',
                    body: form
                });
                const data = await resp.json();

                if (!resp.ok) throw new Error(data.detail || 'Failed to load subtitles');

                story = data.story;
                currentDeck = data.story_id || 'srt_' + Date.now();
                characters = story.characters || [];

                vocabulary = {};
                if (story.vocabulary && Object.keys(story.vocabulary).length > 0) {
                    Object.entries(story.vocabulary).forEach(([de, en]) => {
                        addToVocabulary(de, en);
                    });
                }

                if (!story.segments || story.segments.length === 0) {
                    throw new Error('Story has no content');
                }

                rebuildSentenceUnits();
                if (!sentenceUnits.length) {
                    throw new Error('Story has no content');
                }

                currentSegmentIndex = 0;
                showStory();
                ensureAudioPrefetchAround(0);
            } catch (error) {
                console.error('Failed to load subtitles:', error);
                loadingState.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state__emoji">😕</div>
                        <h3 class="empty-state__title">Failed to load subtitles</h3>
                        <p class="empty-state__text">${error.message}</p>
                        <button class="btn-secondary" onclick="loadStoryList()">Back to Stories</button>
                    </div>
                `;
            } finally {
                if (srtFileInput) srtFileInput.value = '';
            }
        }

        // ── Tab switching for create modal ────────────────────────────────
        function switchCreateTab(tab) {
            const tabs = { ai: 'tabAI', text: 'tabText', yt: 'tabYT' };
            const contents = { ai: 'tabContentAI', text: 'tabContentText', yt: 'tabContentYT' };
            Object.keys(tabs).forEach(k => {
                const btn = document.getElementById(tabs[k]);
                const content = document.getElementById(contents[k]);
                if (!btn || !content) return;
                const active = k === tab;
                btn.style.background = active ? 'var(--accent)' : 'var(--card-bg)';
                btn.style.color = active ? '#fff' : 'var(--text)';
                btn.style.borderColor = active ? 'var(--accent)' : 'var(--card-border)';
                content.style.display = active ? 'block' : 'none';
            });
        }

        // ── YouTube subtitle loader ───────────────────────────────────────
        async function loadStoryFromYoutube(url, level) {
            const ytError = document.getElementById('ytError');
            if (ytError) { ytError.style.display = 'none'; ytError.textContent = ''; }

            audioCache.forEach(u => { if (u.startsWith('blob:')) URL.revokeObjectURL(u); });
            audioCache.clear();
            audioPrefetchEnd = 0;
            vocabulary = {};

            // Close modal + show loading
            createModal.classList.remove('visible');
            loadingState.style.display = 'flex';
            loadingText.textContent = 'Extracting subtitles from YouTube…';
            storyListView.style.display = 'none';
            storyContent.style.display = 'none';
            completedState.style.display = 'none';
            continueContainer.style.display = 'none';

            headerTitle.style.display = 'none';
            createStoryBtn.style.display = 'none';
            progressContainer.style.display = 'block';
            progressText.style.display = 'block';
            if (audioToggleBtn) audioToggleBtn.style.display = 'inline-flex';
            if (refreshTranslationsBtn) refreshTranslationsBtn.style.display = 'inline-flex';
            mainContent.classList.add('with-continue');
            isReadingMode = true;

            try {
                const resp = await fetch('/story/from_youtube', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url, level: level || 'A2' })
                });
                const data = await resp.json();
                if (!resp.ok) throw new Error(data.detail || 'Failed to load YouTube subtitles');

                story = data.story;
                currentDeck = data.story_id || 'yt_' + Date.now();
                characters = story.characters || [];

                vocabulary = {};
                if (story.vocabulary && Object.keys(story.vocabulary).length > 0) {
                    Object.entries(story.vocabulary).forEach(([de, en]) => addToVocabulary(de, en));
                } else if (story.segments) {
                    story.segments.forEach(seg => {
                        (seg.highlight_pairs || []).forEach(pair => addToVocabulary(pair.de, pair.en));
                    });
                }

                if (!story.segments || story.segments.length === 0) throw new Error('No subtitles found');

                rebuildSentenceUnits();
                if (!sentenceUnits.length) throw new Error('No content to display');

                currentSegmentIndex = 0;
                showStory();
                ensureAudioPrefetchAround(0);

                // Refresh story list in background
                fetch('/stories/list').then(r => r.json()).then(d => { allStories = d.stories || []; }).catch(() => { });

            } catch (error) {
                console.error('YouTube load failed:', error);
                loadingState.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state__emoji">😕</div>
                        <h3 class="empty-state__title">Couldn't load subtitles</h3>
                        <p class="empty-state__text">${error.message}</p>
                        <button class="continue-btn" onclick="openCreateModal('yt')">Try Again</button>
                        <button class="btn-secondary" onclick="loadStoryList()">Back to Stories</button>
                    </div>
                `;
            }
        }

        async function prefetchAudioFrom(startIndex) {
            if (!sentenceUnits || !sentenceUnits.length) return;
            const totalUnits = sentenceUnits.length;
            if (startIndex >= totalUnits) return;

            const end = Math.min(startIndex + AUDIO_PREFETCH_BATCH, totalUnits);
            const texts = new Set();
            for (let i = startIndex; i < end; i++) {
                const unit = sentenceUnits[i];
                const text = (unit.text_de || '').trim();
                if (text && !audioCache.has(text)) {
                    texts.add(text);
                }
            }

            const promises = Array.from(texts).map(async (text) => {
                try {
                    const url = `/story/audio?deck=${encodeURIComponent(currentDeck)}&text=${encodeURIComponent(text)}`;
                    const resp = await fetch(url);
                    if (resp.ok) {
                        const blob = await resp.blob();
                        const objUrl = URL.createObjectURL(blob);
                        audioCache.set(text, objUrl);
                    }
                } catch (e) {
                    console.warn('Failed to prefetch audio:', text, e);
                }
            });

            await Promise.allSettled(promises);
            audioPrefetchEnd = end;
        }

        function ensureAudioPrefetchAround(index) {
            if (!sentenceUnits || !sentenceUnits.length) return;
            const total = sentenceUnits.length;
            if (total === 0) return;
            if (audioPrefetchEnd === 0) {
                prefetchAudioFrom(0);
                return;
            }
            if (index >= audioPrefetchEnd - 2 && audioPrefetchEnd < total) {
                prefetchAudioFrom(audioPrefetchEnd);
            }
        }

        function showStory() {
            loadingState.style.display = 'none';
            storyContent.style.display = 'block';
            completedState.style.display = 'none';
            continueContainer.style.display = 'block';

            storyTitle.textContent = story.title_de || 'Geschichte';
            storySubtitle.textContent = story.title_en || 'Story';

            const level = story.level || story.Level || story.cefr_level || null;
            if (level) {
                storyLevelBadge.textContent = level;
                storyLevelBadge.style.display = 'inline-flex';
            } else {
                storyLevelBadge.style.display = 'none';
            }

            segmentsContainer.innerHTML = '';
            renderedSegmentCount = 0;
            continueBtn.textContent = 'Continue';
            continueBtn.disabled = true;
            if (sentenceUnits.length > 0) {
                showSegmentAt(0);
            }
        }

        function showSegmentAt(index) {
            if (!sentenceUnits || index < 0 || index >= sentenceUnits.length) return;
            if (!Number.isInteger(renderedSegmentCount) || renderedSegmentCount < 0) {
                renderedSegmentCount = 0;
            }
            while (renderedSegmentCount <= index) {
                const shouldAutoPlay = renderedSegmentCount === index;
                renderSegment(renderedSegmentCount, shouldAutoPlay);
                renderedSegmentCount += 1;
            }
            currentSegmentIndex = index;
            updateProgress();
            ensureAudioPrefetchAround(index);
            const target = segmentsContainer.querySelector(`.story-segment[data-index="${index}"]`);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        function renderSegment(index, shouldAutoPlay) {
            const unit = sentenceUnits[index];
            if (!unit) return;
            const segment = story && story.segments ? (story.segments[unit.segmentIndex] || {}) : {};

            const div = document.createElement('div');
            div.className = `story-segment story-segment-enter segment-${unit.type || segment.type || 'narration'}`;
            div.dataset.index = index;

            let html = '';
            const speakerName = unit.speaker || segment.speaker;
            const isDialogueWithSpeaker = (unit.type || segment.type) === 'dialogue' && speakerName && speakerName !== 'narrator';

            if (isDialogueWithSpeaker) {
                html += `
                    <div class="segment-speaker">
                        <div class="speaker-avatar ${getAvatarClass(speakerName)}">${getInitial(speakerName)}</div>
                        <span class="speaker-name">${speakerName}</span>
                        <button class="audio-btn" data-text="${(unit.text_de || '').replace(/"/g, '&quot;')}">
                            <span class="material-symbols-outlined">volume_up</span>
                        </button>
                    </div>
                `;
            }

            let colorMapDe = segment._colorMapDe;
            let colorMapEn = segment._colorMapEn;

            if (!colorMapDe || !colorMapEn) {
                const highlightPairs = segment.highlight_pairs || [];
                colorMapDe = {};
                colorMapEn = {};

                if (highlightPairs.length > 0) {
                    const textDeLower = (segment.text_de || '').toLowerCase();
                    const textEnLower = (segment.text_en || '').toLowerCase();

                    highlightPairs.forEach(pair => {
                        const deWord = (pair.de || '').toLowerCase().trim();
                        const enWord = (pair.en || '').toLowerCase().trim();

                        const deExists = deWord && textDeLower.includes(deWord);
                        const enExists = enWord && textEnLower.includes(enWord);

                        if (deExists && enExists) {
                            colorMapDe[deWord] = pair.color;
                            colorMapEn[enWord] = pair.color;
                        }
                    });
                } else if (segment.highlight_words && segment.highlight_words.length > 0) {
                    segment.highlight_words.forEach((word, idx) => {
                        colorMapDe[word.toLowerCase()] = idx % 16;
                    });
                }

                segment._colorMapDe = colorMapDe;
                segment._colorMapEn = colorMapEn;
            }

            const cachedDe = unit._highlightedTextDe;
            const cachedEn = unit._highlightedTextEn;
            const baseTextDe = unit.text_de || '';
            const baseTextEn = unit.text_en || '';
            const textDe = cachedDe || (unit._highlightedTextDe = highlightWordsInText(baseTextDe, colorMapDe));
            const textEn = cachedEn || (unit._highlightedTextEn = highlightWordsInText(baseTextEn, colorMapEn));

            if (isDialogueWithSpeaker) {
                html += `
                    <div class="segment-content">
                        <div>
                            <p class="segment-text">${textDe}</p>
                            <p class="segment-translation visible">${textEn}</p>
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="segment-content">
                        <button class="audio-btn" data-text="${(unit.text_de || '').replace(/"/g, '&quot;')}">
                            <span class="material-symbols-outlined">volume_up</span>
                        </button>
                        <div>
                            <p class="segment-text">${textDe}</p>
                            <p class="segment-translation visible">${textEn}</p>
                        </div>
                    </div>
                `;
            }

            div.innerHTML = html;
            segmentsContainer.appendChild(div);

            requestAnimationFrame(() => {
                div.classList.remove('story-segment-enter');
            });

            div.querySelector('.audio-btn').addEventListener('click', (e) => {
                const text = e.currentTarget.dataset.text;
                playAudio(text);
            });

            if (shouldAutoPlay) {
                setTimeout(() => playAudio(unit.text_de), 300);
            }

            continueBtn.textContent = 'Continue';
            continueBtn.disabled = false;
        }

        // Function to highlight words/phrases using AI-provided color map
        function highlightWordsInText(text, colorMap) {
            if (!text || Object.keys(colorMap).length === 0) return text;

            let result = text;

            // Sort by phrase length (longer first) to match "zu viel" before "zu"
            const sortedPhrases = Object.keys(colorMap).sort((a, b) => b.length - a.length);

            // Replace each phrase with a placeholder, then restore with highlighting
            const placeholders = [];

            sortedPhrases.forEach((phrase, idx) => {
                const colorIndex = colorMap[phrase];
                // Create regex that matches the phrase case-insensitively, with word boundaries
                const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(^|[\\s.,!?;:'"„"»«()])${escaped}([\\s.,!?;:'"„"»«()]|$)`, 'gi');

                result = result.replace(regex, (match, before, after) => {
                    // Find the actual matched phrase (preserving original case)
                    const actualPhrase = match.substring(before.length, match.length - after.length);
                    const placeholder = `__HIGHLIGHT_${idx}__`;
                    placeholders.push({
                        placeholder,
                        html: `<span class="word-highlight highlight-${colorIndex} tappable-word" data-word="${actualPhrase}">${actualPhrase}</span>`
                    });
                    return before + placeholder + after;
                });
            });

            // Make remaining words tappable
            result = result.split(/(\s+|__HIGHLIGHT_\d+__)/).map(part => {
                if (!part.trim() || part.startsWith('__HIGHLIGHT_')) return part;

                // Skip if it's punctuation only
                const cleanPart = part.replace(/[.,!?;:'"„"»«()]/g, '');
                if (!cleanPart) return part;

                // Extract punctuation
                const match = part.match(/^([.,!?;:'"„"»«()]*)(.+?)([.,!?;:'"„"»«()]*)$/);
                const prefix = match ? match[1] : '';
                const core = match ? match[2] : part;
                const suffix = match ? match[3] : '';

                return `${prefix}<span class="tappable-word" data-word="${core}">${core}</span>${suffix}`;
            }).join('');

            // Restore placeholders with actual HTML
            placeholders.forEach(({ placeholder, html }) => {
                result = result.replace(placeholder, html);
            });

            return result;
        }

        function updateProgress() {
            if (!sentenceUnits || !sentenceUnits.length) return;
            const total = sentenceUnits.length;
            const current = currentSegmentIndex + 1;
            const progress = (current / total) * 100;
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `${current}/${total}`;
        }

        function showCompleted() {
            storyContent.style.display = 'none';
            continueContainer.style.display = 'none';
            completedState.style.display = 'block';
            progressBar.style.width = '100%';
        }

        if (srtFileInput) {
            srtFileInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (file) {
                    loadStoryFromSrt(file);
                }
            });
        }

        function updateAudioToggleUI() {
            if (!audioToggleBtn || !audioToggleIcon) return;
            if (isAudioEnabled) {
                audioToggleBtn.classList.remove('audio-off');
                audioToggleIcon.textContent = 'volume_up';
            } else {
                audioToggleBtn.classList.add('audio-off');
                audioToggleIcon.textContent = 'volume_off';
            }
        }

        if (refreshTranslationsBtn) {
            refreshTranslationsBtn.addEventListener('click', refreshTranslations);
        }

        if (audioToggleBtn) {
            audioToggleBtn.addEventListener('click', () => {
                isAudioEnabled = !isAudioEnabled;
                if (!isAudioEnabled) {
                    audioPlayer.pause();
                }
                updateAudioToggleUI();
            });
            updateAudioToggleUI();
        }


        async function playAudio(text) {
            if (!text || !isAudioEnabled) return;
            try {
                audioPlayer.pause();
                audioPlayer.currentTime = 0;

                // Use prefetched audio if available, otherwise fetch from server
                if (audioCache.has(text)) {
                    audioPlayer.src = audioCache.get(text);
                } else {
                    audioPlayer.src = `/story/audio?deck=${encodeURIComponent(currentDeck)}&text=${encodeURIComponent(text)}`;
                }

                await audioPlayer.play();
            } catch (error) {
                console.warn('Audio failed:', error);
            }
        }

        // Create story modal
        function openCreateModal(tab) {
            storyTopicInput.value = '';
            if (storyTextInput) storyTextInput.value = '';
            storyLevelSelect.value = 'A2';
            createModal.classList.add('visible');
            switchCreateTab(tab || 'ai');
            if (!tab || tab === 'ai') {
                setTimeout(() => storyTopicInput.focus(), 100);
            } else if (tab === 'yt') {
                setTimeout(() => { const el = document.getElementById('ytUrlInput'); if (el) el.focus(); }, 100);
            }
        }

        function closeCreateModal() {
            createModal.classList.remove('visible');
        }

        async function createStoryWithTopic(topic) {
            closeCreateModal();
            const level = storyLevelSelect.value || 'A2';
            await loadStoryWithTopic(topic, level);
        }

        async function createStoryFromText(text) {
            closeCreateModal();
            const level = (document.getElementById('textLevelSelect') || storyLevelSelect).value || 'A2';
            await loadStoryFromText(text, level);
        }

        async function createRandomStory() {
            const randomTopics = [
                'a trip to the airport',
                'ordering food at a restaurant',
                'shopping at a market',
                'meeting a new friend',
                'a day at school',
                'visiting a doctor',
                'a birthday party',
                'traveling by train',
                'a picnic in the park',
                'cooking dinner at home',
                'going to the cinema',
                'a job interview',
                'vacation at the beach',
                'learning to drive',
                'moving to a new apartment'
            ];
            const randomTopic = randomTopics[Math.floor(Math.random() * randomTopics.length)];
            const level = storyLevelSelect.value || 'A2';
            closeCreateModal();
            await loadStoryWithTopic(randomTopic, level);
        }

        segmentsContainer.addEventListener('click', (e) => {
            const tappable = e.target.closest('.tappable-word');
            if (!tappable) return;

            e.stopPropagation();
            const word = tappable.dataset.word;
            const cleanWord = word.toLowerCase().replace(/[.,!?;:'"„"»«()]/g, '');

            const segmentEl = tappable.closest('.story-segment');
            let segment = null;
            if (segmentEl && sentenceUnits && Array.isArray(sentenceUnits) && story && Array.isArray(story.segments)) {
                const idx = parseInt(segmentEl.dataset.index, 10);
                const unit = sentenceUnits[idx];
                if (unit && typeof unit.segmentIndex === 'number') {
                    segment = story.segments[unit.segmentIndex];
                }
            }

            let meaning = '';

            // 1) Prefer highlight_pairs via color mapping
            if (segment && Array.isArray(segment.highlight_pairs)) {
                const classes = (tappable.className || '').split(/\s+/);
                const colorClass = classes.find(c => c.startsWith('highlight-'));
                if (colorClass) {
                    const colorIndex = parseInt(colorClass.replace('highlight-', ''), 10);
                    const pair = segment.highlight_pairs.find(p => {
                        if (!p) return false;
                        const c = typeof p.color === 'number' ? p.color : parseInt(p.color, 10);
                        return c === colorIndex;
                    });
                    if (pair && pair.en) {
                        meaning = pair.en;
                    }
                }
            }

            // 1.5) Check full_vocabulary if available (generated by AI)
            if (!meaning && segment && segment.full_vocabulary) {
                // Try various forms: exact, cleaned (preserve case), cleaned (lowercase)
                const rawClean = word.replace(/[.,!?;:'"„"»«()]/g, '');
                meaning = segment.full_vocabulary[word] ||
                    segment.full_vocabulary[rawClean] ||
                    segment.full_vocabulary[cleanWord] ||
                    '';

                // If still not found, try case-insensitive lookup in full_vocabulary keys
                if (!meaning) {
                    const target = cleanWord;
                    const foundKey = Object.keys(segment.full_vocabulary).find(k =>
                        k.toLowerCase().replace(/[.,!?;:'"„"»«()]/g, '') === target
                    );
                    if (foundKey) {
                        meaning = segment.full_vocabulary[foundKey];
                    }
                }
            }

            // 2) Fall back to global vocabulary and common words
            if (!meaning) {
                meaning = vocabulary[cleanWord] || vocabulary[word.toLowerCase()] || commonWords[cleanWord] || '';
            }

            // 3) Last resort: show a short placeholder, not the whole sentence
            if (!meaning) {
                meaning = 'No translation available';
            }

            showTooltip(tappable, meaning);
        });

        // Hide tooltip when clicking anywhere else
        document.addEventListener('click', (e) => {
            // Don't hide if clicking on a tappable word (handled above)
            if (!e.target.closest('.tappable-word') && !e.target.closest('.tooltip')) {
                hideTooltip();
            }
        });

        function showTooltip(element, text) {
            const rect = element.getBoundingClientRect();
            tooltip.textContent = text;
            tooltip.style.left = `${rect.left + rect.width / 2}px`;
            tooltip.style.top = `${rect.top - 8}px`;
            tooltip.style.transform = 'translate(-50%, -100%)';
            tooltip.classList.add('visible');
            // No timeout - stays visible until user clicks elsewhere
        }

        function hideTooltip() {
            tooltip.classList.remove('visible');
        }

        // Refresh translations for current story
        async function refreshTranslations() {
            if (!currentDeck) return;
            const btn = refreshTranslationsBtn;
            if (btn) {
                btn.disabled = true;
                btn.querySelector('.material-symbols-outlined').style.animation = 'spin 1s linear infinite';
            }
            try {
                const level = (story && story.level) || 'A2';
                const resp = await fetch('/story/retranslate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ story_id: currentDeck, level })
                });
                const data = await resp.json();
                if (!resp.ok) throw new Error(data.detail || 'Refresh failed');

                // Swap in refreshed story and restart from current position
                const savedIndex = currentSegmentIndex;
                story = data.story;
                characters = story.characters || [];

                vocabulary = {};
                if (story.vocabulary && Object.keys(story.vocabulary).length > 0) {
                    Object.entries(story.vocabulary).forEach(([de, en]) => addToVocabulary(de, en));
                } else if (story.segments) {
                    story.segments.forEach(seg => (seg.highlight_pairs || []).forEach(p => addToVocabulary(p.de, p.en)));
                }

                // Clear old renders, rebuild, restart from same position
                segmentsContainer.innerHTML = '';
                renderedSegmentCount = 0;
                audioCache.forEach(u => { if (u.startsWith('blob:')) URL.revokeObjectURL(u); });
                audioCache.clear();
                audioPrefetchEnd = 0;

                rebuildSentenceUnits();
                const newIndex = Math.min(savedIndex, sentenceUnits.length - 1);
                showSegmentAt(Math.max(0, newIndex));
            } catch (err) {
                console.error('Refresh failed:', err);
                alert('Refresh failed: ' + err.message);
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.querySelector('.material-symbols-outlined').style.animation = '';
                }
            }
        }

        // Events
        backBtn.addEventListener('click', () => {
            if (isReadingMode) {
                loadStoryList();
                history.replaceState(null, '', '/story');
            } else {
                history.back() || (location.href = '/');
            }
        });

        createStoryBtn.addEventListener('click', openCreateModal);
        createModalBackdrop.addEventListener('click', closeCreateModal);
        createModalClose.addEventListener('click', closeCreateModal);
        createStorySubmit.addEventListener('click', () => {
            const topic = storyTopicInput.value.trim();
            if (topic) {
                createStoryWithTopic(topic);
            } else {
                storyTopicInput.focus();
                storyTopicInput.style.borderColor = 'var(--danger)';
                setTimeout(() => storyTopicInput.style.borderColor = '', 1500);
            }
        });
        randomStoryBtn.addEventListener('click', createRandomStory);
        storyTopicInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const topic = storyTopicInput.value.trim();
                if (topic) createStoryWithTopic(topic);
            }
        });

        // Text tab submit
        const submitTextStoryBtn = document.getElementById('submitTextStoryBtn');
        if (submitTextStoryBtn) {
            submitTextStoryBtn.addEventListener('click', () => {
                const text = storyTextInput ? storyTextInput.value.trim() : '';
                if (text) {
                    createStoryFromText(text);
                } else {
                    storyTextInput.focus();
                    storyTextInput.style.borderColor = 'var(--danger)';
                    setTimeout(() => storyTextInput.style.borderColor = '', 1500);
                }
            });
        }

        // YouTube tab submit
        const submitYTBtn = document.getElementById('submitYTBtn');
        if (submitYTBtn) {
            submitYTBtn.addEventListener('click', () => {
                const url = (document.getElementById('ytUrlInput') || {}).value?.trim();
                const level = (document.getElementById('ytLevelSelect') || {}).value || 'A2';
                const ytError = document.getElementById('ytError');
                if (!url) {
                    if (ytError) { ytError.textContent = 'Please enter a YouTube URL.'; ytError.style.display = 'block'; }
                    return;
                }
                loadStoryFromYoutube(url, level);
            });
        }

        // YouTube button in list header opens modal on YouTube tab
        const youtubeLinkBtn = document.getElementById('youtubeLinkBtn');
        if (youtubeLinkBtn) {
            youtubeLinkBtn.addEventListener('click', () => openCreateModal('yt'));
        }

        // SRT file input
        if (srtFileInput) {
            srtFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) loadStoryFromSrt(file);
            });
        }

        // Action popup events
        actionPopupBackdrop.addEventListener('click', closeActionPopup);
        cancelActionBtn.addEventListener('click', closeActionPopup);
        deleteStoryBtn.addEventListener('click', deleteSelectedStory);

        continueBtn.addEventListener('click', () => {
            if (!sentenceUnits || !sentenceUnits.length) return;
            const next = currentSegmentIndex + 1;
            if (next >= sentenceUnits.length) {
                showCompleted();
            } else {
                showSegmentAt(next);
            }
        });

        restartBtn.addEventListener('click', () => {
            currentSegmentIndex = 0;
            renderedSegmentCount = 0;
            segmentsContainer.innerHTML = '';
            showSegmentAt(0);
        });

        backToListBtn.addEventListener('click', () => {
            loadStoryList();
            history.replaceState(null, '', '/story');
        });

        // Start
        init();