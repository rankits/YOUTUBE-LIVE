-- AI Interview Arena — bootstrap schema for a fresh Supabase project
-- Run in: Dashboard → SQL Editor → New query → Run

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ========== TABLES ==========

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  channel_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'interviewer',
  personality text NOT NULL DEFAULT '',
  background text NOT NULL DEFAULT '',
  knowledge_domain text NOT NULL DEFAULT '',
  system_instructions text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT 'openai/gpt-6-astra',
  voice_provider text NOT NULL DEFAULT 'edge',
  voice_id text NOT NULL DEFAULT '',
  response_style text NOT NULL DEFAULT 'conversational',
  accent_color text NOT NULL DEFAULT 'primary',
  language text NOT NULL DEFAULT 'en',
  creativity double precision NOT NULL DEFAULT 0.7,
  speaking_speed double precision NOT NULL DEFAULT 1,
  preset_avatar text,
  avatar_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  system_instructions text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  topic text NOT NULL,
  topics text[] NOT NULL DEFAULT '{}',
  custom_topic text,
  format text NOT NULL DEFAULT 'interview',
  difficulty text NOT NULL DEFAULT 'intermediate',
  interview_style text NOT NULL DEFAULT 'conversational',
  topic_depth text NOT NULL DEFAULT 'balanced',
  followup_frequency text NOT NULL DEFAULT 'medium',
  language text NOT NULL DEFAULT 'en',
  duration_minutes integer NOT NULL DEFAULT 15,
  max_questions integer NOT NULL DEFAULT 12,
  max_response_words integer NOT NULL DEFAULT 180,
  speaking_speed double precision NOT NULL DEFAULT 1,
  temperature double precision NOT NULL DEFAULT 0.7,
  text_only boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  turn_count integer NOT NULL DEFAULT 0,
  key_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  visuals jsonb NOT NULL DEFAULT '{"subtitles":true,"code":true,"diagrams":true,"keyPoints":true}'::jsonb,
  summary text,
  broadcast_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  interviewer_agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  candidate_agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  youtube_broadcast_url text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.interview_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running',
  turns integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  error text
);

CREATE TABLE IF NOT EXISTS public.interview_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.interview_sessions(id) ON DELETE SET NULL,
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  speaker text NOT NULL,
  content text NOT NULL,
  turn_index integer NOT NULL,
  topic text,
  key_point text,
  visual jsonb,
  model text,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  cost_credits double precision NOT NULL DEFAULT 0,
  audio_path text,
  audio_duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.interview_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idx integer NOT NULL,
  question text NOT NULL,
  options jsonb NOT NULL,
  answer integer NOT NULL,
  explanation text NOT NULL DEFAULT '',
  topic text,
  used boolean NOT NULL DEFAULT false,
  short_url text,
  short_publish_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.broadcast_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  interview_id uuid REFERENCES public.interviews(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  privacy text NOT NULL DEFAULT 'unlisted',
  status text NOT NULL DEFAULT 'created',
  stream_status text,
  approved_public boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  youtube_broadcast_id text,
  youtube_stream_id text,
  ingestion_address text,
  watch_url text,
  error text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scheduled_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  interview_id uuid REFERENCES public.interviews(id) ON DELETE SET NULL,
  interviewer_agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  candidate_agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  title text NOT NULL,
  topic text NOT NULL,
  format text NOT NULL DEFAULT 'interview',
  language text NOT NULL DEFAULT 'en',
  duration_minutes integer NOT NULL DEFAULT 15,
  privacy text NOT NULL DEFAULT 'unlisted',
  status text NOT NULL DEFAULT 'scheduled',
  scheduled_at timestamptz NOT NULL,
  auto_publish boolean NOT NULL DEFAULT false,
  requires_approval boolean NOT NULL DEFAULT false,
  approved boolean NOT NULL DEFAULT false,
  youtube_title text,
  youtube_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  interview_id uuid REFERENCES public.interviews(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'studio',
  mime_type text NOT NULL,
  storage_path text NOT NULL,
  size_bytes bigint,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.usage_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  interview_id uuid REFERENCES public.interviews(id) ON DELETE SET NULL,
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  kind text NOT NULL,
  model text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  audio_ms integer NOT NULL DEFAULT 0,
  cost_credits double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.integration_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  branding_text text NOT NULL DEFAULT 'AI Interview Arena',
  show_branding boolean NOT NULL DEFAULT true,
  daily_turn_limit integer NOT NULL DEFAULT 200,
  obs_fps integer NOT NULL DEFAULT 30,
  obs_resolution text NOT NULL DEFAULT '1280x720',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.voice_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  default_speed double precision NOT NULL DEFAULT 1,
  volume double precision NOT NULL DEFAULT 1,
  text_only_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_api_keys (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted jsonb NOT NULL DEFAULT '{}'::jsonb,
  prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.provider_quota (
  provider text PRIMARY KEY,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  return_to text NOT NULL DEFAULT '/',
  slot integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.youtube_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  channel_title text,
  channel_thumbnail text,
  status text NOT NULL DEFAULT 'connected',
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.youtube_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_refresh_token text NOT NULL,
  encrypted_access_token text,
  access_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.youtube_slot_tokens (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot integer NOT NULL CHECK (slot BETWEEN 2 AND 10),
  encrypted_refresh_token text NOT NULL,
  encrypted_access_token text,
  access_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, slot)
);

CREATE TABLE IF NOT EXISTS public.youtube_upload_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot integer NOT NULL,
  day text NOT NULL,
  uploads integer NOT NULL DEFAULT 0,
  exhausted boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, slot, day)
);

-- ========== SEED / TRIGGERS ==========

CREATE OR REPLACE FUNCTION public.seed_user_defaults(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.integration_settings (user_id)
  VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.voice_settings (user_id)
  VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.ai_agents WHERE user_id = _user_id) THEN
    INSERT INTO public.ai_agents (
      user_id, name, role, personality, background, knowledge_domain, system_instructions,
      model, voice_provider, voice_id, response_style, accent_color, preset_avatar
    ) VALUES
    (
      _user_id, 'Aria Kapoor', 'interviewer', 'Senior Technical Interviewer',
      'Engineering manager with 15 years of hiring experience at large product companies.',
      'Software engineering, system design, AI',
      'You are sharp, warm and curious. Ask one clear question at a time, dig into vague answers with follow-ups, and politely challenge anything that sounds wrong.',
      'openai/gpt-6-astra', 'edge', 'en-US-AriaNeural', 'conversational', 'primary', 'interviewer'
    ),
    (
      _user_id, 'Dev Malhotra', 'candidate', 'Senior Developer',
      'Full-stack engineer with 8 years building web platforms and ML-backed products.',
      'React, Node.js, cloud, applied AI',
      'You answer with confidence and real-world examples from your projects. Explain trade-offs, admit what you do not know, and push back respectfully when you disagree.',
      'google/gemini-3.8-flash', 'edge', 'en-US-GuyNeural', 'detailed', 'secondary', 'candidate'
    ),
    (
      _user_id, 'Rankit', 'interviewer', 'AI Teacher',
      'Friendly teacher who explains courses step by step with simple examples, for Hindi, English and Hinglish learners.',
      'Programming, computer science, competitive exams',
      'You are Rankit, a patient and energetic teacher. Explain one concept at a time, use real-life examples and code/diagrams, check understanding, and keep the class engaging.',
      'openai/gpt-6-astra', 'edge', 'hi-IN-MadhurNeural', 'detailed', 'primary', 'rankit3d'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  PERFORM public.seed_user_defaults(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill existing logged-in users
INSERT INTO public.profiles (id, display_name)
SELECT id, COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'display_name', split_part(email, '@', 1))
FROM auth.users
ON CONFLICT (id) DO NOTHING;

SELECT public.seed_user_defaults(id) FROM auth.users;

-- ========== RLS ==========

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_quota ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_slot_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_upload_usage ENABLE ROW LEVEL SECURITY;

-- Drop old policies if re-running
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

CREATE POLICY profiles_own ON public.profiles FOR ALL TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY agents_own ON public.ai_agents FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY agent_prompts_own ON public.agent_prompts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY interviews_own ON public.interviews FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY interview_sessions_own ON public.interview_sessions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY interview_messages_own ON public.interview_messages FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY interview_questions_own ON public.interview_questions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY broadcasts_own ON public.broadcast_sessions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY scheduled_own ON public.scheduled_interviews FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY recordings_own ON public.recordings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY usage_select_own ON public.usage_analytics FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY integ_own ON public.integration_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY voice_own ON public.voice_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY yt_conn_own ON public.youtube_connections FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Service-role-only tables intentionally have no authenticated policies
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_user_defaults(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- ========== STORAGE BUCKETS ==========

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('agent-avatars', 'agent-avatars', false),
  ('interview-audio', 'interview-audio', false),
  ('recordings', 'recordings', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS agent_avatars_own ON storage.objects;
CREATE POLICY agent_avatars_own ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'agent-avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'agent-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS interview_audio_own ON storage.objects;
CREATE POLICY interview_audio_own ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'interview-audio' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'interview-audio' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS recordings_bucket_own ON storage.objects;
CREATE POLICY recordings_bucket_own ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'recordings' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'recordings' AND (storage.foldername(name))[1] = auth.uid()::text);
