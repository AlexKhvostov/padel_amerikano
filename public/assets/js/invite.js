import { toast } from './ui.js';

export function buildViewerUrl(viewSlug) {
    const url = new URL(`/v/${encodeURIComponent(viewSlug)}`, window.location.origin);
    return url.toString();
}

export function buildViewerInviteText(companyName, viewSlug) {
    return [
        'Смотрите турнир Падел Американо',
        `Компания: ${companyName}`,
        `Ссылка для просмотра: ${buildViewerUrl(viewSlug)}`,
    ].join('\n');
}

export function buildQrUrl(viewSlug) {
    const params = new URLSearchParams({
        text: buildViewerUrl(viewSlug),
        size: '180',
        margin: '1',
        format: 'svg',
    });
    return `https://quickchart.io/qr?${params.toString()}`;
}

export async function shareViewerInvite(companyName, viewSlug) {
    const text = buildViewerInviteText(companyName, viewSlug);

    if (navigator.share) {
        try {
            await navigator.share({ title: 'Падел Американо', text });
            return;
        } catch (error) {
            if (error?.name === 'AbortError') return;
        }
    }

    await copyText(text);
    toast('Приглашение скопировано');
}

async function copyText(text) {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch {
            // На HTTP Clipboard API недоступен — используем совместимый способ ниже.
        }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();

    if (!copied) {
        window.prompt('Скопируйте приглашение:', text);
    }
}
