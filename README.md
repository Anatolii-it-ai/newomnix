# newOmnix — деплой OmnixOS на Vercel

Статический фронтенд OmnixOS, готовый к загрузке на [Vercel](https://vercel.com).

## Что внутри

- HTML-страницы: `index.html`, `login.html`, `register.html`, `forgot.html`, `reset.html`, `verify.html`, `dashboard.html`, `admin.html`, `tool.html`
- Стили: `styles.css`, `app.css`
- Скрипты: `auth.js` (общие хелперы), `script.js` (лендинг), `tools.js` (инструменты)
- Логотип: `logo.svg`
- Конфиг Vercel: `vercel.json` (заголовки безопасности + кеш статики)

## Деплой на Vercel

### Вариант 1 — через CLI (быстро)

```bash
npm i -g vercel
cd newOmnix
vercel        # первый раз — войдёт в аккаунт и привяжет проект
vercel --prod # продакшен-деплой
```

### Вариант 2 — через GitHub (рекомендуется)

1. Создай репозиторий на GitHub и запушь содержимое папки `newOmnix/`.
2. На [vercel.com/new](https://vercel.com/new) выбери этот репозиторий.
3. Framework Preset: **Other**.
4. Build Command: оставь пустым (статика).
5. Output Directory: оставь пустым (корень).
6. Жми **Deploy** — через ~30 секунд получишь URL `*.vercel.app`.

### Вариант 3 — drag & drop

1. Заархивируй `newOmnix/` в zip.
2. На [vercel.com/new](https://vercel.com/new) перетащи zip.
3. Готово.

## Подключение домена (хостинг)

После деплоя:

1. Открой проект на vercel.com → вкладка **Settings → Domains**.
2. Добавь свой домен (например `omnix.example.com`).
3. У регистратора домена пропиши DNS-записи, которые покажет Vercel:
   - либо `A 76.76.21.21` для apex-домена,
   - либо `CNAME cname.vercel-dns.com` для поддомена.
4. SSL Vercel выпустит автоматически.

## AI-ассистент (чат) — бесплатный Groq

Инструмент «AI-ассистент» содержит чат на бесплатной модели [Groq](https://groq.com).
Чтобы он заработал:

1. Получи бесплатный API-ключ: <https://console.groq.com/keys> (вид `gsk_...`).
2. На Vercel → проект → **Settings → Environment Variables** добавь:
   - `GROQ_API_KEY` = `gsk_...`
   - (необязательно) `GROQ_MODEL` = `llama-3.3-70b-versatile` (по умолчанию) или `llama-3.1-8b-instant` (быстрее, выше лимиты)
3. **Redeploy** проекта (Deployments → … → Redeploy), либо просто запушь любой коммит.

Ключ хранится в env на сервере и **не попадает в браузер** — запросы идут через
serverless-функцию `api/ai-chat.js`, которая ещё и проверяет, что пользователь залогинен
(Supabase-токен). Лимиты: у Groq свой бесплатный rate-limit + клиентский «мягкий»
дневной потолок (60 сообщений), переписки хранятся в localStorage браузера.

Альтернатива, если не хочешь функцию на Vercel — Supabase Edge Function (`supabase functions deploy ai-chat` + `supabase secrets set GROQ_API_KEY=...`), логику легко перенести.

## Важно про backend

Это **только фронтенд**. Авторизация, дашборд, инструменты — требуют Node-бэкенд из основного репозитория OmnixOS (`server/`, SQLite). На Vercel-демо страницы откроются, но `/api/*` запросы вернут 404 — фронтенд об этом предупреждает баннером.

Чтобы инструменты заработали, нужно:
- развернуть backend отдельно (Railway, Render, Fly.io, VPS),
- или переписать API в Vercel Serverless Functions + внешнюю БД (Vercel Postgres / Turso / Supabase).
