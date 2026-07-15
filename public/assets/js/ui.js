let loadingCount = 0;

export function showLoader() {
    loadingCount++;
    const loader = document.getElementById('loader');
    loader?.classList.remove('hidden');
    loader?.setAttribute('aria-hidden', 'false');
}

export function hideLoader() {
    loadingCount = Math.max(0, loadingCount - 1);
    if (loadingCount === 0) {
        const loader = document.getElementById('loader');
        loader?.classList.add('hidden');
        loader?.setAttribute('aria-hidden', 'true');
    }
}

export function toast(message, isError = false) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('error', isError);
    el.classList.remove('hidden');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.add('hidden'), 3000);
}

export function initials(name) {
    return name
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() || '')
        .join('');
}

export function telegramLink(handle) {
    if (!handle) return null;
    const user = handle.replace(/^@/, '');
    return { label: `@${user}`, href: `https://t.me/${user}` };
}

export function confirmAction(message) {
    return window.confirm(message);
}

export function renderError(container, message, onRetry) {
    container.innerHTML = `
        <div class="error-box">${escapeHtml(message)}</div>
        <button class="btn btn-secondary" id="btn-retry">Повторить</button>
    `;
    container.querySelector('#btn-retry')?.addEventListener('click', onRetry);
}

export function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
