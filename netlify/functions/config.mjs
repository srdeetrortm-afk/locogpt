export default async () => new Response(JSON.stringify({ clientId: process.env.GOOGLE_CLIENT_ID || '' }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
export const config = { path: '/api/config' };
