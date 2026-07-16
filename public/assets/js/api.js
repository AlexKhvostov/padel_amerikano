import { getSession } from './storage.js';
import { showLoader, hideLoader } from './ui.js';

const BASE = '/api';

export async function api(path, options = {}) {
    const session = getSession();
    const { silent = false, ...fetchOptions } = options;
    const headers = {
        'Content-Type': 'application/json',
        ...(fetchOptions.headers || {}),
    };
    if (session?.token) {
        headers.Authorization = `Bearer ${session.token}`;
    }

    if (!silent) showLoader();
    try {
        let res;
        try {
            res = await fetch(BASE + path, { ...fetchOptions, headers });
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
        if (!silent) hideLoader();
    }
}

export const companies = {
    publicList: (query = '', page = 1, silent = false, companyIds = null, activityStatus = '') => {
        const ids = companyIds === null ? '' : `&ids=${companyIds.join(',')}`;
        const status = activityStatus ? `&status=${encodeURIComponent(activityStatus)}` : '';
        return api(`/companies/public?q=${encodeURIComponent(query)}&page=${page}${ids}${status}`, { silent });
    },
    search: (q) => api(`/companies/search?q=${encodeURIComponent(q)}`),
    create: (name) => api('/companies', { method: 'POST', body: JSON.stringify({ name }) }),
    login: (name, password) =>
        api('/companies/login', { method: 'POST', body: JSON.stringify({ name, password }) }),
    view: (token) => api(`/viewer/${encodeURIComponent(token)}`),
    get: (id) => api(`/companies/${id}`),
    rename: (id, name) =>
        api(`/companies/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
    changePassword: (id, currentPassword, newPassword) =>
        api(`/companies/${id}/password`, {
            method: 'PUT',
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword,
            }),
        }),
    updateSettings: (id, settings) =>
        api(`/companies/${id}/settings`, { method: 'PUT', body: JSON.stringify(settings) }),
    reset: (id) => api(`/companies/${id}/reset`, { method: 'DELETE' }),
    remove: (id) => api(`/companies/${id}`, { method: 'DELETE' }),
};

export const players = {
    list: (companyId) => api(`/companies/${companyId}/players`),
    create: (companyId, data) =>
        api(`/companies/${companyId}/players`, { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => api(`/players/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id) => api(`/players/${id}`, { method: 'DELETE' }),
    activate: (id) => api(`/players/${id}/activate`, { method: 'PUT' }),
    stats: (id) => api(`/players/${id}/stats`),
};

export const rounds = {
    list: (tournamentId, silent = false) => api(`/tournaments/${tournamentId}/rounds`, { silent }),
    schedule: (tournamentId) => api(`/tournaments/${tournamentId}/schedule`),
    create: (tournamentId) => api(`/tournaments/${tournamentId}/rounds`, { method: 'POST' }),
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
    company: (companyId) => api(`/companies/${companyId}/rating`),
    tournament: (tournamentId) => api(`/tournaments/${tournamentId}/rating`),
    get: (companyId) => api(`/companies/${companyId}/rating`),
};

export const tournaments = {
    publicList: (date = '', silent = false) =>
        api(`/tournaments${date ? `?date=${encodeURIComponent(date)}` : ''}`, { silent }),
    list: (companyId, silent = false) => api(`/companies/${companyId}/tournaments`, { silent }),
    create: (companyId, data) =>
        api(`/companies/${companyId}/tournaments`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    get: (id) => api(`/tournaments/${id}`),
    update: (id, data) =>
        api(`/tournaments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    players: (id) => api(`/tournaments/${id}/players`),
    updatePlayers: (id, playerIds) =>
        api(`/tournaments/${id}/players`, {
            method: 'PUT',
            body: JSON.stringify({ player_ids: playerIds }),
        }),
    remove: (id) => api(`/tournaments/${id}`, { method: 'DELETE' }),
    reset: (id) => api(`/tournaments/${id}/reset`, { method: 'DELETE' }),
};
