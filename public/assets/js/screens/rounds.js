import { rounds, matches, tournaments } from '../api.js';
import { getSession, setActiveTournament } from '../storage.js';
import { toast, escapeHtml, renderError, confirmAction } from '../ui.js';
import { showTournamentRules } from '../tournament-rules.js';

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
    const tournamentMeta = data.tournament || {};
    const canClone =
        canEdit &&
        tournamentMeta.status === 'completed' &&
        !tournamentMeta.is_archived;

    maybeFlashRotationDone(session.tournamentId, rotationDone && canEdit);

    container.innerHTML = `
        <header class="page-header rounds-page-header">
            <div>
                <span class="eyebrow">${escapeHtml(session.tournamentName || 'Турнир')}</span>
                <h1>Раунды</h1>
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
                ${
                    session.role === 'viewer'
                        ? '<span class="live-pill"><i></i> Просмотр</span>'
                        : lastRound
                          ? `<span class="status-pill">${rotationDone ? 'Готово' : `R${lastRound.round_number}`}</span>`
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
        <div id="rounds-list" class="rounds-list"></div>
        ${
            !canEdit
                ? ''
                : canClone
                ? `<button type="button" class="btn btn-primary btn-round-advance" id="btn-repeat-tournament">Начать новый турнир</button>`
                : rotationDone
                ? ''
                : `<button class="btn btn-primary btn-round-advance" id="btn-add-round" ${canAdvance ? '' : 'disabled'}>
                    ${roundsList.length ? 'Следующий раунд →' : 'Начать ротацию'}
                  </button>`
        }
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
    container.querySelector('#btn-tournament-rules').addEventListener('click', () => {
        showTournamentRules();
    });
    container.querySelector('#btn-repeat-tournament')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
            const created = await tournaments.clone(session.tournamentId);
            setActiveTournament(created);
            toast(`Создан турнир «${created.name}»`);
            navigate?.('rounds');
        } catch (e) {
            button.disabled = false;
            toast(e.message, true);
        }
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
              }</strong><span>игр</span></div>`
            : '';
    if (schedule.repeated_partnerships) {
        maybeFlashOnce('repeat-partnership-toast', 'Из-за числа игроков потребуется один повтор партнёрства');
    }
    return `
        <div class="schedule-summary card">
            <div><strong>${schedule.total_rounds}</strong><span>раундов</span></div>
            <div><strong>${schedule.total_matches}</strong><span>матчей</span></div>
            ${games || `<div><strong>${schedule.completed_rounds}</strong><span>готово</span></div>`}
            <div><strong>${schedule.covered_partnerships}/${schedule.total_partnerships}</strong><span>пар</span></div>
        </div>
    `;
}

function maybeFlashOnce(key, message, isError = false) {
    try {
        if (sessionStorage.getItem(key) === '1') return;
        sessionStorage.setItem(key, '1');
    } catch {
        // ignore
    }
    toast(message, isError);
}

function maybeFlashRotationDone(tournamentId, shouldShow) {
    if (!shouldShow || !tournamentId) return;
    maybeFlashOnce(`rotation-done-toast:${tournamentId}`, 'Полная ротация завершена');
}

function renderRound(round, expanded, canEdit) {
    const matches = round.matches || [];
    const matchCount = matches.length;
    const finishedCount = matches.filter((match) => match.is_finished).length;
    const courts = [...new Set(matches.map((match) => match.court_number))].sort((a, b) => a - b);
    const courtLabel = courts.length
        ? (courts.length === 1 ? `Корт ${courts[0]}` : `Корты ${courts[0]}–${courts[courts.length - 1]}`)
        : 'Без кортов';
    const statusLabel = round.is_complete ? 'Готово' : 'Активный';
    const progressLabel = `${finishedCount}/${matchCount} ${pluralMatches(matchCount)}`;
    const bench = round.bench?.length
        ? `<div class="bench-note">Отдых: ${round.bench
              .map((player) => escapeHtml(player.name))
              .join(', ')}</div>`
        : '';

    return `
        <div class="card round-card ${round.is_complete ? 'round-complete' : ''} ${expanded ? 'is-open' : ''}" data-round="${round.id}">
            <button class="round-header" data-toggle="${round.id}" aria-expanded="${expanded}" aria-controls="round-body-${round.id}">
                <span class="round-num" aria-label="Раунд ${round.round_number}">${round.round_number}</span>
                <span class="round-meta">
                    <span class="round-meta-title">Раунд ${round.round_number}</span>
                    <span class="round-meta-sub">${statusLabel} · ${progressLabel} · ${courtLabel}</span>
                </span>
                <span class="round-collapse" aria-hidden="true">${expanded ? '▴' : '▾'}</span>
            </button>
            <div class="round-body ${expanded ? '' : 'hidden'}" id="round-body-${round.id}">
                ${bench}
                ${matches.map((match) => renderMatch(match, canEdit)).join('')}
            </div>
        </div>`;
}

function pluralMatches(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return 'матч';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'матча';
    return 'матчей';
}

function renderMatch(match, canEdit) {
    const team1 = renderTeamNames(match.teams[1]);
    const team2 = renderTeamNames(match.teams[2]);
    const scoreInteractive = canEdit && match.is_finished;

    return `
        <div class="match-card ${match.is_finished ? 'match-done' : ''}" data-match="${match.id}">
            <aside class="match-meta">
                <span class="court-label">К${match.court_number}</span>
                ${match.is_finished ? '<span class="match-status">✓</span>' : '<span class="match-status active">●</span>'}
            </aside>
            <div class="match-play">
                <div class="match-line">
                    <div class="team blue"><span class="team-badge">A</span><span class="team-names">${team1}</span></div>
                    ${
                        scoreInteractive
                            ? `<button type="button" class="score-display score-edit-trigger btn-edit-score" aria-label="Изменить счёт ${match.score_team1}:${match.score_team2}">
                                   <strong>${match.score_team1}</strong><span>:</span><strong>${match.score_team2}</strong>
                               </button>`
                            : `<div class="score-display">
                                   <strong>${match.is_finished ? match.score_team1 : '—'}</strong><span>:</span><strong>${match.is_finished ? match.score_team2 : '—'}</strong>
                               </div>`
                    }
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
                    <button class="btn btn-secondary btn-save-score">OK</button>
                </div>`
                        : ''
                }
            </div>
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
            const card = header.closest('.round-card');
            const body = container.querySelector(`#round-body-${header.dataset.toggle}`);
            body?.classList.toggle('hidden');
            const open = body && !body.classList.contains('hidden');
            header.setAttribute('aria-expanded', String(open));
            card?.classList.toggle('is-open', open);
            const collapse = header.querySelector('.round-collapse');
            if (collapse) collapse.textContent = open ? '▴' : '▾';
        });
    });

    if (!canEdit) return;

    container.querySelectorAll('[data-match]').forEach((card) => {
        card.querySelector('.btn-edit-score')?.addEventListener('click', (event) => {
            event.stopPropagation();
            startScoreEdit(card, setEditing);
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

function startScoreEdit(card, setEditing) {
    const trigger = card.querySelector('.btn-edit-score');
    if (trigger) {
        trigger.classList.add('is-placeholder');
        trigger.setAttribute('aria-hidden', 'true');
        trigger.tabIndex = -1;
        trigger.innerHTML = '<strong>—</strong><span>:</span><strong>—</strong>';
    }
    card.querySelector('.score-editor')?.classList.remove('hidden');
    card.querySelector('.match-line')?.classList.add('editing');
    setEditing(true);
    card.querySelector('.score-1')?.focus();
}

async function saveScoreWithConfirmation(matchId, score1, score2) {
    try {
        return await matches.saveScore(matchId, score1, score2);
    } catch (e) {
        if (e.data?.code !== 'SCORE_TOTAL_CONFIRM_REQUIRED') {
            throw e;
        }

        const confirmed = confirmAction(e.message);
        if (!confirmed) {
            throw new Error('Сохранение отменено');
        }
        return matches.saveScore(matchId, score1, score2, true);
    }
}
