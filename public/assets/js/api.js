import { getSession } from './storage.js';
import { showLoader, hideLoader } from './ui.js';

const BASE = '/api';

export async function api(path, options = {}) {
    const session = getSession();
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
    };
    if (session?.token) {
        headers.Authorization = `Bearer ${session.token}`;
    }

    showLoader();
    try {
        let res;
        try {
            res = await fetch(BASE + path, { ...options, headers });
        } catch {
            throw new Error('Нет соединения с сервером. Проверьте интернет и повторите.');
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data.error || 'Ошибка запроса');
            err.status = res.status;
            err.data = data;
            if (res.status === 401 || res.status === 403) {
                window.dispatchEvent(new CustomEvent('session-expired'));
            }
            throw err;
        }
        return data;
    } finally {
        hideLoader();
    }
}

export const companies = {
    search: (q) => api(`/companies/search?q=${encodeURIComponent(q)}`),
    create: (name) => api('/companies', { method: 'POST', body: JSON.stringify({ name }) }),
    login: (name, password) =>
        api('/companies/login', { method: 'POST', body: JSON.stringify({ name, password }) }),
    get: (id) => api(`/companies/${id}`),
    updateSettings: (id, settings) =>
        api(`/companies/${id}/settings`, { method: 'PUT', body: JSON.stringify(settings) }),
    reset: (id) => api(`/companies/${id}/reset`, { method: 'DELETE' }),
};

export const players = {
    list: (companyId) => api(`/companies/${companyId}/players`),
    create: (companyId, data) =>
        api(`/companies/${companyId}/players`, { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => api(`/players/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id) => api(`/players/${id}`, { method: 'DELETE' }),
};

export const rounds = {
    list: (companyId) => api(`/companies/${companyId}/rounds`),
    create: (companyId) => api(`/companies/${companyId}/rounds`, { method: 'POST' }),
};

export const matches = {
    saveScore: (id, score_team1, score_team2, confirmInvalidTotal = false) =>
        api(`/matches/${id}/score`, {
            method: 'PUT',
            body: JSON.stringify({
                score_team1,
                score_team2,
                confirm_invalid_total: confirmInvalidTotal,
            }),
        }),
};

export const rating = {
    get: (companyId) => api(`/companies/${companyId}/rating`),
};
