const SESSION_KEY = 'padel_amerikano_session';

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
