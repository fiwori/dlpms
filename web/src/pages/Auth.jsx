import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { HOME, useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { Alert, Button, Card, Input } from '../ui.jsx';

function Shell({ children }) {
  const { t, toggle } = useI18n();
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-emerald-800">{t('app.name')}</h1>
          <p className="text-sm text-slate-600">{t('app.subtitle')}</p>
        </div>
        <Card>{children}</Card>
        <button onClick={toggle} className="block mx-auto text-sm text-emerald-700 hover:underline">
          {t('language')}
        </button>
      </div>
    </div>
  );
}

export function Login() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { signIn } = useAuth();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [otp, setOtp] = useState('');
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!pending) {
        setPending(await api.post('/auth/login', form));
      } else {
        const r = await api.post('/auth/verify-otp', { user_id: pending.user_id, otp });
        await signIn(r.token);
        nav(HOME[r.user.role] || '/');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <form onSubmit={submit} className="space-y-4">
        <h2 className="text-lg font-semibold">{t('login')}</h2>
        {!pending ? (
          <>
            <Input
              label={t('phoneOrEmail')}
              value={form.identifier}
              onChange={(e) => setForm({ ...form, identifier: e.target.value })}
              required
            />
            <Input
              label={t('password')}
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              A one-time code was sent to your phone.
              {pending.dev_otp && (
                <span className="block mt-1 rounded bg-amber-50 border border-amber-200 px-2 py-1 text-amber-800">
                  Demo mode: your code is <b>{pending.dev_otp}</b>
                </span>
              )}
            </p>
            <Input label={t('otp')} value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" required />
          </>
        )}
        <Alert>{error}</Alert>
        <Button type="submit" disabled={busy} className="w-full">
          {pending ? t('verify') : t('continue')}
        </Button>
        {!pending && (
          <p className="text-sm text-center text-slate-600">
            <Link to="/register" className="text-emerald-700 hover:underline">
              {t('register')}
            </Link>
          </p>
        )}
      </form>
    </Shell>
  );
}

export function Register() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [form, setForm] = useState({
    full_name: '',
    national_id: '',
    phone_number: '',
    email: '',
    address: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/register', form);
      setDone(true);
      setTimeout(() => nav('/login'), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <form onSubmit={submit} className="space-y-3">
        <h2 className="text-lg font-semibold">{t('register')}</h2>
        <Input label={t('fullName')} value={form.full_name} onChange={set('full_name')} required />
        <Input label={t('nationalId')} value={form.national_id} onChange={set('national_id')} required />
        <Input label={t('phone')} value={form.phone_number} onChange={set('phone_number')} required />
        <Input label={t('email')} type="email" value={form.email} onChange={set('email')} />
        <Input label={t('address')} value={form.address} onChange={set('address')} />
        <Input label={`${t('password')} (8+)`} type="password" value={form.password} onChange={set('password')} minLength={8} required />
        <Alert>{error}</Alert>
        <Alert kind="ok">{done ? 'Registered. Taking you to the login page…' : ''}</Alert>
        <Button type="submit" disabled={busy || done} className="w-full">
          {t('register')}
        </Button>
        <p className="text-sm text-center">
          <Link to="/login" className="text-emerald-700 hover:underline">
            {t('login')}
          </Link>
        </p>
      </form>
    </Shell>
  );
}
