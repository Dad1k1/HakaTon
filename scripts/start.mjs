import 'dotenv/config';
// Auth.js must derive its URL from each validated LAN request, not a stale localhost value.
delete process.env.NEXTAUTH_URL;
process.env.AUTH_TRUST_HOST = 'true';
process.env.HOSTNAME = process.env.BIND_ADDRESS || '127.0.0.1';
await import('../.next/standalone/server.js');
