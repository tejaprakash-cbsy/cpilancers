"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAdminClient = createAdminClient;
var supabase_js_1 = require("@supabase/supabase-js");
// Warning: Never expose SUPABASE_SERVICE_ROLE_KEY to the client!
function createAdminClient() {
    var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    var serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing Supabase Service Role Key or URL for admin client.');
    }
    return (0, supabase_js_1.createClient)(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
