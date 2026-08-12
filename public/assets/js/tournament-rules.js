export function showTournamentRules({ afterCreation = false } = {}) {
    return new Promise((resolve) => {
        document.getElementById('tournament-rules-dialog')?.remove();
        const dialog = document.createElement('dialog');
        dialog.id = 'tournament-rules-dialog';
        dialog.className = 'tournament-rules-dialog';
        dialog.innerHTML = `
            <div class="tournament-rules-head">
                <div><span class="eyebrow">Падел Американо</span><h2>Короткие правила игры</h2></div>
                <button class="dialog-close" data-close-rules aria-label="Закрыть">×</button>
            </div>
            <div class="tournament-rules-body">
                <section>
                    <strong><span>16+1</span> Короткий формат</strong>
                    <ol>
                        <li>Разыграйте 16 обязательных мячей: каждый из четырёх игроков выполняет по 4 подачи.</li>
                        <li>После них можно сыграть 17-ю подачу. Её выполняет игрок, который подавал первым, а принимающая пара выбирает принимающего.</li>
                        <li>Одинаковая длина матчей удобнее для турнира; доп. мяч включается в настройках турнира.</li>
                    </ol>
                </section>
                <section>
                    <strong><span>24+1</span> Длинный формат</strong>
                    <p>Каждый игрок выполняет по 6 подач — всего 24 основных розыгрыша. По желанию добавляйте 25-й мяч по тому же правилу дополнительной подачи.</p>
                </section>
                <div class="tournament-rules-note">
                    Формат, доп. мяч и разрешение ничьей задаются в настройках турнира (шестерёнка). Выберите один вариант и используйте его во всех матчах. После каждого матча внесите итоговый счёт: каждый игрок получит очки своей команды, рейтинг пересчитается автоматически.
                </div>
                <p class="tournament-rules-hint">Любой счёт можно сохранить. Если он не совпадает с выбранными правилами (например, ничья при выключенной галке или необычная сумма), система сначала предупредит и попросит подтверждение.</p>
                <button class="btn btn-primary" data-close-rules>${afterCreation ? 'Понятно, перейти к турниру' : 'Понятно'}</button>
            </div>
        `;
        document.body.append(dialog);

        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            dialog.remove();
            resolve();
        };
        dialog.querySelectorAll('[data-close-rules]').forEach((button) => {
            button.addEventListener('click', () => dialog.close());
        });
        dialog.addEventListener('click', (event) => {
            const rect = dialog.getBoundingClientRect();
            const outside =
                event.clientX < rect.left
                || event.clientX > rect.right
                || event.clientY < rect.top
                || event.clientY > rect.bottom;
            if (event.target === dialog && outside) dialog.close();
        });
        dialog.addEventListener('close', finish, { once: true });
        dialog.showModal();
    });
}
