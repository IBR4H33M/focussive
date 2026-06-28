import { v4 as uuidv4 } from 'uuid';
import supabase from './config/supabase.js';

async function run() {
  console.log('Testing Supabase insert...');
  const userId = uuidv4();
  
  const { data, error } = await supabase
    .from('users')
    .insert({
      id: userId,
      email: 'test' + Date.now() + '@example.com',
      name: 'Test User',
      password_hash: 'hashedpassword',
      age: 25,
    })
    .select('*')
    .single();
    
  if (error) {
    console.error('Insert failed with error:', error);
  } else {
    console.log('Insert succeeded:', data);
  }
}

run();
