/*
        // Previous contact form handler retained for reference
        const WORKER_URL = 'contact.php';

        function handleContactForm() {
            const form = document.getElementById('contact-form')
            const successMsg = document.getElementById('form-success')
            const submitBtn = form ? form.querySelector('button[type="submit"]') : null

            if (!form) return

            form.addEventListener('submit', async function (e) {
                e.preventDefault()

                // Disable button while sending
                if (submitBtn) {
                    submitBtn.disabled = true
                    submitBtn.innerHTML = '<span>SENDING...</span> <i class="fa-solid fa-spinner fa-spin"></i>'
                }

                const payload = {
                    name: document.getElementById('name').value.trim(),
                    phone: document.getElementById('phone').value.trim(),
                    email: document.getElementById('email').value.trim(),
                    message: document.getElementById('message').value.trim()
                }

                try {
                    const res = await fetch(WORKER_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    })

                    if (!res.ok) throw new Error('Server error')

                    // Show success
                    form.classList.add('hidden')
                    successMsg.classList.remove('hidden')

                    // Reset form after 4.5 seconds
                    setTimeout(() => {
                        form.reset()
                        form.classList.remove('hidden')
                        successMsg.classList.add('hidden')
                        if (submitBtn) {
                            submitBtn.disabled = false
                            submitBtn.innerHTML = '<span>SEND MESSAGE</span> <i class="fa-solid fa-paper-plane"></i>'
                        }
                    }, 4500)

                } catch (err) {
                    console.error('Form submission error:', err)
                    alert('Sorry, something went wrong. Please try again or contact us directly.')
                    if (submitBtn) {
                        submitBtn.disabled = false
                        submitBtn.innerHTML = '<span>SEND MESSAGE</span> <i class="fa-solid fa-paper-plane"></i>'
                    }
                }
            })
        }
        */

(() => {
    const hero = document.querySelector('header.hero-bg');
    if (!hero) return;

    window.addEventListener('scroll', () => {
        const scrolled = window.scrollY;
        if (scrolled < window.innerHeight * 1.5) {
            hero.style.backgroundPositionY = `calc(center + ${scrolled * 0.25}px)`;
        }
    }, { passive: true });
})();
