import { getDb } from './src/db/database.ts';

const db = getDb().getRawDb();
const query = async () => {
  const res1 = db.prepare(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'can_access_ifrj'`).all();
  console.log('users.can_access_ifrj:', res1);

  const res2 = db.prepare(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'student_profiles' AND column_name = 'onboarding_completed'`).all();
  console.log('student_profiles.onboarding_completed:', res2);

  process.exit(0);
};

query();
