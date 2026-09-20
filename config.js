// Configuration Supabase — à éditer avec les valeurs de votre propre projet.
// La clé 'anon' est faite pour être publique : la sécurité vient des règles RLS
// définies dans supabase/schema.sql, jamais de cette clé elle-même.
// Ne mettez JAMAIS la clé 'service_role' dans ce fichier ni dans ce dépôt.

var SUPABASE_URL = "https://vktuwoyikseadvfzgacd.supabase.co";
var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrdHV3b3lpa3NlYWR2ZnpnYWNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3Mzk5ODQsImV4cCI6MjEwNTMxNTk4NH0.etKO1Ruho3Uj80RpS8v4M0TAlQW9WJY39z55j6_pPUs";
var sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
