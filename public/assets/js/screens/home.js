import { companies } from '../api.js';
import { setSession } from '../storage.js';
import { toast, escapeHtml } from '../ui.js';

export function renderHome(container, navigate) {
    let selectedCompany = null;

    container.innerHTML = `
        <section class="auth-shell">
            <div class="brand">
                <div class="brand-mark" aria-hidden="true">A</div>
                <div>
                    <h1>Американо</h1>
                    <p>Падел. Партнёры меняются — очки остаются.</p>
                </div>
            </div>

            <div class="segmented" role="tablist" aria-label="Вход или регистрация">
                <button class="segment active" data-auth-tab="create" role="tab" aria-selected="true">Создать</button>
                <button class="segment" data-auth-tab="login" role="tab" aria-selected="false">Войти</button>
            </div>

            <div class="auth-panel" id="create-panel">
                <div class="section-heading">
                    <h2>Новая компания</h2>
                    <p>Получите код и пригласите участников</p>
                </div>
                <div class="field">
                    <label for="create-name">Название компании</label>
                    <input id="create-name" placeholder="Например, Клуб Ракетка" autocomplete="organization">
                </div>
                <button class="btn btn-primary" id="btn-create">Создать компанию</button>
            </div>

            <div class="auth-panel hidden" id="login-panel">
                <div class="section-heading">
                    <h2>Вход в турнир</h2>
                    <p>Найдите компанию и введите код</p>
                </div>
                <div class="field">
                    <label for="search-name">Название компании</label>
                    <input id="search-name" placeholder="Начните вводить..." autocomplete="off">
                </div>
                <ul id="search-results" class="search-results"></ul>
                <div id="login-block" class="hidden">
                    <div class="field">
                        <label for="login-password">Код доступа</label>
                        <input id="login-password" inputmode="numeric" placeholder="4–6 цифр" autocomplete="one-time-code">
                    </div>
                    <button class="btn btn-primary" id="btn-login">Войти</button>
                </div>
            </div>
        </section>
    `;

    const createName = container.querySelector('#create-name');
    const searchName = container.querySelector('#search-name');
    const searchResults = container.querySelector('#search-results');
    const loginBlock = container.querySelector('#login-block');

    container.querySelectorAll('[data-auth-tab]').forEach((tab) => {
        tab.addEventListener('click', () => {
            const selected = tab.dataset.authTab;
            container.querySelectorAll('[data-auth-tab]').forEach((item) => {
                const active = item.dataset.authTab === selected;
                item.classList.toggle('active', active);
                item.setAttribute('aria-selected', String(active));
            });
            container.querySelector('#create-panel').classList.toggle('hidden', selected !== 'create');
            container.querySelector('#login-panel').classList.toggle('hidden', selected !== 'login');
        });
    });

    container.querySelector('#btn-create').addEventListener('click', async () => {
        try {
            const data = await companies.create(createName.value.trim());
            showCredentials(container, data, navigate);
        } catch (e) {
            toast(e.message, true);
        }
    });

    let searchTimer;
    searchName.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(async () => {
            const q = searchName.value.trim();
            if (q.length < 2) {
                searchResults.innerHTML = '';
                loginBlock.classList.add('hidden');
                return;
            }
            try {
                const { companies: list } = await companies.search(q);
                searchResults.innerHTML = list
                    .map(
                        (c) =>
                            `<li data-id="${c.id}" data-name="${escapeHtml(c.name)}">${escapeHtml(c.name)}</li>`
                    )
                    .join('');
            } catch (e) {
                toast(e.message, true);
            }
        }, 300);
    });

    searchResults.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (!li) return;
        selectedCompany = { id: li.dataset.id, name: li.dataset.name };
        loginBlock.classList.remove('hidden');
        searchResults.innerHTML = `<li><strong>${escapeHtml(selectedCompany.name)}</strong></li>`;
    });

    container.querySelector('#btn-login').addEventListener('click', async () => {
        if (!selectedCompany) return;
        try {
            const data = await companies.login(
                selectedCompany.name,
                container.querySelector('#login-password').value
            );
            setSession(data);
            navigate('players');
        } catch (e) {
            toast(e.message, true);
        }
    });
}

function showCredentials(container, data, navigate) {
    container.innerHTML = `
        <section class="auth-shell">
            <div class="brand compact">
                <div class="brand-mark" aria-hidden="true">A</div>
                <div><h1>Компания создана</h1><p>Сохраните код доступа</p></div>
            </div>
            <div class="credentials card">
                <span class="eyebrow">Компания</span>
                <div class="company-name">${escapeHtml(data.name)}</div>
                <span class="eyebrow">Код доступа</span>
                <div class="password">${escapeHtml(data.password)}</div>
            </div>
            <div class="button-stack">
            <button class="btn btn-secondary" id="btn-share">Поделиться</button>
            <button class="btn btn-primary" id="btn-enter">Перейти в турнир</button>
            </div>
        </section>
    `;

    container.querySelector('#btn-share').addEventListener('click', async () => {
        const text = `Падел Американо\nКомпания: ${data.name}\nПароль: ${data.password}`;
        if (navigator.share) {
            await navigator.share({ title: 'Падел Американо', text });
        } else {
            await navigator.clipboard.writeText(text);
            toast('Данные скопированы');
        }
    });

    container.querySelector('#btn-enter').addEventListener('click', () => {
        setSession(data);
        navigate('players');
    });
}
