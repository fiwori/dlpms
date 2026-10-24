import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Alert, Button, Card, fmtDate, Input, Loading, PageTitle, Select, Table, useAction, useLoad } from '../ui.jsx';

const ROLES = ['CITIZEN', 'LAND_OFFICER', 'TAX_OFFICIAL', 'GIS_OFFICER', 'SYSTEM_ADMIN'];
const STAFF_ROLES = ROLES.slice(1);

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const { data, error, loading, reload } = useLoad(
    () => api.get(`/admin/users?limit=100&search=${encodeURIComponent(search)}${role ? `&role=${role}` : ''}`),
    [search, role]
  );
  const act = useAction(reload);
  const [form, setForm] = useState({ phone_number: '', email: '', password: '', role: 'LAND_OFFICER' });

  const create = (e) => {
    e.preventDefault();
    act.run(async () => {
      await api.post('/admin/users', form);
      setForm({ phone_number: '', email: '', password: '', role: 'LAND_OFFICER' });
    });
  };

  const resetPassword = (u) => {
    const password = window.prompt(`New password for ${u.phone_number} (at least 8 characters):`);
    if (password) act.run(() => api.post(`/admin/users/${u.id}/reset-password`, { password }));
  };

  return (
    <>
      <PageTitle>Users</PageTitle>
      <Alert>{error || act.error}</Alert>

      <Card title="Create a staff account">
        <form onSubmit={create} className="grid gap-3 md:grid-cols-5 items-end">
          <Input label="Phone number" value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} required />
          <Input label="Email (optional)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Temporary password" type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {r.replace('_', ' ').toLowerCase()}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={act.busy}>
            Create
          </Button>
        </form>
      </Card>

      <Card title="All accounts" className="mt-4">
        <div className="flex flex-wrap gap-3 mb-3 max-w-xl">
          <div className="flex-1">
            <Input label="Search phone or email" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">all roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.replace('_', ' ').toLowerCase()}
              </option>
            ))}
          </Select>
        </div>
        {loading && !data ? (
          <Loading />
        ) : (
          <Table
            empty="No accounts found."
            rows={data ? data.items : []}
            columns={[
              { label: 'Phone', key: 'phone_number' },
              { label: 'Email', render: (u) => u.email || '—' },
              {
                label: 'Role',
                render: (u) =>
                  u.id === me.id ? (
                    u.role.replace('_', ' ').toLowerCase()
                  ) : (
                    <select
                      className="rounded border border-slate-300 px-2 py-1 text-sm"
                      value={u.role}
                      onChange={(e) => act.run(() => api.patch(`/admin/users/${u.id}`, { role: e.target.value }))}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r.replace('_', ' ').toLowerCase()}
                        </option>
                      ))}
                    </select>
                  ),
              },
              { label: 'Active', render: (u) => (u.is_active ? 'yes' : 'no') },
              { label: 'Created', render: (u) => fmtDate(u.created_at) },
              {
                label: '',
                render: (u) =>
                  u.id === me.id ? (
                    <span className="text-slate-400">you</span>
                  ) : (
                    <span className="flex gap-3">
                      <button
                        className={u.is_active ? 'text-red-600 hover:underline' : 'text-emerald-700 hover:underline'}
                        onClick={() => act.run(() => api.patch(`/admin/users/${u.id}`, { is_active: !u.is_active }))}
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button className="text-slate-600 hover:underline" onClick={() => resetPassword(u)}>
                        Reset password
                      </button>
                    </span>
                  ),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
