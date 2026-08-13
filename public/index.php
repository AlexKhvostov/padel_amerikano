<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="theme-color" content="#202235">
    <meta name="format-detection" content="telephone=no, date=no, email=no, address=no">
    <title>Падел Американо</title>
    <link rel="stylesheet" href="/assets/css/app.css?v=20260813g">
    <!-- Yandex.Metrika counter -->
    <script type="text/javascript">
        (function(m,e,t,r,i,k,a){
            m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
            m[i].l=1*new Date();
            for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
            k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
        })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=110792369', 'ym');

        ym(110792369, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
    </script>
    <!-- /Yandex.Metrika counter -->
</head>
<body>
    <noscript><div><img src="https://mc.yandex.ru/watch/110792369" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
    <div id="app">
        <div id="loader" class="loader hidden" aria-hidden="true">
            <div class="spinner"></div>
        </div>
        <div id="toast" class="toast hidden" role="status" aria-live="polite"></div>
        <header class="app-brand-bar">
            <button type="button" class="app-brand-link" id="btn-copy-app-link"
                title="Скопировать ссылку на приложение"
                aria-label="Скопировать ссылку padel.ballaball.xyz">
                padel.ballaball.xyz
            </button>
        </header>
        <main id="screen"></main>
        <!-- Совместимость со старым кэшем Safari: раньше тут было нижнее меню турнира -->
        <nav id="tournament-subnav" class="hidden" hidden aria-hidden="true"></nav>
        <nav id="nav" class="bottom-nav hidden" aria-label="Основная навигация">
            <button data-screen="players" data-context="company" class="nav-btn">
                <span class="nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
                <span>Участники</span>
            </button>
            <button data-screen="tournaments" data-context="company" class="nav-btn">
                <span class="nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg></span>
                <span>Турниры</span>
            </button>
            <button data-screen="settings" data-context="company" class="nav-btn">
                <span class="nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3V9.6h.1A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.38.3.6.66.6 1.1v.1h1v4h-.1A1.7 1.7 0 0 0 19.4 15Z"/></svg></span>
                <span>Настройки</span>
            </button>
            <button data-action="exit-view" data-context="company" class="nav-btn hidden">
                <span class="nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></svg></span>
                <span>Выйти</span>
            </button>
        </nav>
    </div>
    <script type="module" src="/assets/js/app.js?v=20260813g"></script>
    <script>
        // Если модули не загрузились (старый кэш Chrome) — один раз жёстко перезагружаем.
        window.setTimeout(function () {
            var screen = document.getElementById('screen');
            if (!screen || screen.childNodes.length > 0) return;
            try {
                if (sessionStorage.getItem('padel_boot_retry') === '1') return;
                sessionStorage.setItem('padel_boot_retry', '1');
            } catch (e) {}
            var url = new URL(window.location.href);
            url.searchParams.set('_r', String(Date.now()));
            window.location.replace(url.toString());
        }, 2200);
    </script>
</body>
</html>
