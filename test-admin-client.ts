import { createAdminClient } from './src/lib/supabase/admin';

try {
  const adminClient = createAdminClient();
  void adminClient;
  console.log('✅ SUCCESS: Supabase admin client created successfully');
  console.log('   The fix for missing environment variables worked!');
  process.exit(0);
} catch (error: unknown) {
  console.error('❌ ERROR: Failed to create Supabase admin client:', error instanceof Error ? error.message : error);
  console.error('   This indicates the environment variable fix did not work.');
  process.exit(1);
}
