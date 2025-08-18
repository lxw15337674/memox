import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';

// Create the database client - use Turso if credentials are available, otherwise local
const client = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:./local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Create the drizzle instance
export const db = drizzle(client, { schema });

// Export the client for direct access if needed
export { client };

// Export schema for use in other files
export * from './schema';