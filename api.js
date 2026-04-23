export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    const { action, dayId, routineId, completed } = req.body;
    const { NOTION_TOKEN, NOTION_PARENT_PAGE_ID } = process.env;
    if (!NOTION_TOKEN) return res.status(500).json({ error: 'NOTION_TOKEN missing' });

    const notionRequest = async (path, method = 'POST', body = null) => {
        const response = await fetch(`https://api.notion.com/v1/${path}`, {
            method,
            headers: {
                'Authorization': `Bearer ${NOTION_TOKEN}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: body ? JSON.stringify(body) : undefined
        });
        if (!response.ok) throw new Error(await response.text());
        return response.json();
    };

    async function findDatabaseByName(name) {
        const search = await notionRequest('search', 'POST', {
            query: name,
            filter: { property: 'object', value: 'database' }
        });
        return search.results.find(db => db.title?.[0]?.plain_text === name);
    }

    async function createRoutineDB() {
        const db = await notionRequest('databases', 'POST', {
            parent: NOTION_PARENT_PAGE_ID ? { page_id: NOTION_PARENT_PAGE_ID } : { workspace: true },
            title: [{ text: { content: 'Рутина' } }],
            properties: {
                'Название': { title: {} },
                'Категория': { select: { options: [{ name: 'Утро' }, { name: 'День' }, { name: 'Вечер' }] } }
            }
        });
        const items = [
            ['Трансерфинг','Утро'], ['Медитация','Утро'], ['Электротоки','Утро'], ['Виброплатформа','Утро'],
            ['Шея/спина (утро)','Утро'], ['Йога','Утро'], ['Валик и ноги','Утро'], ['Массаж лица и уход','Утро'],
            ['Шея/спина (день)','День'], ['Корсет','День'], ['Кибер (3 лекции)','День'], ['Тренажёр','День'],
            ['Работа с ИИ/Notion','День'], ['Тренировка/прогулка','Вечер'], ['Изучение языка','Вечер'],
            ['Оптимизация бизнеса','День'], ['Платизма','Вечер'], ['Благодарности','Вечер'], ['Мидитация','Вечер']
        ];
        for (const [name, cat] of items) {
            await notionRequest('pages', 'POST', {
                parent: { database_id: db.id },
                properties: {
                    'Название': { title: [{ text: { content: name } }] },
                    'Категория': { select: { name: cat } }
                }
            });
        }
        return db;
    }

    async function createLecturesDB() {
        const db = await notionRequest('databases', 'POST', {
            parent: NOTION_PARENT_PAGE_ID ? { page_id: NOTION_PARENT_PAGE_ID } : { workspace: true },
            title: [{ text: { content: 'Темы лекций' } }],
            properties: {
                'Тема': { title: {} },
                'Пройдена': { checkbox: {} }
            }
        });
        const topics = ['XSS-атаки', 'SQL-инъекции', 'Фишинг', 'DDoS-защита', 'Шифрование', 'Безопасность облаков', 'Многофакторная аутентификация'];
        for (const topic of topics) {
            await notionRequest('pages', 'POST', {
                parent: { database_id: db.id },
                properties: {
                    'Тема': { title: [{ text: { content: topic } }] },
                    'Пройдена': { checkbox: false }
                }
            });
        }
        return db;
    }

    async function createDaysDB(routineId, lecturesId) {
        return await notionRequest('databases', 'POST', {
            parent: NOTION_PARENT_PAGE_ID ? { page_id: NOTION_PARENT_PAGE_ID } : { workspace: true },
            title: [{ text: { content: 'Дни' } }],
            properties: {
                'Дата': { date: {} },
                'Запланировано': { relation: { database_id: routineId, type: 'single_property' } },
                'Сделано': { relation: { database_id: routineId, type: 'single_property' } },
                'Лекция дня': { relation: { database_id: lecturesId, type: 'single_property' } },
                'Статус': { select: { options: [{ name: 'План' }] } },
                '% дня': { number: { format: 'number' } }
            }
        });
    }

    async function ensureDatabases() {
        let routineDB = await findDatabaseByName('Рутина');
        if (!routineDB) routineDB = await createRoutineDB();
        let lecturesDB = await findDatabaseByName('Темы лекций');
        if (!lecturesDB) lecturesDB = await createLecturesDB();
        let daysDB = await findDatabaseByName('Дни');
        if (!daysDB) daysDB = await createDaysDB(routineDB.id, lecturesDB.id);
        return { routine: routineDB.id, lectures: lecturesDB.id, days: daysDB.id };
    }

    try {
        if (action === 'sync') {
            const ids = await ensureDatabases();
            const routinesResp = await notionRequest(`databases/${ids.routine}/query`, 'POST', {});
            const routines = routinesResp.results.map(p => ({
                id: p.id,
                name: p.properties.Название.title[0]?.plain_text,
                category: p.properties.Категория.select?.name
            }));

            const today = new Date().toISOString().slice(0,10);
            let daysQuery = await notionRequest(`databases/${ids.days}/query`, 'POST', {
                filter: { property: 'Дата', date: { equals: today } }
            });
            let todayPage = daysQuery.results[0];

            if (!todayPage) {
                const planned = routines.map(r => ({ id: r.id }));
                const newPage = await notionRequest('pages', 'POST', {
                    parent: { database_id: ids.days },
                    properties: {
                        'Дата': { date: { start: today } },
                        'Запланировано': { relation: planned },
                        'Сделано': { relation: [] },
                        'Статус': { select: { name: 'План' } }
                    }
                });
                todayPage = newPage;
                // добавить лекцию дня
                const lectures = await notionRequest(`databases/${ids.lectures}/query`, 'POST', {
                    filter: { property: 'Пройдена', checkbox: { equals: false } }
                });
                if (lectures.results.length) {
                    const lectId = lectures.results[0].id;
                    await notionRequest(`pages/${todayPage.id}`, 'PATCH', {
                        properties: {
                            'Лекция дня': { relation: [{ id: lectId }] }
                        }
                    });
                    await notionRequest(`pages/${lectId}`, 'PATCH', {
                        properties: { 'Пройдена': { checkbox: true } }
                    });
                }
            }

            const start = new Date();
            start.setDate(start.getDate() - start.getDay() + 1);
            const end = new Date(start);
            end.setDate(start.getDate() + 6);
            const weekRes = await notionRequest(`databases/${ids.days}/query`, 'POST', {
                filter: {
                    property: 'Дата',
                    date: {
                        on_or_after: start.toISOString().slice(0,10),
                        on_or_before: end.toISOString().slice(0,10)
                    }
                }
            });
            const weekDays = [];
            let totalPercent = 0;
            for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
                const dateStr = d.toISOString().slice(0,10);
                const dayRec = weekRes.results.find(r => r.properties.Дата.date.start === dateStr);
                let percent = 0, lecture = null;
                if (dayRec) {
                    const planned = dayRec.properties.Запланировано.relation.length;
                    const done = dayRec.properties.Сделано.relation.length;
                    percent = planned ? (done/planned)*100 : 0;
                    if (dayRec.properties['Лекция дня']?.relation?.[0]) {
                        const lectPage = await notionRequest(`pages/${dayRec.properties['Лекция дня'].relation[0].id}`);
                        lecture = lectPage.properties.Тема.title[0]?.plain_text;
                    }
                }
                weekDays.push({
                    weekday: d.toLocaleString('ru', { weekday: 'short' }).toUpperCase(),
                    dateNum: d.getDate(),
                    percent,
                    lecture
                });
                totalPercent += percent;
            }
            const weekPercent = totalPercent / 7;
            const todayPercent = weekDays.find(d => d.dateNum === new Date().getDate())?.percent || 0;
            const monthPercent = weekPercent; // упрощённо
            const lectureToday = weekDays.find(d => d.dateNum === new Date().getDate())?.lecture || null;
            const todayDoneIds = todayPage ? todayPage.properties.Сделано.relation.map(r => r.id) : [];

            res.json({
                ids,
                routines,
                weekDays,
                todayPercent,
                weekPercent,
                monthPercent,
                lectureToday,
                todayRecordId: todayPage.id,
                todayDoneIds
            });
        }
        else if (action === 'toggle') {
            const day = await notionRequest(`pages/${dayId}`);
            const currentDone = day.properties.Сделано.relation.map(r => r.id);
            let newDone = [...currentDone];
            if (completed && !currentDone.includes(routineId)) newDone.push(routineId);
            else if (!completed && currentDone.includes(routineId)) newDone = newDone.filter(id => id !== routineId);
            await notionRequest(`pages/${dayId}`, 'PATCH', {
                properties: { 'Сделано': { relation: newDone.map(id => ({ id })) } }
            });
            res.json({ success: true });
        }
        else {
            res.status(400).json({ error: 'unknown action' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}