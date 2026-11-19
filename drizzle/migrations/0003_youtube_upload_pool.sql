ALTER TABLE public.oauth_states ADD COLUMN IF NOT EXISTS slot integer NOT NULL DEFAULT 1;

CREATE TABLE public.youtube_slot_tokens (
  user_id uuid NOT NULL,
  slot integer NOT NULL CHECK (slot BETWEEN 2 AND 10),
  encrypted_refresh_token text NOT NULL,
  encrypted_access_token text,
  access_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, slot)
);
GRANT ALL ON public.youtube_slot_tokens TO service_role;
ALTER TABLE public.youtube_slot_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.youtube_upload_usage (
  user_id uuid NOT NULL,
  slot integer NOT NULL,
  day text NOT NULL,
  uploads integer NOT NULL DEFAULT 0,
  exhausted boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, slot, day)
);
GRANT ALL ON public.youtube_upload_usage TO service_role;
ALTER TABLE public.youtube_upload_usage ENABLE ROW LEVEL SECURITY;