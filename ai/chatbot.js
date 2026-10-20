(function () {
    const script = document.currentScript;
    if (!script || document.getElementById('sf-chat-widget')) return;

    const apiBase = script.dataset.apiBase || new URL('api', script.src).href;
    const storageKey = 'skinfit-chat-messages-v1';
    const greetingKey = 'skinfit-chat-greeting-dismissed-v1';
    const disclaimer = 'AI can make mistakes. This is just to help you navigate. Always take the necessary steps after proper consultation from one of our highly qualified specialists.';
    const welcome = "Hi, I'm Circuit. I can share information from Skinfit's published clinic pages, help with basic questions covered by that information, or prepare an appointment inquiry. I can't diagnose or recommend personal treatment.";
    let storageWarning = false;
    let messages = readMessages();
    let preview = null;
    let busy = false;

    function readMessages() {
        try {
            const saved = sessionStorage.getItem(storageKey);
            if (!saved) return [{ role: 'assistant', content: welcome }];
            const parsed = JSON.parse(saved);
            if (!Array.isArray(parsed) || parsed.length > 40) throw new Error('Invalid stored chat.');
            const valid = parsed.filter(item =>
                item && (item.role === 'user' || item.role === 'assistant')
                && typeof item.content === 'string' && item.content.length <= 2000
            );
            return valid.length ? valid : [{ role: 'assistant', content: welcome }];
        } catch (error) {
            storageWarning = true;
            return [{ role: 'assistant', content: welcome }];
        }
    }

    const root = document.createElement('div');
    root.id = 'sf-chat-widget';
    root.className = 'sf-chat-widget';
    root.innerHTML = `
        <div class="sf-chat-greeting" id="sf-chat-greeting" role="status" ${wasGreetingDismissed() ? 'hidden' : ''}>
            <p><strong>Circuit here</strong>Ask me about the clinic or skin concerns.</p>
            <button class="sf-chat-greeting-dismiss" type="button" aria-label="Dismiss greeting">×</button>
        </div>
        <button class="sf-chat-launcher" id="sf-chat-launcher" type="button" aria-controls="sf-chat-panel" aria-expanded="false" aria-label="Open the Skinfit chat">
            ${circuitIcon()}
            <span class="sf-chat-launcher-text">Chat with Circuit</span>
        </button>
        <section class="sf-chat-panel" id="sf-chat-panel" role="dialog" aria-label="Skinfit Aesthetics chat" aria-modal="false" hidden>
            <header class="sf-chat-header">
                ${circuitIcon()}
                <div class="sf-chat-title"><strong>Chat with Circuit</strong><span>Skinfit Aesthetics assistant</span></div>
                <div class="sf-chat-header-actions">
                    <button class="sf-chat-icon-button" id="sf-chat-new" type="button" aria-label="Start a new conversation" title="New conversation">↻</button>
                    <button class="sf-chat-icon-button" id="sf-chat-collapse" type="button" aria-label="Collapse chat" title="Collapse">−</button>
                    <button class="sf-chat-icon-button" id="sf-chat-close" type="button" aria-label="Close chat" title="Close">×</button>
                </div>
            </header>
            <main class="sf-chat-main" id="sf-chat-main">
                <div class="sf-chat-messages" id="sf-chat-messages" role="log" aria-live="polite" aria-relevant="additions text"></div>
                <p class="sf-chat-typing" id="sf-chat-typing" aria-live="polite"></p>
                <div class="sf-chat-error" id="sf-chat-error" role="alert" hidden></div>
                <section class="sf-chat-form" id="sf-chat-appointment-form" aria-labelledby="sf-chat-form-title" hidden>
                    <h3 id="sf-chat-form-title">Appointment inquiry</h3>
                    <p>Enter your name and one contact method. A concern is optional. Avoid sharing medical history. Chat messages and your optional note are sent to Google to prepare responses and the summary; contact details are emailed only after confirmation.</p>
                    <form class="sf-chat-contact-form" id="sf-chat-contact-form" novalidate>
                        <div><label for="sf-chat-name">Name</label><input class="sf-chat-field" id="sf-chat-name" name="name" autocomplete="name" maxlength="100" required></div>
                        <div><label for="sf-chat-email">Email (optional)</label><input class="sf-chat-field" id="sf-chat-email" name="email" type="email" autocomplete="email" maxlength="254"></div>
                        <div><label for="sf-chat-phone">Phone (optional)</label><input class="sf-chat-field" id="sf-chat-phone" name="phone" type="tel" autocomplete="tel" maxlength="40"></div>
                        <div><label for="sf-chat-note">Concern or treatment of interest (optional)</label><textarea class="sf-chat-field" id="sf-chat-note" name="note" maxlength="500"></textarea></div>
                        <div class="sf-chat-form-actions">
                            <button class="sf-chat-primary" id="sf-chat-review" type="submit">Review inquiry</button>
                            <button class="sf-chat-secondary" id="sf-chat-cancel-form" type="button">Cancel</button>
                        </div>
                    </form>
                </section>
                <section class="sf-chat-preview" id="sf-chat-preview" aria-labelledby="sf-chat-preview-title" hidden>
                    <h3 id="sf-chat-preview-title">Review before sending</h3>
                    <p>Your details and transcript are only emailed after you confirm below. This is an inquiry, not a booked appointment.</p>
                    <div><label for="sf-chat-recipient">Recipient</label><input class="sf-chat-preview-field" id="sf-chat-recipient" readonly></div>
                    <div><label for="sf-chat-subject">Subject</label><textarea class="sf-chat-preview-field" id="sf-chat-subject" rows="2" readonly></textarea></div>
                    <div><label for="sf-chat-message-preview">Message</label><textarea class="sf-chat-preview-field" id="sf-chat-message-preview" rows="8" readonly></textarea></div>
                    <details open>
                        <summary>Attachment: <span id="sf-chat-attachment-name"></span></summary>
                        <pre class="sf-chat-transcript" id="sf-chat-transcript"></pre>
                    </details>
                    <label class="sf-chat-confirm" for="sf-chat-confirm-send">
                        <input id="sf-chat-confirm-send" type="checkbox">
                        <span>I have reviewed this inquiry and confirm that the clinic may receive these details and the transcript.</span>
                    </label>
                    <div class="sf-chat-preview-actions">
                        <button class="sf-chat-primary" id="sf-chat-send-inquiry" type="button" disabled>Send inquiry</button>
                        <button class="sf-chat-secondary" id="sf-chat-edit-inquiry" type="button">Edit inquiry</button>
                    </div>
                </section>
            </main>
            <footer class="sf-chat-footer">
                <div class="sf-chat-footer-actions">
                    <button class="sf-chat-text-button" id="sf-chat-appointment" type="button">Ask about an appointment</button>
                </div>
                <form class="sf-chat-composer" id="sf-chat-message-form">
                    <label class="sf-chat-visually-hidden" for="sf-chat-input">Your message</label>
                    <textarea class="sf-chat-input" id="sf-chat-input" rows="1" maxlength="1500" placeholder="Ask about the clinic or a skin concern"></textarea>
                    <button class="sf-chat-send" id="sf-chat-send" type="submit" aria-label="Send message" title="Send message">➤</button>
                </form>
                <div class="sf-chat-disclaimer">${disclaimer}</div>
            </footer>
        </section>`;
    document.body.appendChild(root);

    const launcher = root.querySelector('#sf-chat-launcher');
    const panel = root.querySelector('#sf-chat-panel');
    const greeting = root.querySelector('#sf-chat-greeting');
    const messageList = root.querySelector('#sf-chat-messages');
    const messageForm = root.querySelector('#sf-chat-message-form');
    const input = root.querySelector('#sf-chat-input');
    const sendButton = root.querySelector('#sf-chat-send');
    const typing = root.querySelector('#sf-chat-typing');
    const errorBox = root.querySelector('#sf-chat-error');
    const appointmentFormSection = root.querySelector('#sf-chat-appointment-form');
    const contactForm = root.querySelector('#sf-chat-contact-form');
    const previewSection = root.querySelector('#sf-chat-preview');
    const appointmentButton = root.querySelector('#sf-chat-appointment');
    const footerActions = root.querySelector('.sf-chat-footer-actions');
    const collapseButton = root.querySelector('#sf-chat-collapse');
    const confirmation = root.querySelector('#sf-chat-confirm-send');
    const sendInquiryButton = root.querySelector('#sf-chat-send-inquiry');

    function circuitIcon() {
        return `<span class="sf-circuit-icon" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none">
            <path d="M10 5.5h12a4.5 4.5 0 0 1 4.5 4.5v10a4.5 4.5 0 0 1-4.5 4.5H10A4.5 4.5 0 0 1 5.5 20V10A4.5 4.5 0 0 1 10 5.5Z" stroke="currentColor" stroke-width="2"/>
            <circle class="sf-eye" cx="12" cy="14" r="1.5" fill="currentColor"/><circle class="sf-eye" cx="20" cy="14" r="1.5" fill="currentColor"/>
            <path d="M12 19h8M2 12h3m22 0h3M12 25v3m8-3v3" stroke="currentColor" stroke-linecap="round" stroke-width="2"/>
        </svg></span>`;
    }

    function wasGreetingDismissed() {
        try {
            return sessionStorage.getItem(greetingKey) === 'true';
        } catch (error) {
            storageWarning = true;
            return false;
        }
    }

    function persistMessages() {
        try {
            sessionStorage.setItem(storageKey, JSON.stringify(messages));
        } catch (error) {
            storageWarning = true;
            showError('This browser does not allow session storage. Your conversation will remain available only while this page stays open.');
        }
    }

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
    }

    function clearError() {
        errorBox.textContent = '';
        errorBox.hidden = true;
    }

    function renderMessage(message) {
        const bubble = document.createElement('div');
        bubble.className = `sf-chat-message ${message.role === 'user' ? 'sf-chat-message-user' : 'sf-chat-message-assistant'}`;
        bubble.textContent = message.content;
        messageList.appendChild(bubble);
        root.querySelector('#sf-chat-main').scrollTop = root.querySelector('#sf-chat-main').scrollHeight;
    }

    function addMessage(role, content) {
        const message = { role, content };
        messages.push(message);
        if (messages.length > 40) messages = messages.slice(-40);
        renderMessage(message);
        persistMessages();
    }

    function showChatView() {
        appointmentFormSection.hidden = true;
        previewSection.hidden = true;
        appointmentButton.hidden = false;
        footerActions.hidden = false;
        messageForm.hidden = false;
        root.querySelector('#sf-chat-main').setAttribute('aria-label', 'Conversation');
    }

    function openChat() {
        panel.hidden = false;
        panel.classList.remove('sf-chat-collapsed');
        root.classList.add('sf-chat-open');
        collapseButton.setAttribute('aria-label', 'Collapse chat');
        collapseButton.title = 'Collapse';
        collapseButton.textContent = '−';
        launcher.setAttribute('aria-expanded', 'true');
        launcher.setAttribute('aria-label', 'Chat is open');
        greeting.hidden = true;
        root.querySelector('#sf-chat-main').setAttribute('aria-label', 'Conversation');
        input.focus();
    }

    function closeChat() {
        panel.hidden = true;
        panel.classList.remove('sf-chat-collapsed');
        root.classList.remove('sf-chat-open');
        launcher.setAttribute('aria-expanded', 'false');
        launcher.setAttribute('aria-label', 'Reopen the Skinfit chat');
        launcher.focus();
    }

    function collapseChat() {
        const collapsed = panel.classList.toggle('sf-chat-collapsed');
        collapseButton.setAttribute('aria-label', collapsed ? 'Expand chat' : 'Collapse chat');
        collapseButton.title = collapsed ? 'Expand' : 'Collapse';
        collapseButton.textContent = collapsed ? '□' : '−';
        if (collapsed) launcher.setAttribute('aria-label', 'Reopen the collapsed Skinfit chat');
        else input.focus();
    }

    async function request(action, payload) {
        const apiUrl = new URL(apiBase);
        apiUrl.searchParams.set('action', action);
        const response = await fetch(apiUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result || result.ok !== true) {
            throw new Error(result && typeof result.error === 'string' ? result.error : 'The request could not be completed. Please try again.');
        }
        return result;
    }

    async function sendMessage(event) {
        event.preventDefault();
        const message = input.value.trim();
        if (!message || busy || panel.classList.contains('sf-chat-collapsed')) return;

        clearError();
        input.value = '';
        addMessage('user', message);
        busy = true;
        sendButton.disabled = true;
        typing.textContent = 'Thinking...';
        try {
            const result = await request('chat', {
                message,
                history: messages.slice(0, -1).slice(-10)
            });
            addMessage('assistant', result.answer);
        } catch (error) {
            showError(error.message || 'The assistant is temporarily unavailable. Please try again.');
        } finally {
            busy = false;
            sendButton.disabled = false;
            typing.textContent = '';
            input.focus();
        }
    }

    function beginAppointment() {
        clearError();
        preview = null;
        confirmation.checked = false;
        sendInquiryButton.disabled = true;
        messageForm.hidden = true;
        appointmentButton.hidden = true;
        footerActions.hidden = true;
        appointmentFormSection.hidden = false;
        previewSection.hidden = true;
        root.querySelector('#sf-chat-main').scrollTop = 0;
        root.querySelector('#sf-chat-name').focus();
    }

    async function prepareAppointment(event) {
        event.preventDefault();
        clearError();
        const name = root.querySelector('#sf-chat-name').value.trim();
        const email = root.querySelector('#sf-chat-email').value.trim();
        const phone = root.querySelector('#sf-chat-phone').value.trim();
        if (!name || (!email && !phone)) {
            showError('Enter your name and either a phone number or email address.');
            return;
        }
        if (email && !root.querySelector('#sf-chat-email').validity.valid) {
            showError('Enter a valid email address.');
            return;
        }

        busy = true;
        const reviewButton = root.querySelector('#sf-chat-review');
        reviewButton.disabled = true;
        reviewButton.textContent = 'Preparing review…';
        try {
            const result = await request('appointment-preview', {
                name,
                email,
                phone,
                note: root.querySelector('#sf-chat-note').value.trim(),
                messages
            });
            preview = result;
            root.querySelector('#sf-chat-recipient').value = result.preview.recipient;
            root.querySelector('#sf-chat-subject').value = result.preview.subject;
            root.querySelector('#sf-chat-message-preview').value = result.preview.message;
            root.querySelector('#sf-chat-attachment-name').textContent = result.preview.attachmentName;
            root.querySelector('#sf-chat-transcript').textContent = result.preview.transcript;
            appointmentFormSection.hidden = true;
            previewSection.hidden = false;
            footerActions.hidden = true;
            root.querySelector('#sf-chat-main').scrollTop = 0;
            root.querySelector('#sf-chat-preview-title').focus();
        } catch (error) {
            showError(error.message || 'The inquiry could not be prepared. Please try again.');
        } finally {
            busy = false;
            reviewButton.disabled = false;
            reviewButton.textContent = 'Review inquiry';
        }
    }

    async function sendAppointment() {
        if (!preview || !confirmation.checked || busy) return;
        clearError();
        busy = true;
        sendInquiryButton.disabled = true;
        sendInquiryButton.textContent = 'Sending…';
        try {
            await request('appointment-send', {
                preview: preview.preview,
                token: preview.token
            });
            preview = null;
            previewSection.hidden = true;
            appointmentButton.hidden = false;
            footerActions.hidden = false;
            messageForm.hidden = false;
            addMessage('assistant', 'The server email transport accepted this inquiry for delivery. This is not an appointment confirmation.');
        } catch (error) {
            const message = error instanceof TypeError
                ? 'We could not confirm whether the inquiry was accepted. Please contact the clinic before retrying.'
                : (error.message || 'The inquiry could not be sent. Please contact the clinic directly.');
            showError(message);
        } finally {
            busy = false;
            sendInquiryButton.textContent = 'Send inquiry';
            sendInquiryButton.disabled = !confirmation.checked;
        }
    }

    function startNewConversation() {
        if (busy) return;
        clearError();
        messages = [{ role: 'assistant', content: welcome }];
        messageList.replaceChildren();
        renderMessage(messages[0]);
        persistMessages();
        preview = null;
        contactForm.reset();
        showChatView();
        typing.textContent = '';
        input.value = '';
        input.focus();
    }

    function dismissGreeting() {
        greeting.hidden = true;
        try {
            sessionStorage.setItem(greetingKey, 'true');
        } catch (error) {
            storageWarning = true;
        }
    }

    messages.forEach(renderMessage);
    if (storageWarning) {
        showError('This browser limits session storage. Your conversation will remain available only while this page stays open.');
    }

    launcher.addEventListener('click', openChat);
    root.querySelector('#sf-chat-greeting .sf-chat-greeting-dismiss').addEventListener('click', dismissGreeting);
    root.querySelector('#sf-chat-close').addEventListener('click', closeChat);
    collapseButton.addEventListener('click', collapseChat);
    root.querySelector('#sf-chat-new').addEventListener('click', startNewConversation);
    messageForm.addEventListener('submit', sendMessage);
    input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            messageForm.requestSubmit();
        }
    });
    appointmentButton.addEventListener('click', beginAppointment);
    contactForm.addEventListener('submit', prepareAppointment);
    root.querySelector('#sf-chat-cancel-form').addEventListener('click', showChatView);
    root.querySelector('#sf-chat-edit-inquiry').addEventListener('click', function () {
        preview = null;
        confirmation.checked = false;
        sendInquiryButton.disabled = true;
        previewSection.hidden = true;
        appointmentFormSection.hidden = false;
        root.querySelector('#sf-chat-name').focus();
    });
    confirmation.addEventListener('change', function () {
        sendInquiryButton.disabled = !confirmation.checked || busy;
    });
    sendInquiryButton.addEventListener('click', sendAppointment);
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && !panel.hidden) closeChat();
    });
})();
