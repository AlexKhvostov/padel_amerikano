import { rounds, matches } from '../api.js';
import { getSession } from '../storage.js';
import { toast, escapeHtml, renderError, confirmAction } from '../ui.js';

export async function renderRounds(container, navigate = null) {
    const session = getSession();
    const tournamentId = session.tournamentId;
    if (!tournamentId) {
        if (navigate) {
            navigate('tournaments');
            return;
        }
        renderError(container, 'Сначала выберите турнир', () => window.location.reload());
        return;
    }
    const canEdit = session.role !== 'viewer';
    let stopped = false;
    let editing = false;
    let loading = false;
    let snapshot = '';

    const load = async (showError = true, force = false) => {
        if (stopped || loading || (editing && !force)) return;
        loading = true;
        try {
            const data = await rounds.list(tournamentId, !showError);
            const nextSnapshot = JSON.stringify(data);
            if (force || nextSnapshot !== snapshot) {
                snapshot = nextSnapshot;
                renderRoundsContent(container, data, session, canEdit, load, (value) => {
                    editing = value;
                }, navigate);
            }
        } catch (e) {
            if (showError && !stopped) {
                renderError(container, e.message, () => load(true, true));
            }
        } finally {
            loading = false;
        }
    };

    await load();
    const timer = window.setInterval(() => {
        if (document.visibilityState === 'visible') load(false);
    }, 4000);

    return () => {
        stopped = true;
        window.clearInterval(timer);
    };
}

function renderRoundsContent(container, data, session, canEdit, reload, setEditing, navigate) {
    const roundsList = data.rounds || [];
    const schedule = data.schedule || {};
    const lastRound = roundsList[roundsList.length - 1];
    const canAdvance =
        (!lastRound || lastRound.is_complete) && !schedule.minimum_players_required;
    const rotationDone =
        !!lastRound &&
        lastRound.is_complete &&
        schedule.rotation_complete === true;

    container.innerHTML = `
        <header class="page-header">
            <div>
                <span class="eyebrow">${escapeHtml(session.tournamentName || 'Турнир')}</span>
                <h1>Раунды</h1>
            </div>
            <div class="round-page-actions">
                ${
                    canEdit
                        ? `<button class="round-settings-icon" id="btn-tournament-settings" aria-label="Настройки турнира" title="Настройки турнира">
                               <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.12-1.3l2-1.55-2-3.46-2.44 1A7 7 0 0 0 14.2 5.4L13.85 3h-4l-.35 2.4a7 7 0 0 0-2.24 1.3l-2.44-1-2 3.46 2 1.55A7 7 0 0 0 4.7 12c0 .44.04.87.12 1.29l-2 1.56 2 3.46 2.44-1a7 7 0 0 0 2.24 1.3l.35 2.39h4l.35-2.4a7 7 0 0 0 2.24-1.3l2.44 1 2-3.46-2-1.55c.08-.42.12-.85.12-1.29Z"/></svg>
                           </button>`
                        : ''
                }
                ${
                    session.role === 'viewer'
                        ? '<span class="live-pill"><i></i> Просмотр</span>'
                        : lastRound
                          ? `<span class="status-pill">${rotationDone ? 'Завершено' : `Раунд ${lastRound.round_number}`}</span>`
                          : ''
                }
                ${
                    schedule.total_rounds && !schedule.minimum_players_required
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
        ${renderScheduleSummary(schedule)}
        ${
            !canEdit
                ? ''
                : rotationDone
                ? '<div class="success-box">Полная ротация завершена</div>'
                : `<button class="btn btn-primary" id="btn-add-round" ${canAdvance ? '' : 'disabled'}>
                    ${roundsList.length ? 'Следующий раунд →' : 'Начать полную ротацию'}
                  </button>`
        }
        <div id="rounds-list" class="rounds-list"></div>
        <dialog class="schedule-dialog" id="schedule-dialog">
            <div class="schedule-dialog-head">
                <div><span class="eyebrow">Полная ротация</span><h2>Сетка игр</h2></div>
                <button class="dialog-close" id="btn-close-grid" aria-label="Закрыть">×</button>
            </div>
            <div class="schedule-dialog-body" id="schedule-dialog-body"></div>
        </dialog>
    `;

    const listEl = container.querySelector('#rounds-list');
    if (!roundsList.length) {
        listEl.innerHTML = schedule.minimum_players_required
            ? `<div class="empty">Добавьте минимум ${schedule.minimum_players_required} игроков для расчёта расписания</div>`
            : canEdit
              ? '<div class="empty">Расписание рассчитано и готово к запуску</div>'
              : '<div class="empty">Ожидаем запуска турнира администратором</div>';
    } else {
        listEl.innerHTML = roundsList
            .map((round, index) =>
                renderRound(round, index === roundsList.length - 1, canEdit)
            )
            .join('');
        bindRoundEvents(listEl, canEdit, reload, setEditing);
    }

    container.querySelector('#btn-add-round')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
            await rounds.create(session.tournamentId);
            toast(roundsList.length ? 'Следующий раунд открыт' : 'Расписание создано');
            await reload(true, true);
        } catch (e) {
            button.disabled = false;
            toast(e.message, true);
        }
    });
    container.querySelector('#btn-tournament-settings')?.addEventListener('click', () => {
        navigate?.('tournament-settings');
    });

    bindScheduleDialog(container, session.tournamentId);
}

function renderScheduleSummary(schedule) {
    if (!schedule.total_rounds) return '';
    const games =
        schedule.minimum_games_per_player !== undefined
            ? `<div><strong>${schedule.minimum_games_per_player}${
                  schedule.maximum_games_per_player !== schedule.minimum_games_per_player
                      ? `–${schedule.maximum_games_per_player}`
                      : ''
              }</strong><span>игр на игрока</span></div>`
            : '';
    const repeatWarning = schedule.repeated_partnerships
        ? '<p class="schedule-warning">Из-за количества игроков потребуется один повтор партнёрства.</p>'
        : '';
    return `
        <div class="schedule-summary card">
            <div><strong>${schedule.total_rounds}</strong><span>Раундов</span></div>
            <div><strong>${schedule.total_matches}</strong><span>Матчей</span></div>
            ${games || `<div><strong>${schedule.completed_rounds}</strong><span>завершено</span></div>`}
            <div><strong>${schedule.covered_partnerships}/${schedule.total_partnerships}</strong><span>партнёрств</span></div>
        </div>
        ${repeatWarning}
    `;
}

function renderRound(round, expanded, canEdit) {
    const bench = round.bench?.length
        ? `<div class="bench-note">Пропускают раунд: ${round.bench
              .map((player) => escapeHtml(player.name))
              .join(', ')}</div>`
        : '';

    return `
        <div class="card round-card ${round.is_complete ? 'round-complete' : ''}" data-round="${round.id}">
            <button class="round-header" data-toggle="${round.id}" aria-expanded="${expanded}">
                <span><small>РАУНД</small><strong>${round.round_number}</strong></span>
                <span class="round-state">${round.is_complete ? 'Готово' : 'Активный'} <b>⌄</b></span>
            </button>
            <div class="round-body ${expanded ? '' : 'hidden'}" id="round-body-${round.id}">
                ${bench}
                ${(round.matches || []).map((match) => renderMatch(match, canEdit)).join('')}
            </div>
        </div>`;
}

function renderMatch(match, canEdit) {
    const team1 = renderTeamNames(match.teams[1]);
    const team2 = renderTeamNames(match.teams[2]);
    const editButton =
        canEdit && match.is_finished
            ? `<button class="match-edit-icon btn-edit-score" aria-label="Изменить счёт на корте ${match.court_number}">
                   <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
               </button>`
            : '';

    return `
        <div class="match-card ${match.is_finished ? 'match-done' : ''}" data-match="${match.id}">
            <div class="court">
                <span class="court-main">Корт ${match.court_number}${editButton}</span>
                ${match.is_finished ? '<span class="match-status">Завершён</span>' : '<span class="match-status active">Идёт</span>'}
            </div>
            <div class="match-line">
                <div class="team blue"><span class="team-badge">A</span><span class="team-names">${team1}</span></div>
                <div class="score-display">
                    <strong>${match.is_finished ? match.score_team1 : '—'}</strong><span>:</span><strong>${match.is_finished ? match.score_team2 : '—'}</strong>
                </div>
                <div class="team red"><span class="team-names">${team2}</span><span class="team-badge">B</span></div>
            </div>
            ${
                canEdit
                    ? `<div class="score-editor ${match.is_finished ? 'hidden' : ''}">
                <div class="score-row">
                    <input type="number" inputmode="numeric" class="score-1" value="${match.score_team1 ?? ''}" min="0" step="1" aria-label="Счёт синей команды">
                    <span>:</span>
                    <input type="number" inputmode="numeric" class="score-2" value="${match.score_team2 ?? ''}" min="0" step="1" aria-label="Счёт красной команды">
                </div>
                <button class="btn btn-secondary btn-save-score">Сохранить</button>
            </div>
                    `
                    : ''
            }
        </div>`;
}

function renderTeamNames(players) {
    return players
        .map((player) => `<span title="${escapeHtml(player.name)}">${escapeHtml(player.name)}</span>`)
        .join('');
}

function bindScheduleDialog(container, companyId) {
    const dialog = container.querySelector('#schedule-dialog');
    const body = container.querySelector('#schedule-dialog-body');
    const closeDialog = () => {
        if (typeof dialog.close === 'function') dialog.close();
        else dialog.removeAttribute('open');
    };

    container.querySelector('#btn-show-grid')?.addEventListener('click', async () => {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
        body.innerHTML = '<div class="empty">Загружаем сетку…</div>';

        try {
            const data = await rounds.schedule(companyId);
            body.innerHTML = data.rounds?.length
                ? data.rounds.map(renderGridRound).join('')
                : '<div class="empty">Сетка ещё не рассчитана</div>';
        } catch (error) {
            body.innerHTML = `<div class="error-box">${escapeHtml(error.message)}</div>`;
        }
    });

    container.querySelector('#btn-close-grid')?.addEventListener('click', closeDialog);
    dialog?.addEventListener('click', (event) => {
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

function bindRoundEvents(container, canEdit, reload, setEditing) {
    container.querySelectorAll('[data-toggle]').forEach((header) => {
        header.addEventListener('click', () => {
            const body = container.querySelector(`#round-body-${header.dataset.toggle}`);
            body?.classList.toggle('hidden');
            header.setAttribute('aria-expanded', String(!body?.classList.contains('hidden')));
        });
    });

    if (!canEdit) return;

    container.querySelectorAll('[data-match]').forEach((card) => {
        card.querySelector('.btn-edit-score')?.addEventListener('click', () => {
            card.querySelector('.score-editor')?.classList.remove('hidden');
            card.querySelector('.btn-edit-score')?.classList.add('hidden');
            setEditing(true);
            card.querySelector('.score-1')?.focus();
        });

        const editor = card.querySelector('.score-editor');
        editor?.addEventListener('focusin', () => setEditing(true));
        editor?.addEventListener('focusout', () => {
            window.setTimeout(() => {
                if (!editor.contains(document.activeElement)) setEditing(false);
            }, 0);
        });

        card.querySelector('.btn-save-score')?.addEventListener('click', async () => {
            const score1 = card.querySelector('.score-1').value.trim();
            const score2 = card.querySelector('.score-2').value.trim();
            if (score1 === '' || score2 === '') {
                toast('Заполните оба поля счёта', true);
                return;
            }

            try {
                await saveScoreWithConfirmation(card.dataset.match, score1, score2);
                toast('Счёт сохранён');
                window.dispatchEvent(new CustomEvent('rating-updated'));
                setEditing(false);
                await reload(true, true);
            } catch (e) {
                toast(e.message, true);
            }
        });
    });
}

async function saveScoreWithConfirmation(matchId, score1, score2) {
    try {
        return await matches.saveScore(matchId, score1, score2);
    } catch (e) {
        if (e.data?.code !== 'SCORE_TOTAL_CONFIRM_REQUIRED') {
            throw e;
        }

        const confirmed = confirmAction(
            `${e.message}\n\nСохранить нестандартный счёт?`
        );
        if (!confirmed) {
            throw new Error('Сохранение отменено');
        }
        return matches.saveScore(matchId, score1, score2, true);
    }
}
