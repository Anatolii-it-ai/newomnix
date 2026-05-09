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
  score SMALLINT NOT NULL DEFAULT 5 CHECK (score BETWEEN 1 AND 10),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, sphere)
);

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
  estimate_min INTEGER,
  actual_min INTEGER,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON public.tasks(user_id, status);

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

-- =====================================================================
-- ROW-LEVEL SECURITY
-- =====================================================================
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tools          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_tools     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wheel_scores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habits         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications  ENABLE ROW LEVEL SECURITY;

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
    'wheel_scores', 'goals', 'tasks', 'habits',
    'transactions', 'health_logs', 'reviews', 'journal', 'notifications'
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

  -- Wheel of balance (5 baseline)
  FOREACH sphere IN ARRAY spheres LOOP
    INSERT INTO public.wheel_scores (user_id, sphere, score)
    VALUES (NEW.id, sphere, 5)
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
  ('habits',       'Привычки',      'Цепочки дней и трекер ежедневных практик', '∞'),
  ('finances',     'Финансы',       'Бюджет, траты и подушка безопасности', '$'),
  ('health',       'Здоровье',      'Сон, вода, шаги, настроение, паттерны', '♡'),
  ('reviews',      'Обзоры',        'Еженедельная и месячная ретроспектива', '↻'),
  ('journal',      'Дневник',       'Заметки, благодарности, идеи', '✎'),
  ('ai',           'AI-ассистент',  'Проактивные напоминания и инсайты', '✦'),
  ('gamification', 'Геймификация',  'Очки, уровни, личный аватар', '★')
ON CONFLICT (slug) DO NOTHING;
