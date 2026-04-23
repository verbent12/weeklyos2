# Weekly OS — Notion трекер

Автоматически создаёт базы данных в Notion, отслеживает ежедневную рутину, подтягивает темы лекций.

## Настройка
1. Создайте интеграцию Notion: https://www.notion.so/my-integrations → название `WeeklyOS`, получите `secret_...`
2. В Vercel добавьте переменную окружения `NOTION_TOKEN` = ваш секрет.
3. (Опционально) `NOTION_PARENT_PAGE_ID` = ID страницы Notion, где создать базы.
4. Задеплойте на Vercel.