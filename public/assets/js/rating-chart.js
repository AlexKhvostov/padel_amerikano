import { players } from './api.js';
import { escapeHtml, toast } from './ui.js';

const PALETTE = [
    '#5b5bd6', '#e25555', '#2f9e74', '#d97706',
    '#0891b2', '#db2777', '#65a30d', '#7c3aed',
    '#0f766e', '#b45309', '#2563eb', '#be123c',
];

export async function showRatingChart(companyId) {
    document.getElementById('rating-chart-dialog')?.remove();
    const dialog = document.createElement('dialog');
    dialog.id = 'rating-chart-dialog';
    dialog.className = 'tournament-rules-dialog rating-chart-dialog';
    dialog.innerHTML = `
        <div class="tournament-rules-head">
            <div><span class="eyebrow">Рейтинг компании</span><h2>График доли очков</h2></div>
            <button class="dialog-close" data-close-chart aria-label="Закрыть">×</button>
        </div>
        <div class="rating-chart-body">
            <div class="empty">Загружаем график…</div>
        </div>
    `;
    document.body.append(dialog);
    dialog.showModal();

    const close = () => dialog.close();
    dialog.querySelectorAll('[data-close-chart]').forEach((button) => {
        button.addEventListener('click', close);
    });
    dialog.addEventListener('click', (event) => {
        const rect = dialog.getBoundingClientRect();
        const outside =
            event.clientX < rect.left
            || event.clientX > rect.right
            || event.clientY < rect.top
            || event.clientY > rect.bottom;
        if (event.target === dialog && outside) close();
    });
    dialog.addEventListener('close', () => dialog.remove(), { once: true });

    try {
        const data = await players.ratingTimeline(companyId);
        renderChartDialog(dialog, data);
    } catch (error) {
        dialog.querySelector('.rating-chart-body').innerHTML =
            `<div class="error-box">${escapeHtml(error.message)}</div>`;
        toast(error.message, true);
    }
}

function renderChartDialog(dialog, data) {
    const body = dialog.querySelector('.rating-chart-body');
    const dates = data.dates || [];
    const series = data.series || [];
    if (!dates.length || !series.length) {
        body.innerHTML = '<div class="empty">Пока нет сыгранных матчей для графика</div>';
        return;
    }

    const defaultSelected = new Set(
        series.slice(0, Math.min(6, series.length)).map((item) => item.id)
    );

    body.innerHTML = `
        <p class="rating-chart-hint">По вертикали — накопленная доля очков (%), по горизонтали — даты матчей. Включайте нужных игроков в легенде.</p>
        <div class="rating-chart-canvas-wrap">
            <canvas id="rating-chart-canvas" width="720" height="360" aria-label="График доли очков"></canvas>
        </div>
        <div class="rating-chart-legend" id="rating-chart-legend">
            ${series.map((item, index) => {
                const color = PALETTE[index % PALETTE.length];
                const checked = defaultSelected.has(item.id) ? 'checked' : '';
                return `
                    <label class="rating-chart-legend-item" style="--player-color:${color}">
                        <input type="checkbox" value="${item.id}" ${checked}>
                        <i></i>
                        <span>${escapeHtml(item.name)}</span>
                    </label>
                `;
            }).join('')}
        </div>
        <div class="button-row rating-chart-actions">
            <button type="button" class="btn btn-ghost" id="btn-chart-all">Все</button>
            <button type="button" class="btn btn-ghost" id="btn-chart-none">Снять</button>
            <button type="button" class="btn btn-primary" data-close-chart>Закрыть</button>
        </div>
    `;

    const canvas = body.querySelector('#rating-chart-canvas');
    const legend = body.querySelector('#rating-chart-legend');
    const draw = () => {
        const selected = new Set(
            [...legend.querySelectorAll('input:checked')].map((input) => Number(input.value))
        );
        drawTimeline(canvas, dates, series, selected);
    };

    legend.addEventListener('change', draw);
    body.querySelector('#btn-chart-all').addEventListener('click', () => {
        legend.querySelectorAll('input').forEach((input) => { input.checked = true; });
        draw();
    });
    body.querySelector('#btn-chart-none').addEventListener('click', () => {
        legend.querySelectorAll('input').forEach((input) => { input.checked = false; });
        draw();
    });
    body.querySelectorAll('[data-close-chart]').forEach((button) => {
        button.addEventListener('click', () => dialog.close());
    });

    draw();
    window.setTimeout(draw, 50);
}

function drawTimeline(canvas, dates, series, selectedIds) {
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 360;
    const cssHeight = Math.max(220, Math.round(cssWidth * 0.55));
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pad = { top: 16, right: 12, bottom: 34, left: 36 };
    const width = cssWidth - pad.left - pad.right;
    const height = cssHeight - pad.top - pad.bottom;

    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = '#fafaff';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const visible = series.filter((item) => selectedIds.has(item.id));
    let minY = 40;
    let maxY = 60;
    visible.forEach((item) => {
        item.values.forEach((value) => {
            if (value === null || value === undefined) return;
            minY = Math.min(minY, value);
            maxY = Math.max(maxY, value);
        });
    });
    if (maxY - minY < 8) {
        const mid = (maxY + minY) / 2;
        minY = mid - 4;
        maxY = mid + 4;
    }
    minY = Math.max(0, Math.floor(minY / 5) * 5);
    maxY = Math.min(100, Math.ceil(maxY / 5) * 5);
    if (maxY <= minY) {
        maxY = minY + 10;
    }

    const xAt = (index) => {
        if (dates.length === 1) return pad.left + width / 2;
        return pad.left + (index / (dates.length - 1)) * width;
    };
    const yAt = (value) => pad.top + ((maxY - value) / (maxY - minY)) * height;

    ctx.strokeStyle = '#e5e6ef';
    ctx.lineWidth = 1;
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = '#74788f';
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
        const value = minY + ((maxY - minY) * i) / steps;
        const y = yAt(value);
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + width, y);
        ctx.stroke();
        ctx.fillText(`${Math.round(value)}%`, 4, y + 3);
    }

    const labelStep = Math.max(1, Math.ceil(dates.length / 5));
    dates.forEach((date, index) => {
        if (index % labelStep !== 0 && index !== dates.length - 1) return;
        const x = xAt(index);
        const label = formatChartDate(date);
        ctx.fillStyle = '#74788f';
        ctx.fillText(label, x - 14, cssHeight - 10);
    });

    series.forEach((item, seriesIndex) => {
        if (!selectedIds.has(item.id)) return;
        const color = PALETTE[seriesIndex % PALETTE.length];
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        let started = false;
        item.values.forEach((value, index) => {
            if (value === null || value === undefined) return;
            const x = xAt(index);
            const y = yAt(value);
            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        });
        if (started) ctx.stroke();

        item.values.forEach((value, index) => {
            if (value === null || value === undefined) return;
            const x = xAt(index);
            const y = yAt(value);
            ctx.beginPath();
            ctx.arc(x, y, 2.5, 0, Math.PI * 2);
            ctx.fill();
        });
    });
}

function formatChartDate(isoDate) {
    const [year, month, day] = String(isoDate).split('-');
    if (!day) return isoDate;
    return `${day}.${month}${year ? `.${String(year).slice(2)}` : ''}`;
}
