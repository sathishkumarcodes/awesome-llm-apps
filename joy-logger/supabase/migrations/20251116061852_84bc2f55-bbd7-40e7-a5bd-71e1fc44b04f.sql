-- Add foreign key relationship between user_preferences and profiles
ALTER TABLE public.user_preferences
ADD CONSTRAINT user_preferences_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;