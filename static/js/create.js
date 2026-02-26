const cancelBtn = document.getElementById('cancelBtn');
        const createBtn = document.getElementById('createBtn');
        const nameInput = document.getElementById('deck-name');
        const dataInput = document.getElementById('deck-data');
        const globalLoader = document.getElementById('globalLoader');

        function hideLoader() {
            if (globalLoader) globalLoader.classList.remove('is-active');
        }
        document.addEventListener('DOMContentLoaded', hideLoader);
        const backBtn = document.getElementById('backBtn');
        backBtn.addEventListener('click', () => {
            window.location.href = '/';
        });

        function sanitizeDeckName(name) {
            return (name || '').trim().replace(/[^a-zA-Z0-9_\-]+/g, '_').substring(0, 50);
        }
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                window.location.href = '/';
            });
        }
        createBtn.addEventListener('click', async () => {
            const rawName = nameInput.value;
            const rawData = dataInput.value;
            const name = sanitizeDeckName(rawName);
            if (!name) {
                alert('Please enter a deck name.');
                return;
            }
            if (!rawData.trim()) {
                alert('Please paste deck data.');
                return;
            }
            createBtn.disabled = true;
            createBtn.textContent = 'Saving...';
            try {
                const resp = await fetch('/deck/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name,
                        data: rawData
                    })
                });
                const out = await resp.json().catch(() => ({
                    ok: false
                }));
                if (!resp.ok || !out.ok) throw new Error(out.detail || 'Failed to create deck');
                createBtn.textContent = 'Saved';
                setTimeout(() => {
                    window.location.href = '/'
                }, 600);
            } catch (e) {
                alert(String(e.message || e));
                createBtn.disabled = false;
                createBtn.textContent = 'Create';
            }
        });