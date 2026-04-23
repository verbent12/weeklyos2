let databaseIds = null;
let allRoutines = [];

async function callNotionApi(action, payload = {}) {
    const res = await fetch('/api/notion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload })
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

async function sync() {
    try {
        document.body.style.cursor = 'wait';
        const data = await callNotionApi('sync');
        databaseIds = data.ids;
        allRoutines = data.routines;
        render(data);
    } catch (err) {
        console.error(err);
        document.getElementById('stats').innerHTML = '<div style="color:red">Ошибка: проверьте токен Notion</div>';
    } finally {
        document.body.style.cursor = 'default';
    }
}

function render(data) {
    const { todayPercent, weekPercent, monthPercent, weekDays, routines, lectureToday, todayRecordId, todayDoneIds } = data;
    document.getElementById('stats').innerHTML = `
        <div class="stat-card"><span class="stat-value">${Math.round(todayPercent)}%</span><span class="stat-label">СЕГОДНЯ</span></div>
        <div class="stat-card"><span class="stat-value">${Math.round(weekPercent)}%</span><span class="stat-label">НЕДЕЛЯ</span></div>
        <div class="stat-card"><span class="stat-value">${Math.round(monthPercent)}%</span><span class="stat-label">АПРЕЛЬ</span></div>
    `;
    const calendarDiv = document.getElementById('weekCalendar');
    calendarDiv.innerHTML = weekDays.map(day => `
        <div class="day-card">
            <div class="day-name">${day.weekday}</div>
            <div class="day-number">${day.dateNum}</div>
            <div class="day-percent">${Math.round(day.percent)}%</div>
            ${day.lecture ? `<div class="lecture-tag">📘 ${day.lecture}</div>` : ''}
        </div>
    `).join('');

    const morning = routines.filter(r => r.category === 'Утро');
    const day = routines.filter(r => r.category === 'День');
    const evening = routines.filter(r => r.category === 'Вечер');

    document.getElementById('dailyRoutine').innerHTML = `
        <div class="routine-column"><h2>🌅 УТРО</h2><ul id="morningList"></ul></div>
        <div class="routine-column"><h2>☀️ ДЕНЬ</h2><ul id="dayList"></ul></div>
        <div class="routine-column"><h2>🌙 ВЕЧЕР</h2><ul id="eveningList"></ul></div>
    `;

    const renderList = (items, containerId) => {
        const ul = document.getElementById(containerId);
        if (!ul) return;
        ul.innerHTML = items.map(item => `
            <li>
                <input type="checkbox" data-routine-id="${item.id}" ${todayDoneIds.includes(item.id) ? 'checked' : ''}>
                <label class="${todayDoneIds.includes(item.id) ? 'completed' : ''}">${item.name}</label>
            </li>
        `).join('');
        ul.querySelectorAll('input').forEach(cb => {
            cb.addEventListener('change', async (e) => {
                const routineId = cb.dataset.routineId;
                const completed = cb.checked;
                cb.disabled = true;
                await callNotionApi('toggle', { dayId: todayRecordId, routineId, completed });
                cb.disabled = false;
                sync(); // обновляем всё
            });
        });
    };

    renderList(morning, 'morningList');
    renderList(day, 'dayList');
    renderList(evening, 'eveningList');

    document.getElementById('lectureNote').innerHTML = lectureToday ? `<strong>📖 Лекция дня:</strong> ${lectureToday}` : '<em>Нет лекции на сегодня</em>';
}

document.getElementById('syncBtn').addEventListener('click', sync);
sync();