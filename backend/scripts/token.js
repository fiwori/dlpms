// Dev helper: prints a JWT for a user. Usage: node scripts/token.js <phone> <password>
const [identifier, password] = process.argv.slice(2);
const base = 'http://localhost:4000/api/auth';

async function post(path, body) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || res.statusText);
  return data;
}

(async () => {
  const login = await post('/login', { identifier, password });
  if (!login.dev_otp) throw new Error('No dev_otp returned (is NODE_ENV=production?)');
  const done = await post('/verify-otp', { user_id: login.user_id, otp: login.dev_otp });
  console.log(done.token);
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});