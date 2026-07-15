import { rounds, matches } from '../api.js';
import { getSession } from '../storage.js';
import { toast, escapeHtml } from '../ui.js';

export async function renderRounds(container) {
    const session = getSession();
    let data;

    try {
        data = await rounds.list(session.id);
    } catch (e) {
        container.innerHTML = `<div class="error-box">${escapeHtml(e.message)}</div>`;
        return;
    }

    const roundsList = data.rounds || [];
    const lastRound = roundsList[roundsList.length - 1];
    const canAddNext = !lastRound || lastRound.is_complete;

    container.innerHTML = `
        <h1>Раунды</h1>
        <button class="btn btn-primary" id="btn-add-round" ${canAddNext ? '' : 'disabled'}>
            ${roundsList.length ? '▶ Следующий раунд' : '+ Начать турнир (раунд 1)'}
        </button>
        <div id="rounds-list" style="margin-top:16px"></div>
    `;

    const listEl = container.querySelector('#rounds-list');
    if (!roundsList.length) {
        listEl.innerHTML = '<div class="empty">Раунды ещё не созданы</div>';
    } else {
        listEl.innerHTML = roundsList
            .map((r, idx) => renderRound(r, idx === roundsList.length - 1))
            .join('');
        bindRoundEvents(listEl, session.id);
    }

    container.querySelector('#btn-add-round')?.addEventListener('click', async () => {
        try {
            const created = await rounds.create(session.id);
            if (created.warning) toast(created.warning, true);
            else toast('Раунд создан');
            renderRounds(container);
        } catch (e) {
            toast(e.message, true);
        }
    });
}

function renderRound(round, expanded) {
    const bench =
        round.bench?.length
            ? `<div class="bench-note">Пропускают раунд: ${round.bench.map((p) => escapeHtml(p.name)).join(', ')}</div>`
            : '';

    const matchesHtml = (round.matches || [])
        .map((m) => renderMatch(m))
        .join('');

    return `
        <div class="card round-card" data-round="${round.id}">
            <div class="round-header" data-toggle="${round.id}">
                <strong>Раунд ${round.round_number}</strong>
                <span>${round.is_complete ? '✅' : '▾'}</span>
            </div>
            <div class="round-body ${expanded ? '' : 'hidden'}" id="round-body-${round.id}">
                ${bench}
                ${matchesHtml}
            </div>
        </div>`;
}

function renderMatch(m) {
    const t1 = m.teams[1].map((p) => escapeHtml(p.name)).join(' + ');
    const t2 = m.teams[2].map((p) => escapeHtml(p.name)).join(' + ');
    const done = m.is_finished ? ' match-done' : '';
    const s1 = m.score_team1 ?? '';
    const s2 = m.score_team2 ?? '';

    return `
        <div class="match-card${done}" data-match="${m.id}">
            <div class="court">Корт ${m.court_number}</div>
            <div class="team blue">🟦 ${t1}</div>
            <div class="vs">vs</div>
            <div class="team red">🟥 ${t2}</div>
            <div class="score-row">
                <input type="number" inputmode="numeric" class="score-1" value="${s1}" min="0">
                <span>:</span>
                <input type="number" inputmode="numeric" class="score-2" value="${s2}" min="0">
            </div>
            <button class="btn btn-secondary btn-save-score">Сохранить</button>
        </div>`;
}

function bindRoundEvents(el, companyId) {
    el.querySelectorAll('[data-toggle]').forEach((hdr) => {
        hdr.addEventListener('click', () => {
            const body = el.querySelector(`#round-body-${hdr.dataset.toggle}`);
            body?.classList.toggle('hidden');
        });
    });

    el.querySelectorAll('[data-match]').forEach((card) => {
        card.querySelector('.btn-save-score')?.addEventListener('click', async () => {
            const s1 = card.querySelector('.score-1').value;
            const s2 = card.querySelector('.score-2').value;
            try {
                await matches.saveScore(card.dataset.match, Number(s1), Number(s2));
                toast('Счёт сохранён');
                renderRounds(document.getElementById('screen'));
            } catch (e) {
                toast(e.message, true);
            }
        });
    });
}
