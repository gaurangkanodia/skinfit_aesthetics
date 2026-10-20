(function () {
    const loader = document.currentScript;
    if (!loader) return;

    const baseUrl = new URL('./', loader.src);
    fetch(new URL('chatbot-config.json', baseUrl), { cache: 'no-store', credentials: 'same-origin' })
        .then(response => {
            if (!response.ok) throw new Error('Chat configuration is unavailable.');
            return response.json();
        })
        .then(config => {
            if (!config || config.enabled !== true) return;
            const stylesheet = document.createElement('link');
            stylesheet.rel = 'stylesheet';
            stylesheet.href = new URL('chatbot.css', baseUrl).href;
            document.head.appendChild(stylesheet);

            const widget = document.createElement('script');
            widget.src = new URL('chatbot.js', baseUrl).href;
            widget.dataset.apiBase = new URL(config.apiBase || 'api', window.location.href).href;
            widget.defer = true;
            document.body.appendChild(widget);
        })
        .catch(() => {
            console.warn('Chatbot configuration could not be loaded; the chatbot remains disabled.');
        });
})();
