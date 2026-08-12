export function showRatingInfo() {
    return new Promise((resolve) => {
        document.getElementById('rating-info-dialog')?.remove();
        const dialog = document.createElement('dialog');
        dialog.id = 'rating-info-dialog';
        dialog.className = 'tournament-rules-dialog rating-info-dialog';
        dialog.innerHTML = `
            <div class="tournament-rules-head">
                <div><span class="eyebrow">Рейтинг компании</span><h2>Что означают показатели</h2></div>
                <button class="dialog-close" data-close-rating-info aria-label="Закрыть">×</button>
            </div>
            <div class="tournament-rules-body">
                <section>
                    <strong><span>1</span> Доля очков</strong>
                    <p>Средний процент очков вашей команды в матче. Если сыграли 12:8, доля равна 60%. Чем выше доля, тем сильнее вы обычно «забираете» очки у соперников.</p>
                </section>
                <section>
                    <strong><span>±</span> Разница / игру</strong>
                    <p>Средняя разница счёта за матч: ваши очки минус очки соперников. Плюс значит, что вы чаще выигрываете с запасом; минус — чаще уступаете по очкам.</p>
                </section>
                <section>
                    <strong><span>%</span> Победы</strong>
                    <p>Доля матчей, где ваша команда набрала больше очков, чем соперники. Ничьи не считаются ни победой, ни поражением.</p>
                </section>
                <section>
                    <strong><span>i</span> Турниры и игры</strong>
                    <p>«Турн.» — в скольких турнирах компании вы участвовали. «Игр» — сколько матчей с сохранённым счётом учтено в рейтинге. Архивные турниры в рейтинг компании не входят.</p>
                </section>
                <section>
                    <strong><span>?</span> Предварительно</strong>
                    <p>Пока сыграно меньше 5 матчей, рейтинг считается предварительным: выборка ещё маленькая, место может сильно меняться.</p>
                </section>
                <div class="tournament-rules-note">
                    <strong>Как формируется сортировка списка</strong>
                    <ol>
                        <li>Сначала активные участники, затем неактивные.</li>
                        <li>Игроки с 5+ матчами выше тех, у кого рейтинг предварительный.</li>
                        <li>Дальше по убыванию: доля очков → средняя разница → процент побед → число матчей.</li>
                        <li>При полном равенстве — по имени.</li>
                    </ol>
                </div>
                <p class="tournament-rules-hint">Номер слева на карточке — это текущее место в рейтинге компании по этим правилам.</p>
                <button class="btn btn-primary" data-close-rating-info>Понятно</button>
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
        dialog.querySelectorAll('[data-close-rating-info]').forEach((button) => {
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
