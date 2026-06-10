const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
}

// Sempre inclui ws como transport (obrigatorio no Node.js < 22)
function makeClient(url, key, opts = {}) {
  return createClient(url, key, {
    ...opts,
    realtime: { transport: WebSocket, ...(opts.realtime || {}) },
  });
}

const supabase = makeClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

module.exports = supabase;
module.exports.makeClient = makeClient;
