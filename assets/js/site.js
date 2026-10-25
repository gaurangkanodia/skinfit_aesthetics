(() => {
    const mobileMenu = document.getElementById('mobile-menu');
    const menuToggle = document.querySelector('[data-menu-toggle]');
    const menuIcon = document.getElementById('hamburger-icon');
    let revealObserver;

    function setMobileMenuOpen(isOpen) {
        if (!mobileMenu || !menuIcon) return;
        mobileMenu.classList.toggle('hidden', !isOpen);
        menuIcon.classList.toggle('fa-bars', !isOpen);
        menuIcon.classList.toggle('fa-xmark', isOpen);
        if (menuToggle) menuToggle.setAttribute('aria-expanded', String(isOpen));
    }

    menuToggle?.addEventListener('click', () => {
        setMobileMenuOpen(mobileMenu.classList.contains('hidden'));
    });

    mobileMenu?.addEventListener('click', event => {
        if (event.target instanceof Element && event.target.closest('[data-menu-close]')) {
            setMobileMenuOpen(false);
        }
    });

    window.observeReveals = (container = document) => {
        const revealElements = container.querySelectorAll('.reveal:not(.visible)');
        if ('IntersectionObserver' in window) {
            revealObserver ??= new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('visible');
                        revealObserver.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
            revealElements.forEach(element => revealObserver.observe(element));
            return;
        }
        revealElements.forEach(element => element.classList.add('visible'));
    };

    window.observeReveals();
})();
