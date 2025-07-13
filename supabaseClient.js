const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zhzcoibauxastltzfkyq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoemNvaWJhdXhhc3RsdHpma3lxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjQ0MTI4MSwiZXhwIjoyMDY4MDE3MjgxfQ.NIz3ZaFvrxTjNBFikqJxPCDg9FY2Bn2FNu05etF6ztE';

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;