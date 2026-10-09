import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabaseUrl = 'https://uzjvaijepqfiogwncdjn.supabase.co';
  const secretKey = 'sb_secret_SFQCih3LMhNfAN54WgDxqg_Zi_-aiON';
  const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6anZhaWplcHFmaW9nd25jZGpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDM0NjA2MSwiZXhwIjoyMTA1OTIyMDYxfQ.IYSiGw9jD6Tmdaks8rUS-8RpdXA1T9vhm4CU9Gh2CCc';

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  
  const password = 'Password123!';

  // Create Client
  const clientEmail = 'client.qa.test@example.com';
  const { data: clientAuth, error: clientErr } = await adminSupabase.auth.admin.createUser({
    email: clientEmail,
    password: password,
    email_confirm: true,
    user_metadata: { role: 'client', first_name: 'Test', last_name: 'Client' }
  });

  if (clientErr) console.error('Client Auth Error:', clientErr.message);
  else {
    console.log('Client Auth created:', clientAuth.user.id);
    await adminSupabase.from('users').upsert({
      id: clientAuth.user.id, email: clientEmail, role: 'client', status: 'active', is_email_verified: true
    });
    await adminSupabase.from('profiles').upsert({
      user_id: clientAuth.user.id, first_name: 'Test', last_name: 'Client', display_name: 'Test Client', timezone: 'UTC', country_code: 'US'
    });
  }

  // Create Consultant
  const consultantEmail = 'consultant.qa.test@example.com';
  const { data: consultantAuth, error: consultantErr } = await adminSupabase.auth.admin.createUser({
    email: consultantEmail,
    password: password,
    email_confirm: true,
    user_metadata: { role: 'consultant', first_name: 'Test', last_name: 'Consultant' }
  });

  if (consultantErr) console.error('Consultant Auth Error:', consultantErr.message);
  else {
    console.log('Consultant Auth created:', consultantAuth.user.id);
    await adminSupabase.from('users').upsert({
      id: consultantAuth.user.id, email: consultantEmail, role: 'consultant', status: 'active', is_email_verified: true
    });
    await adminSupabase.from('profiles').upsert({
      user_id: consultantAuth.user.id, first_name: 'Test', last_name: 'Consultant', display_name: 'Test Consultant', timezone: 'UTC', country_code: 'US'
    });
  }
  console.log('Done creating test users.');
}

main().catch(console.error);
