import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const runMigrate = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const sql = postgres(process.env.DATABASE_URL);
  const db = drizzle(sql);

  console.log('Running migrations...');
  
  await migrate(db, { migrationsFolder: './drizzle' });
  
  console.log('Migrations complete!');
  await sql.end();
};

runMigrate().catch((err) => {
  console.error('Migration failed!', err);
  process.exit(1);
}); 