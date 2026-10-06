import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import supabase from '../config/supabase';
import { clerkClient } from '@clerk/express';

async function seed() {
  const email = 'test.extension@solase.studio'.toLowerCase().trim();
  const password = 'test1234';
  const name = 'Extension Reviewer';

  console.log(`[Seed] Setting up test account: ${email}`);

  // 1. Hash password
  const password_hash = await bcrypt.hash(password, 12);

  // 2. Try creating or updating in Clerk if configured
  let clerkId: string | null = null;
  if (process.env.CLERK_SECRET_KEY) {
    try {
      console.log('[Seed] Checking Clerk user list...');
      const clerkUsers = await clerkClient.users.getUserList({
        emailAddress: [email],
      });

      if (clerkUsers.data && clerkUsers.data.length > 0) {
        clerkId = clerkUsers.data[0].id;
        console.log(`[Seed] Clerk user exists (${clerkId}). Updating password...`);
        await clerkClient.users.updateUser(clerkId, {
          password,
        });
      } else {
        console.log('[Seed] Creating new user in Clerk...');
        const newClerkUser = await clerkClient.users.createUser({
          emailAddress: [email],
          password,
          firstName: 'Extension',
          lastName: 'Reviewer',
          skipPasswordChecks: true,
        });
        clerkId = newClerkUser.id;
        console.log(`[Seed] Clerk user created with ID: ${clerkId}`);
      }
    } catch (clerkErr: any) {
      console.warn('[Seed] Clerk setup warning (will proceed with Supabase):', clerkErr?.errors || clerkErr?.message);
    }
  }

  // 3. Upsert user in Supabase
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  let userId: string;

  if (existingUser) {
    userId = existingUser.id;
    console.log(`[Seed] Existing Supabase user found (${userId}). Updating...`);
    const { error: updateErr } = await supabase
      .from('users')
      .update({
        name,
        password_hash,
        email_verified: true,
        clerk_id: clerkId || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateErr) throw updateErr;
  } else {
    userId = uuidv4();
    console.log(`[Seed] Creating new Supabase user (${userId})...`);
    const { error: insertErr } = await supabase
      .from('users')
      .insert({
        id: userId,
        email,
        name,
        password_hash,
        email_verified: true,
        clerk_id: clerkId || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (insertErr) throw insertErr;
  }

  console.log(`[Seed] User ${email} successfully ready!`);

  // 4. Create default Website Group for user
  const { data: existingGroup } = await supabase
    .from('website_groups')
    .select('id')
    .eq('user_id', userId)
    .eq('name', 'Social Media Distractions')
    .maybeSingle();

  const blockedSites = ['facebook.com', 'instagram.com', 'reddit.com'];

  if (!existingGroup) {
    await supabase.from('website_groups').insert({
      id: uuidv4(),
      user_id: userId,
      name: 'Social Media Distractions',
      websites: blockedSites,
      is_default: true,
    });
    console.log('[Seed] Created website group "Social Media Distractions"');
  } else {
    await supabase.from('website_groups').update({
      websites: blockedSites,
    }).eq('id', existingGroup.id);
  }

  // 5. Clean up old test sessions for this user to ensure clean non-overlapping state
  const { error: delErr } = await supabase
    .from('sessions')
    .delete()
    .eq('user_id', userId);

  if (delErr) {
    console.warn('[Seed] Warning clearing old sessions:', delErr);
  }

  // 6. Create Non-Overlapping 1, 2, and 3-hour sessions occurring everyday
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  const sessionConfigs = [
    {
      name: 'Morning Deep Work',
      duration: 60, // 1 hour
      start_time: '09:00', // 9:00 AM - 10:00 AM
      allow_breaks: true,
      max_break_minutes: 15,
    },
    {
      name: 'Core Focus Sprint',
      duration: 120, // 2 hours
      start_time: '11:00', // 11:00 AM - 1:00 PM
      allow_breaks: true,
      max_break_minutes: 30,
    },
    {
      name: 'Afternoon Immersion',
      duration: 180, // 3 hours
      start_time: '14:00', // 2:00 PM - 5:00 PM
      allow_breaks: true,
      max_break_minutes: 45,
    },
    {
      name: 'Evening Wind-Down Focus',
      duration: 60, // 1 hour
      start_time: '19:00', // 7:00 PM - 8:00 PM
      allow_breaks: true,
      max_break_minutes: 15,
    },
    {
      name: 'Night Owl Deep Session',
      duration: 120, // 2 hours
      start_time: '21:00', // 9:00 PM - 11:00 PM
      allow_breaks: true,
      max_break_minutes: 30,
    },
  ];

  for (const s of sessionConfigs) {
    const sessionId = uuidv4();
    const { error: sessErr } = await supabase.from('sessions').insert({
      id: sessionId,
      user_id: userId,
      name: s.name,
      duration: s.duration,
      schedule: 'recurring',
      schedule_days: days,
      start_time: s.start_time,
      mobile_focus: true,
      browser_focus: true,
      blocked_websites: blockedSites,
      allow_breaks: s.allow_breaks,
      max_break_minutes: s.max_break_minutes,
      status: 'scheduled',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (sessErr) {
      console.error(`[Seed] Error creating session "${s.name}":`, sessErr);
    } else {
      console.log(`[Seed] Created session "${s.name}" (${s.duration / 60}h, ${s.start_time}) everyday with blocked sites:`, blockedSites);
    }
  }

  console.log('\n======================================================');
  console.log('✅ TEST ACCOUNT & SESSIONS SUCCESSFULLY CREATED!');
  console.log(`Email:    ${email}`);
  console.log(`Password: ${password}`);
  console.log('Sessions: Non-overlapping 1h, 2h, 3h sessions every day');
  console.log('Blocked:  facebook.com, instagram.com, reddit.com');
  console.log('======================================================\n');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[Seed Error]:', err);
    process.exit(1);
  });
