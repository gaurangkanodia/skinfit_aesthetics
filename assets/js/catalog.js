(() => {
    const { gridId, cardDescription, items } = window.catalogConfig;
    const grid = document.getElementById(gridId);
    const modal = document.getElementById('detail-modal');

    function renderCards() {
        grid.innerHTML = Object.entries(items).map(([key, item]) => `
            <div id="card-${key}"
                 class="reveal catalog-card bg-white rounded-3xl overflow-hidden cursor-pointer border border-gray-100 hover:border-brand-soft/40"
                 data-modal-key="${key}" role="button" tabindex="0">
                <div class="overflow-hidden h-52">
                    <img src="${item.image}" alt="${item.title}" class="w-full h-52 object-cover">
                </div>
                <div class="p-6">
                    <h3 class="font-semibold text-lg leading-snug">${item.title}</h3>
                    <p class="text-sm text-gray-400 mt-2">${cardDescription}</p>
                    <div class="mt-5 text-brand-dark text-sm font-semibold flex items-center gap-x-1">
                        Learn more
                        <span class="card-arrow ml-auto text-xl leading-none">→</span>
                    </div>
                </div>
            </div>
        `).join('');

        window.observeReveals(grid);
    }

    function openModal(key) {
        const item = items[key];
        if (!item) return;

        document.getElementById('modal-image').src = item.image;
        document.getElementById('modal-image').alt = item.title;
        document.getElementById('modal-title').textContent = item.title;
        document.getElementById('modal-desc').innerHTML = item.desc;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.body.classList.add('modal-open');
        history.replaceState(null, '', `${window.location.pathname}#${key}`);
    }

    function closeModal() {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.body.classList.remove('modal-open');
    }

    grid.addEventListener('click', event => {
        if (!(event.target instanceof Element)) return;
        const card = event.target.closest('[data-modal-key]');
        if (card) openModal(card.dataset.modalKey);
    });

    grid.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (!(event.target instanceof Element)) return;
        const card = event.target.closest('[data-modal-key]');
        if (!card) return;
        event.preventDefault();
        openModal(card.dataset.modalKey);
    });

    modal.addEventListener('click', event => {
        if (event.target === modal || (event.target instanceof Element && event.target.closest('[data-modal-close]'))) {
            closeModal();
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
    });

    renderCards();

    const initialKey = window.location.hash.slice(1);
    if (items[initialKey]) openModal(initialKey);
})();
