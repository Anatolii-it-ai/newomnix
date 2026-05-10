-- =====================================================================
-- Миграция: таблица reminders (напоминания по дате/времени)
-- Запусти этот файл в SQL-редакторе Supabase (или просто перезапусти
-- supabase-schema.sql — он идемпотентный).
-- =====================================================================

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

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reminders_select" ON public.reminders;
CREATE POLICY "reminders_select" ON public.reminders FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "reminders_insert" ON public.reminders;
CREATE POLICY "reminders_insert" ON public.reminders FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "reminders_update" ON public.reminders;
CREATE POLICY "reminders_update" ON public.reminders FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "reminders_delete" ON public.reminders;
CREATE POLICY "reminders_delete" ON public.reminders FOR DELETE USING (user_id = auth.uid() OR public.is_admin());
