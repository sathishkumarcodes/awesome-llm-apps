-- Update the handle_new_user function to also trigger welcome email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  supabase_url text;
  service_role_key text;
BEGIN
  -- Insert into profiles table
  INSERT INTO public.profiles (id, email, phone)
  VALUES (
    new.id, 
    new.email,
    new.phone
  );

  -- Get environment variables
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.service_role_key', true);

  -- Call the send-welcome-email edge function asynchronously
  -- Only if email exists
  IF new.email IS NOT NULL THEN
    PERFORM
      net.http_post(
        url := supabase_url || '/functions/v1/send-welcome-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_role_key
        ),
        body := jsonb_build_object(
          'email', new.email
        )
      );
  END IF;

  RETURN new;
END;
$function$;