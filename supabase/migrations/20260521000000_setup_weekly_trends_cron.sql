-- Set up weekly trends refresh via pg_cron
-- Runs every Monday at 6:00 AM UTC
-- Calls scheduled-refresh-trends edge function with IFFY_CRON_SECRET auth

DO $$
BEGIN
  PERFORM cron.unschedule('weekly-trends-refresh');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No existing cron job to unschedule';
END;
$$;

SELECT cron.schedule(
  'weekly-trends-refresh',
  '0 6 * * 1',
  $cron$
    SELECT net.http_post(
      url := 'https://hdfderbphdobomkdjypc.supabase.co/functions/v1/scheduled-refresh-trends',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-IFFY-CRON-SECRET', '5dd98118d4f580fb8546ee4ab86b2d65873475d6a68cb123d0a19ab02ec71b01c7ac8a'
      ),
      body := jsonb_build_object(
        'trigger', 'scheduled'
      )
    ) AS request_id;
  $cron$
);