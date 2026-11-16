DO $migration$
DECLARE
  definition text;
BEGIN
  SELECT pg_get_functiondef('public.submit_audience(text,text,text,text,text,text,text,text)'::regprocedure) INTO definition;
  IF position('''vote'',''confession'',''thisorthat'',''hottake'',''chaos'',''problem'',''question''' in definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected submit_audience definition';
  END IF;
  definition := replace(definition, '''vote'',''confession'',''thisorthat'',''hottake'',''chaos'',''problem'',''question''', '''vote'',''confession'',''thisorthat'',''hottake'',''chaos'',''problem'',''question'',''card''');
  definition := replace(definition, '_link := _kind in (''confession'',''thisorthat'',''hottake'',''chaos'');', '_link := _kind in (''confession'',''thisorthat'',''hottake'',''chaos'',''card'');');
  definition := replace(definition, 'elsif _kind = ''hottake'' then', 'elsif _kind in (''hottake'', ''card'') then');
  EXECUTE definition;
END
$migration$;
REVOKE ALL ON FUNCTION public.submit_audience(text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_audience(text,text,text,text,text,text,text,text) TO anon, authenticated;