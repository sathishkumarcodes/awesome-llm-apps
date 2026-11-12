-- Add phone column to profiles table
ALTER TABLE public.profiles ADD COLUMN phone text;

-- Create index for phone lookups
CREATE INDEX idx_profiles_phone ON public.profiles(phone);

-- Update the handle_new_user function to include phone number
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, phone)
  VALUES (
    new.id, 
    new.email,
    new.phone
  );
  RETURN new;
END;
$function$;