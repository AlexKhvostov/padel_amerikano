<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="theme-color" content="#f5f7f3">
    <title>Падел Американо</title>
    <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body>
    <div id="app">
        <div id="loader" class="loader hidden" aria-hidden="true">
            <div class="spinner"></div>
        </div>
        <div id="toast" class="toast hidden" role="status" aria-live="polite"></div>
        <main id="screen"></main>
        <nav id="nav" class="bottom-nav hidden" aria-label="Основная навигация">
            <button data-screen="players" class="nav-btn">
                <span class="nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
                <span>Игроки</span>
            </button>
            <button data-screen="rounds" class="nav-btn">
                <span class="nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg></span>
                <span>Раунды</span>
            </button>
            <button data-screen="rating" class="nav-btn">
                <span class="nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM17 6h3v2a4 4 0 0 1-4 4M7 6H4v2a4 4 0 0 0 4 4"/></svg></span>
                <span>Рейтинг</span>
            </button>
            <button data-screen="settings" class="nav-btn">
                <span class="nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3V9.6h.1A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.38.3.6.66.6 1.1v.1h1v4h-.1A1.7 1.7 0 0 0 19.4 15Z"/></svg></span>
                <span>Настройки</span>
            </button>
            <button data-action="exit-view" class="nav-btn hidden">
                <span class="nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></svg></span>
                <span>Выйти</span>
            </button>
        </nav>
    </div>
    <script type="module" src="/assets/js/app.js"></script>
</body>
</html>
