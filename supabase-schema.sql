-- =====================================================================
-- OmnixOS · Supabase schema (Postgres)
-- Запусти ВЕСЬ файл целиком в Supabase Dashboard → SQL Editor → RUN.
-- Можно безопасно прогнать повторно — все CREATE используют IF NOT EXISTS
-- и DROP POLICY IF EXISTS для идемпотентности.
-- =====================================================================

-- ========================
-- 1. PROFILES (расширение auth.users)
-- ========================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  avatar TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- Безопасная функция-проверка администратора (без рекурсии RLS).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;

-- ========================
-- 2. TOOLS catalog (общий каталог инструментов)
-- ========================
CREATE TABLE IF NOT EXISTS public.tools (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_tools (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_id BIGINT NOT NULL REFERENCES public.tools(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tool_id)
);

-- ========================
-- 3. WHEEL OF BALANCE
-- ========================
CREATE TABLE IF NOT EXISTS public.wheel_scores (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sphere TEXT NOT NULL,
  score SMALLINT NOT NULL DEFAULT 50 CHECK (score BETWEEN 0 AND 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, sphere)
);

-- Кастомизируемое колесо баланса: имя, цвет, порядок, балл
CREATE TABLE IF NOT EXISTS public.wheel_spheres (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#7C5CFF',
  sort_order INTEGER NOT NULL DEFAULT 0,
  score SMALLINT NOT NULL DEFAULT 50 CHECK (score BETWEEN 0 AND 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_wheel_spheres_user ON public.wheel_spheres(user_id, sort_order);

-- Миграция: переносим существующие wheel_scores → wheel_spheres с дефолтными цветами/порядком
DO $$
DECLARE
  default_colors JSONB := '{"Здоровье":"#EF4444","Работа":"#22D3EE","Деньги":"#10B981","Отношения":"#EC4899","Развитие":"#7C5CFF","Отдых":"#F59E0B","Творчество":"#06B6D4","Дух":"#8B5CF6"}'::JSONB;
  default_order JSONB := '{"Здоровье":0,"Работа":1,"Деньги":2,"Отношения":3,"Развитие":4,"Отдых":5,"Творчество":6,"Дух":7}'::JSONB;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='wheel_scores') THEN
    INSERT INTO public.wheel_spheres (user_id, name, color, sort_order, score, updated_at)
    SELECT
      ws.user_id,
      ws.sphere,
      COALESCE(default_colors->>ws.sphere, '#7C5CFF'),
      COALESCE((default_order->>ws.sphere)::int, 99),
      ws.score,
      ws.updated_at
    FROM public.wheel_scores ws
    ON CONFLICT (user_id, name) DO NOTHING;
  END IF;
END $$;

-- Миграция со старой шкалы 1–10 на 0–100 (безопасна для повторного запуска).
DO $$
BEGIN
  -- Снять старый CHECK, если он есть
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'wheel_scores' AND constraint_name = 'wheel_scores_score_check'
  ) THEN
    ALTER TABLE public.wheel_scores DROP CONSTRAINT wheel_scores_score_check;
  END IF;

  -- Если ещё не мигрировали — умножим старые значения 1–10 на 10
  IF EXISTS (SELECT 1 FROM public.wheel_scores WHERE score BETWEEN 1 AND 10) THEN
    UPDATE public.wheel_scores SET score = score * 10 WHERE score BETWEEN 1 AND 10;
  END IF;

  -- Дефолт 50, новый CHECK 0..100
  ALTER TABLE public.wheel_scores ALTER COLUMN score SET DEFAULT 50;
  ALTER TABLE public.wheel_scores ADD CONSTRAINT wheel_scores_score_check CHECK (score BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN
  -- CHECK уже стоит — пропускаем
  NULL;
END $$;

-- ========================
-- 4. GOALS / TASKS
-- ========================
CREATE TABLE IF NOT EXISTS public.goals (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sphere TEXT,
  title TEXT NOT NULL,
  description TEXT,
  progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_goals_user ON public.goals(user_id);

CREATE TABLE IF NOT EXISTS public.tasks (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id BIGINT REFERENCES public.goals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  sphere TEXT,
  quadrant SMALLINT NOT NULL DEFAULT 2 CHECK (quadrant BETWEEN 1 AND 4),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  due_date DATE,
  due_time TIME,
  estimate_min INTEGER,
  actual_min INTEGER,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON public.tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON public.tasks(user_id, due_date);

-- Безопасное добавление due_time для существующих установок
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS due_time TIME;
-- Подзадачи (иерархия)
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS parent_id BIGINT REFERENCES public.tasks(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON public.tasks(parent_id);
-- Повторяемость: 'none' | 'daily' | 'weekly' | 'monthly'
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS recurrence TEXT;
-- Горизонт цели: '1y' | '5y' | '10y' | '15y' | NULL (краткосрочная)
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS horizon TEXT;

-- ========================
-- 5. HABITS
-- ========================
CREATE TABLE IF NOT EXISTS public.habits (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  time_of_day TEXT NOT NULL DEFAULT 'morning' CHECK (time_of_day IN ('morning', 'day', 'evening')),
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_habits_user ON public.habits(user_id, archived);

CREATE TABLE IF NOT EXISTS public.habit_logs (
  habit_id BIGINT NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  PRIMARY KEY (habit_id, date)
);

-- ========================
-- 6. FINANCES
-- ========================
CREATE TABLE IF NOT EXISTS public.transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL CHECK (amount > 0),  -- в копейках
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  category TEXT,
  note TEXT,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tx_user_date ON public.transactions(user_id, date);

-- ========================
-- 7. HEALTH
-- ========================
CREATE TABLE IF NOT EXISTS public.health_logs (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  sleep_hours REAL,
  water_glasses INTEGER,
  steps INTEGER,
  mood SMALLINT CHECK (mood BETWEEN 1 AND 5),
  weight REAL,
  blood_pressure TEXT,
  PRIMARY KEY (user_id, date)
);

-- ========================
-- 8. REVIEWS / JOURNAL
-- ========================
CREATE TABLE IF NOT EXISTS public.reviews (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period IN ('week', 'month')),
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  did TEXT,
  didnt TEXT,
  why TEXT,
  change TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.journal (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'gratitude', 'idea')),
  title TEXT,
  body TEXT NOT NULL,
  tags TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_journal_user ON public.journal(user_id, created_at DESC);

-- ========================
-- 9. NOTIFICATIONS (для будущих фич)
-- ========================
CREATE TABLE IF NOT EXISTS public.notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON public.notifications(user_id, read);

-- ========================
-- 10. REMINDERS (напоминания по дате/времени)
-- ========================
CREATE TABLE IF NOT EXISTS public.reminders (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  remind_at TIMESTAMPTZ NOT NULL,
  repeat TEXT NOT NULL DEFAULT 'none' CHECK (repeat IN ('none', 'daily', 'weekly', 'monthly')),
  fired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON public.reminders(user_id, remind_at);

-- =====================================================================
-- ROW-LEVEL SECURITY
-- =====================================================================
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tools          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_tools     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wheel_scores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wheel_spheres  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habits         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders      ENABLE ROW LEVEL SECURITY;

-- ----- PROFILES -----
DROP POLICY IF EXISTS "profiles_self_read" ON public.profiles;
CREATE POLICY "profiles_self_read" ON public.profiles FOR SELECT USING (id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ----- TOOLS (каталог) -----
DROP POLICY IF EXISTS "tools_read_authenticated" ON public.tools;
CREATE POLICY "tools_read_authenticated" ON public.tools FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS "tools_admin_write" ON public.tools;
CREATE POLICY "tools_admin_write" ON public.tools FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ----- USER_TOOLS -----
DROP POLICY IF EXISTS "user_tools_self" ON public.user_tools;
CREATE POLICY "user_tools_self" ON public.user_tools FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "user_tools_admin_write" ON public.user_tools;
CREATE POLICY "user_tools_admin_write" ON public.user_tools FOR INSERT WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "user_tools_admin_delete" ON public.user_tools;
CREATE POLICY "user_tools_admin_delete" ON public.user_tools FOR DELETE USING (public.is_admin());

-- ----- Generic per-user policies (генератор) -----
-- Приём: на каждой пользовательской таблице — 4 политики (SELECT/INSERT/UPDATE/DELETE),
-- where user_id = auth.uid() OR is_admin().
DO $$
DECLARE
  t TEXT;
  user_tables TEXT[] := ARRAY[
    'wheel_scores', 'wheel_spheres', 'goals', 'tasks', 'habits',
    'transactions', 'health_logs', 'reviews', 'journal', 'notifications', 'reminders'
  ];
BEGIN
  FOREACH t IN ARRAY user_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_select" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "%1$s_select" ON public.%1$I FOR SELECT USING (user_id = auth.uid() OR public.is_admin())', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_insert" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "%1$s_insert" ON public.%1$I FOR INSERT WITH CHECK (user_id = auth.uid())', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_update" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "%1$s_update" ON public.%1$I FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_delete" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "%1$s_delete" ON public.%1$I FOR DELETE USING (user_id = auth.uid() OR public.is_admin())', t);
  END LOOP;
END $$;

-- ----- HABIT_LOGS (через JOIN) -----
DROP POLICY IF EXISTS "habit_logs_owner_select" ON public.habit_logs;
CREATE POLICY "habit_logs_owner_select" ON public.habit_logs FOR SELECT
  USING (habit_id IN (SELECT id FROM public.habits WHERE user_id = auth.uid()) OR public.is_admin());
DROP POLICY IF EXISTS "habit_logs_owner_insert" ON public.habit_logs;
CREATE POLICY "habit_logs_owner_insert" ON public.habit_logs FOR INSERT
  WITH CHECK (habit_id IN (SELECT id FROM public.habits WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "habit_logs_owner_delete" ON public.habit_logs;
CREATE POLICY "habit_logs_owner_delete" ON public.habit_logs FOR DELETE
  USING (habit_id IN (SELECT id FROM public.habits WHERE user_id = auth.uid()));

-- =====================================================================
-- AUTO-SEED для нового пользователя
-- При INSERT в auth.users автоматически:
--   - создаём профиль
--   - выдаём доступ ко всем enabled tools
--   - сидим колесо баланса (8 сфер по 5 баллов)
--   - добавляем 4 базовые привычки
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sphere TEXT;
  spheres TEXT[] := ARRAY['Здоровье', 'Работа', 'Деньги', 'Отношения', 'Развитие', 'Отдых', 'Творчество', 'Дух'];
BEGIN
  -- Profile
  INSERT INTO public.profiles (id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  -- Grant access to all enabled tools
  INSERT INTO public.user_tools (user_id, tool_id)
    SELECT NEW.id, t.id FROM public.tools t WHERE t.enabled
  ON CONFLICT DO NOTHING;

  -- Wheel of balance (50 baseline, шкала 0–100)
  -- Seed defaults в новую таблицу wheel_spheres с цветами и порядком
  IF NOT EXISTS (SELECT 1 FROM public.wheel_spheres WHERE user_id = NEW.id) THEN
    INSERT INTO public.wheel_spheres (user_id, name, color, sort_order, score) VALUES
      (NEW.id, 'Здоровье',   '#EF4444', 0, 50),
      (NEW.id, 'Работа',     '#22D3EE', 1, 50),
      (NEW.id, 'Деньги',     '#10B981', 2, 50),
      (NEW.id, 'Отношения',  '#EC4899', 3, 50),
      (NEW.id, 'Развитие',   '#7C5CFF', 4, 50),
      (NEW.id, 'Отдых',      '#F59E0B', 5, 50),
      (NEW.id, 'Творчество', '#06B6D4', 6, 50),
      (NEW.id, 'Дух',        '#8B5CF6', 7, 50)
    ON CONFLICT DO NOTHING;
  END IF;
  -- Backward-compat: дублируем в старую wheel_scores (на случай если что-то ещё читает её)
  FOREACH sphere IN ARRAY spheres LOOP
    INSERT INTO public.wheel_scores (user_id, sphere, score)
    VALUES (NEW.id, sphere, 50)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Default habits (только если у юзера ещё нет привычек)
  IF NOT EXISTS (SELECT 1 FROM public.habits WHERE user_id = NEW.id) THEN
    INSERT INTO public.habits (user_id, name, icon, time_of_day) VALUES
      (NEW.id, 'Зарядка', '💪', 'morning'),
      (NEW.id, 'Стакан воды', '💧', 'morning'),
      (NEW.id, 'Чтение 30 минут', '📖', 'evening'),
      (NEW.id, 'Медитация', '🧘', 'morning');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================
-- SEED данных (только если таблица пустая)
-- =====================================================================
INSERT INTO public.tools (slug, name, description, icon) VALUES
  ('dashboard',    'Дашборд',       'Пульс жизни: колесо баланса и приоритеты дня', '◎'),
  ('goals',        'Цели',          'Карта жизни: цели → проекты → задачи → шаги', '◇'),
  ('tasks',        'Задачи',        'Умный планировщик с матрицей Эйзенхауэра', '▦'),
  ('planner',      'Планировщик',   'Календарь задач с цветами по срочности и временем', '⊞'),
  ('habits',       'Привычки',      'Цепочки дней и трекер ежедневных практик', '∞'),
  ('finances',     'Финансы',       'Бюджет, траты и подушка безопасности', '$'),
  ('health',       'Здоровье',      'Сон, вода, шаги, настроение, паттерны', '♡'),
  ('reviews',      'Обзоры',        'Еженедельная и месячная ретроспектива', '↻'),
  ('journal',      'Дневник',       'Заметки, благодарности, идеи', '✎'),
  ('ai',           'AI-ассистент',  'Проактивные напоминания и инсайты', '✦'),
  ('gamification', 'Геймификация',  'Очки, уровни, личный аватар', '★')
ON CONFLICT (slug) DO NOTHING;

-- Раздать planner всем существующим пользователям (новые получат через trigger)
INSERT INTO public.user_tools (user_id, tool_id)
SELECT p.id, t.id
FROM public.profiles p
CROSS JOIN public.tools t
WHERE t.slug = 'planner'
ON CONFLICT DO NOTHING;

-- =====================================================================
-- ADMIN RPC: список пользователей (с email из auth.users), статистика, удаление
-- =====================================================================
-- Самоудаление аккаунта (юзер удаляет себя)
CREATE OR REPLACE FUNCTION public.delete_self()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  DELETE FROM auth.users WHERE id = uid;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_self() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id UUID, email TEXT, name TEXT, avatar TEXT, role TEXT, status TEXT,
  created_at TIMESTAMPTZ, last_login_at TIMESTAMPTZ, email_confirmed_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT p.id, u.email::TEXT, p.name, p.avatar, p.role, p.status,
      p.created_at, p.last_login_at, u.email_confirmed_at
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    ORDER BY p.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_stats()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT json_build_object(
    'users_total',   (SELECT COUNT(*) FROM public.profiles),
    'users_active',  (SELECT COUNT(*) FROM public.profiles WHERE status = 'active'),
    'users_blocked', (SELECT COUNT(*) FROM public.profiles WHERE status = 'blocked'),
    'admins',        (SELECT COUNT(*) FROM public.profiles WHERE role = 'admin'),
    'tools_total',   (SELECT COUNT(*) FROM public.tools),
    'tools_enabled', (SELECT COUNT(*) FROM public.tools WHERE enabled),
    'new_today',     (SELECT COUNT(*) FROM public.profiles WHERE created_at > NOW() - INTERVAL '24 hours')
  ) INTO result;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_user(target_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF target_id = auth.uid() THEN
    RAISE EXCEPTION 'cant_delete_self' USING ERRCODE = '22023';
  END IF;
  DELETE FROM auth.users WHERE id = target_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;
