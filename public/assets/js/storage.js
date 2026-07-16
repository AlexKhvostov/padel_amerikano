const SESSION_KEY = 'padel_amerikano_session';
const FAVORITE_COMPANIES_KEY = 'padel_amerikano_favorite_companies';
const RECENT_COMPANIES_KEY = 'padel_amerikano_recent_companies';
const MAX_RECENT_COMPANIES = 30;

export function getSession() {
    try {
        return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch {
        return null;
    }
}

export function setSession(data) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

export function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

export function setActiveTournament(tournament) {
    const session = getSession();
    if (!session) return;
    session.tournamentId = Number(tournament.id);
    session.tournamentName = tournament.name;
    session.tournamentStatus = tournament.status;
    setSession(session);
}

export function clearActiveTournament() {
    const session = getSession();
    if (!session) return;
    delete session.tournamentId;
    delete session.tournamentName;
    delete session.tournamentStatus;
    setSession(session);
}

export function getFavoriteCompanyIds() {
    return readNumberList(FAVORITE_COMPANIES_KEY);
}

export function toggleFavoriteCompany(companyId) {
    const id = Number(companyId);
    if (!Number.isInteger(id) || id <= 0) return false;
    const ids = getFavoriteCompanyIds();
    const wasFavorite = ids.includes(id);
    const next = wasFavorite ? ids.filter((item) => item !== id) : [id, ...ids];
    writeJson(FAVORITE_COMPANIES_KEY, next);
    return !wasFavorite;
}

export function rememberCompany(companyId) {
    const id = Number(companyId);
    if (!Number.isInteger(id) || id <= 0) return;
    const recent = readJson(RECENT_COMPANIES_KEY, [])
        .filter((item) => Number(item?.companyId) !== id)
        .map((item) => ({
            companyId: Number(item?.companyId),
            visitedAt: Number(item?.visitedAt),
        }))
        .filter((item) => Number.isInteger(item.companyId) && item.companyId > 0);
    recent.unshift({ companyId: id, visitedAt: Date.now() });
    writeJson(RECENT_COMPANIES_KEY, recent.slice(0, MAX_RECENT_COMPANIES));
}

export function getRecentCompanyIds() {
    return readJson(RECENT_COMPANIES_KEY, [])
        .map((item) => Number(item?.companyId))
        .filter((id, index, ids) => Number.isInteger(id) && id > 0 && ids.indexOf(id) === index)
        .slice(0, MAX_RECENT_COMPANIES);
}

export function getMyCompanyIds() {
    const favorites = getFavoriteCompanyIds();
    return [...favorites, ...getRecentCompanyIds().filter((id) => !favorites.includes(id))];
}

function readNumberList(key) {
    return readJson(key, [])
        .map(Number)
        .filter((id, index, ids) => Number.isInteger(id) && id > 0 && ids.indexOf(id) === index);
}

function readJson(key, fallback) {
    try {
        const value = JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
        return Array.isArray(value) ? value : fallback;
    } catch {
        return fallback;
    }
}

function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Приложение продолжает работать, даже если браузер запретил localStorage.
    }
}
