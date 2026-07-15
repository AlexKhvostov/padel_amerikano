import { companies } from '../api.js';
import { setSession } from '../storage.js';
import { toast, escapeHtml } from '../ui.js';

export function renderHome(container, navigate) {
    let selectedCompany = null;

    container.innerHTML = `
        <h1>Падел Американо</h1>
        <p class="subtitle">Турнирный формат с ротацией партнёров</p>

        <div class="card">
            <h2>Создать компанию</h2>
            <div class="field">
                <label>Название</label>
                <input id="create-name" placeholder="Клуб Ракетка" autocomplete="off">
            </div>
            <button class="btn btn-primary" id="btn-create">Создать компанию</button>
        </div>

        <div class="card">
            <h2>Войти в компанию</h2>
            <div class="field">
                <label>Поиск по названию</label>
                <input id="search-name" placeholder="Начните вводить..." autocomplete="off">
            </div>
            <ul id="search-results" class="search-results"></ul>
            <div id="login-block" class="hidden">
                <div class="field">
                    <label>Пароль</label>
                    <input id="login-password" inputmode="numeric" placeholder="••••" autocomplete="off">
                </div>
                <button class="btn btn-primary" id="btn-login">Войти</button>
            </div>
        </div>
    `;

    const createName = container.querySelector('#create-name');
    const searchName = container.querySelector('#search-name');
    const searchResults = container.querySelector('#search-results');
    const loginBlock = container.querySelector('#login-block');

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
        <div class="card credentials">
            <h2>Компания создана</h2>
            <p class="subtitle">Сохраните данные для входа</p>
            <div class="company-name">${escapeHtml(data.name)}</div>
            <div>Пароль:</div>
            <div class="password">${escapeHtml(data.password)}</div>
            <button class="btn btn-secondary" id="btn-share">Поделиться</button>
            <button class="btn btn-primary" id="btn-enter">Перейти в турнир</button>
        </div>
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
