<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="theme-color" content="#1a6b4a">
    <title>Падел Американо</title>
    <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body>
    <div id="app">
        <div id="loader" class="loader hidden" aria-hidden="true">
            <div class="spinner"></div>
        </div>
        <div id="toast" class="toast hidden" role="status"></div>
        <main id="screen"></main>
        <nav id="nav" class="bottom-nav hidden">
            <button data-screen="players" class="nav-btn"><span>👥</span>Игроки</button>
            <button data-screen="rounds" class="nav-btn"><span>📅</span>Раунды</button>
            <button data-screen="rating" class="nav-btn"><span>🏆</span>Рейтинг</button>
            <button data-screen="settings" class="nav-btn"><span>⚙️</span>Настройки</button>
        </nav>
    </div>
    <script type="module" src="/assets/js/app.js"></script>
</body>
</html>
