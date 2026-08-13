import { rounds } from './api.js';
import { escapeHtml, companyEyebrow } from './ui.js';
import { showTournamentRules } from './tournament-rules.js';

export function tournamentTabsHtml(active) {
    return `
        <div class="tournament-tabs" role="tablist" aria-label="Разделы турнира">
            <button type="button" class="tournament-tab ${active === 'rounds' ? 'active' : ''}"
                data-tournament-tab="rounds" role="tab" aria-selected="${active === 'rounds'}">Раунды</button>
            <button type="button" class="tournament-tab ${active === 'rating' ? 'active' : ''}"
                data-tournament-tab="rating" role="tab" aria-selected="${active === 'rating'}">Рейтинг</button>
        </div>
    `;
}

export function tournamentHeaderHtml({ session, canEdit, statusHtml = '', showGrid = true }) {
    return `
        <header class="page-header tournament-page-header">
            <div>
                ${companyEyebrow(session)}
                <h1>${escapeHtml(session.tournamentName || 'Турнир')}</h1>
            </div>
            <div class="round-page-actions">
                <button class="round-settings-icon round-info-icon" id="btn-tournament-rules" aria-label="Правила турнира" title="Правила турнира">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg>
                </button>
                ${
                    canEdit
                        ? `<button class="round-settings-icon" id="btn-tournament-settings" aria-label="Настройки турнира" title="Настройки турнира">
                               <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.12-1.3l2-1.55-2-3.46-2.44 1A7 7 0 0 0 14.2 5.4L13.85 3h-4l-.35 2.4a7 7 0 0 0-2.24 1.3l-2.44-1-2 3.46 2 1.55A7 7 0 0 0 4.7 12c0 .44.04.87.12 1.29l-2 1.56 2 3.46 2.44-1a7 7 0 0 0 2.24 1.3l.35 2.39h4l.35-2.4a7 7 0 0 0 2.24-1.3l2.44 1 2-3.46-2-1.55c.08-.42.12-.85.12-1.29Z"/></svg>
                           </button>`
                        : ''
                }
                ${statusHtml}
                ${
                    showGrid
                        ? `<button class="schedule-grid-icon" id="btn-show-grid" aria-label="Показать всю сетку" title="Показать всю сетку">
                               <span class="schedule-grid-visual" aria-hidden="true">
                                   <svg class="schedule-grid-shape" viewBox="0 0 24 24">
                                       <rect x="3" y="3" width="7" height="7" rx="1"/>
                                       <rect x="14" y="3" width="7" height="7" rx="1"/>
                                       <rect x="3" y="14" width="7" height="7" rx="1"/>
                                       <rect x="14" y="14" width="7" height="7" rx="1"/>
                                   </svg>
                                   <svg class="schedule-ball-shape" viewBox="0 0 24 24">
                                       <circle cx="12" cy="12" r="9"/>
                                       <path class="tennis-seam-shadow" d="M6.3 5.2c7.8 4.7 7.8 8.9 2 13.8M17.7 18.8c-7.8-4.7-7.8-8.9-2-13.8"/>
                                       <path class="tennis-seam" d="M6.3 5.2c7.8 4.7 7.8 8.9 2 13.8M17.7 18.8c-7.8-4.7-7.8-8.9-2-13.8"/>
                                   </svg>
                               </span>
                           </button>`
                        : ''
                }
            </div>
        </header>
    `;
}

export function tournamentStatusHtml(session, { lastRound = null, rotationDone = false } = {}) {
    if (session.role === 'viewer') {
        return '<span class="live-pill"><i></i> Просмотр</span>';
    }
    if (lastRound) {
        return `<span class="status-pill" x-apple-data-detectors="false">${rotationDone ? 'Готово' : `R${lastRound.round_number}`}</span>`;
    }
    return '';
}

export function ratingProgressHtml(progress) {
    const played = progress?.played ?? 0;
    const total = progress?.total ?? 0;
    return `
        <div class="rating-progress-strip" aria-label="Сыграно матчей ${played} из ${total}">
            <strong>${played}/${total}</strong>
            <span>матчей сыграно</span>
        </div>
    `;
}

export function scheduleDialogHtml() {
    return `
        <dialog class="schedule-dialog" id="schedule-dialog">
            <div class="schedule-dialog-head">
                <div><span class="eyebrow">Полная ротация</span><h2>Сетка игр</h2></div>
                <button class="dialog-close" id="btn-close-grid" aria-label="Закрыть">×</button>
            </div>
            <div class="schedule-dialog-body" id="schedule-dialog-body"></div>
        </dialog>
    `;
}

export function bindTournamentTabs(container, navigate) {
    if (!navigate) return;
    container.querySelectorAll('[data-tournament-tab]').forEach((button) => {
        button.addEventListener('click', () => {
            const screen = button.dataset.tournamentTab;
            if (screen) navigate(screen);
        });
    });
}

export function bindTournamentChrome(container, { navigate, tournamentId, canEdit = false }) {
    bindTournamentTabs(container, navigate);
    container.querySelector('#btn-tournament-rules')?.addEventListener('click', () => {
        showTournamentRules();
    });
    container.querySelector('#btn-tournament-settings')?.addEventListener('click', () => {
        navigate?.('tournament-settings');
    });
    bindScheduleDialog(container, tournamentId);
}

function bindScheduleDialog(container, tournamentId) {
    const dialog = container.querySelector('#schedule-dialog');
    const body = container.querySelector('#schedule-dialog-body');
    if (!dialog || !body || !tournamentId) return;

    const closeDialog = () => {
        if (typeof dialog.close === 'function') dialog.close();
        else dialog.removeAttribute('open');
    };

    container.querySelector('#btn-show-grid')?.addEventListener('click', async () => {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
        body.innerHTML = '<div class="empty">Загружаем сетку…</div>';

        try {
            const data = await rounds.schedule(tournamentId);
            body.innerHTML = data.rounds?.length
                ? data.rounds.map(renderGridRound).join('')
                : '<div class="empty">Сетка ещё не рассчитана</div>';
        } catch (error) {
            body.innerHTML = `<div class="error-box">${escapeHtml(error.message)}</div>`;
        }
    });

    container.querySelector('#btn-close-grid')?.addEventListener('click', closeDialog);
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) closeDialog();
    });
}

function renderGridRound(round) {
    const statuses = {
        planned: 'План',
        active: 'Активный',
        completed: 'Готово',
    };
    const bench = round.bench?.length
        ? `<div class="grid-bench">Отдых: ${round.bench.map((player) => escapeHtml(player.name)).join(', ')}</div>`
        : '';

    return `
        <section class="grid-round">
            <header><strong>Раунд ${round.round_number}</strong><span class="${round.status}">${statuses[round.status] || ''}</span></header>
            ${bench}
            <div class="grid-matches">
                ${(round.matches || []).map(renderGridMatch).join('')}
            </div>
        </section>
    `;
}

function renderGridMatch(match) {
    return `
        <div class="grid-match">
            <b>К${match.court_number}</b>
            <span class="grid-team">${renderGridTeam(match.teams[1])}</span>
            <i>${match.is_finished ? `${match.score_team1}:${match.score_team2}` : '—'}</i>
            <span class="grid-team right">${renderGridTeam(match.teams[2])}</span>
        </div>
    `;
}

function renderGridTeam(players) {
    return (players || []).map((player) => `<span>${escapeHtml(player.name)}</span>`).join('');
}
