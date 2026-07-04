import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../../../../projects/App projects/focussive/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  console.log('Testing website group creation...');
  const { data: group, error: groupErr } = await supabase
    .from('website_groups')
    .insert({
      id: uuidv4(),
      user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', // Dummy UUID
      name: 'Test Group',
      websites: ['example.com'],
      is_default: false
    })
    .select()
    .single();

  if (groupErr) {
    console.error('Group Error:', groupErr);
  } else {
    console.log('Group created:', group);
  }

  console.log('Testing session creation...');
  const { data: session, error: sessionErr } = await supabase
    .from('sessions')
    .insert({
      id: uuidv4(),
      user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'Test Session',
      duration: 30,
      schedule: 'today',
      schedule_days: [],
      start_time: '10:00',
      mobile_focus: false,
      browser_focus: true,
      app_group_ids: [],
      blocked_websites: [],
      status: 'scheduled'
    })
    .select()
    .single();

  if (sessionErr) {
    console.error('Session Error:', sessionErr);
  } else {
    console.log('Session created:', session);
  }
}

run();
