import { rounds, matches } from '../api.js';
import { getSession } from '../storage.js';
import { toast, escapeHtml, renderError, confirmAction } from '../ui.js';

export async function renderRounds(container) {
    const session = getSession();
    let data;

    try {
        data = await rounds.list(session.id);
    } catch (e) {
        renderError(container, e.message, () => renderRounds(container));
        return;
    }

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
                <span class="eyebrow">Расписание</span>
                <h1>Раунды</h1>
            </div>
            ${lastRound ? `<span class="status-pill">${rotationDone ? 'Завершено' : `Раунд ${lastRound.round_number}`}</span>` : ''}
        </header>
        ${renderScheduleSummary(schedule)}
        ${
            rotationDone
                ? '<div class="success-box">Полная ротация завершена</div>'
                : `<button class="btn btn-primary" id="btn-add-round" ${canAdvance ? '' : 'disabled'}>
                    ${roundsList.length ? 'Следующий раунд →' : 'Начать полную ротацию'}
                  </button>`
        }
        <div id="rounds-list" class="rounds-list"></div>
    `;

    const listEl = container.querySelector('#rounds-list');
    if (!roundsList.length) {
        listEl.innerHTML = schedule.minimum_players_required
            ? `<div class="empty">Добавьте минимум ${schedule.minimum_players_required} игроков для расчёта расписания</div>`
            : '<div class="empty">Расписание рассчитано и готово к запуску</div>';
    } else {
        listEl.innerHTML = roundsList
            .map((round, index) => renderRound(round, index === roundsList.length - 1))
            .join('');
        bindRoundEvents(listEl);
    }

    container.querySelector('#btn-add-round')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
            await rounds.create(session.id);
            toast(roundsList.length ? 'Следующий раунд открыт' : 'Расписание создано');
            renderRounds(container);
        } catch (e) {
            button.disabled = false;
            toast(e.message, true);
        }
    });
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

function renderRound(round, expanded) {
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
                ${(round.matches || []).map(renderMatch).join('')}
            </div>
        </div>`;
}

function renderMatch(match) {
    const team1 = match.teams[1].map((player) => escapeHtml(player.name)).join(' + ');
    const team2 = match.teams[2].map((player) => escapeHtml(player.name)).join(' + ');

    return `
        <div class="match-card ${match.is_finished ? 'match-done' : ''}" data-match="${match.id}">
            <div class="court"><span>Корт ${match.court_number}</span>${match.is_finished ? '<span class="match-status">Завершён</span>' : '<span class="match-status active">Идёт</span>'}</div>
            <div class="team blue"><span class="team-badge">A</span><span>${team1}</span></div>
            <div class="vs"><span>VS</span></div>
            <div class="team red"><span class="team-badge">B</span><span>${team2}</span></div>
            <div class="score-display ${match.is_finished ? '' : 'hidden'}">
                <strong>${match.score_team1 ?? ''}</strong><span>:</span><strong>${match.score_team2 ?? ''}</strong>
            </div>
            <div class="score-editor ${match.is_finished ? 'hidden' : ''}">
                <div class="score-row">
                    <input type="number" inputmode="numeric" class="score-1" value="${match.score_team1 ?? ''}" min="0" step="1" aria-label="Счёт синей команды">
                    <span>:</span>
                    <input type="number" inputmode="numeric" class="score-2" value="${match.score_team2 ?? ''}" min="0" step="1" aria-label="Счёт красной команды">
                </div>
                <button class="btn btn-secondary btn-save-score">Сохранить</button>
            </div>
            ${
                match.is_finished
                    ? '<button class="btn btn-secondary btn-edit-score">✏️ Редактировать счёт</button>'
                    : ''
            }
        </div>`;
}

function bindRoundEvents(container) {
    container.querySelectorAll('[data-toggle]').forEach((header) => {
        header.addEventListener('click', () => {
            const body = container.querySelector(`#round-body-${header.dataset.toggle}`);
            body?.classList.toggle('hidden');
            header.setAttribute('aria-expanded', String(!body?.classList.contains('hidden')));
        });
    });

    container.querySelectorAll('[data-match]').forEach((card) => {
        card.querySelector('.btn-edit-score')?.addEventListener('click', () => {
            card.querySelector('.score-display')?.classList.add('hidden');
            card.querySelector('.score-editor')?.classList.remove('hidden');
            card.querySelector('.btn-edit-score')?.classList.add('hidden');
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
                renderRounds(document.getElementById('screen'));
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
