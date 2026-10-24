import { useState } from 'react';
import { api } from '../api.js';
import { Alert, Button, Card, fmtDate, Input, Loading, PageTitle, Table, useAction, useLoad } from '../ui.jsx';

export default function Settings() {
  const rates = useLoad(() => api.get('/tax/rates'));
  const [page, setPage] = useState(1);
  const logs = useLoad(() => api.get(`/admin/audit-logs?page=${page}&limit=15`), [page]);
  const act = useAction(rates.reload);
  const [rate, setRate] = useState({ land_use: '', kebele: '', rate_per_sqm: '' });
  const [chain, setChain] = useState(null);

  const saveRate = (e) => {
    e.preventDefault();
    act.run(async () => {
      const body = { land_use: rate.land_use, rate_per_sqm: Number(rate.rate_per_sqm) };
      if (rate.kebele.trim()) body.kebele = rate.kebele.trim();
      await api.put('/tax/rates', body);
      setRate({ land_use: '', kebele: '', rate_per_sqm: '' });
    });
  };

  const verifyChain = () =>
    act.run(async () => {
      setChain(await api.get('/admin/audit-logs/verify'));
    });

  const lastPage = logs.data ? Math.max(1, Math.ceil(logs.data.total / logs.data.limit)) : 1;

  return (
    <>
      <PageTitle>Settings</PageTitle>
      <Alert>{act.error || rates.error}</Alert>

      <Card title="Property tax rates">
        <p className="text-sm text-slate-600 mb-3">
          Tax = parcel area × the rate for its land use. A rate for a specific kebele overrides the general rate.
        </p>
        <form onSubmit={saveRate} className="flex flex-wrap items-end gap-3 mb-4">
          <Input label="Land use" value={rate.land_use} onChange={(e) => setRate({ ...rate, land_use: e.target.value })} placeholder="residential" required />
          <Input label="Kebele (optional)" value={rate.kebele} onChange={(e) => setRate({ ...rate, kebele: e.target.value })} />
          <Input label="ETB per sq. m" type="number" step="any" min="0" value={rate.rate_per_sqm} onChange={(e) => setRate({ ...rate, rate_per_sqm: e.target.value })} required />
          <Button type="submit" disabled={act.busy}>
            Save rate
          </Button>
        </form>
        {rates.loading ? (
          <Loading />
        ) : (
          <Table
            empty="No rates configured yet."
            rows={rates.data ? rates.data.items : []}
            columns={[
              { label: 'Land use', key: 'land_use' },
              { label: 'Kebele', render: (r) => r.kebele || 'all' },
              { label: 'ETB per sq. m', render: (r) => Number(r.rate_per_sqm).toString() },
              { label: 'Updated', render: (r) => fmtDate(r.updated_at) },
            ]}
          />
        )}
      </Card>

      <Card title="Audit log" className="mt-4">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="secondary" disabled={act.busy} onClick={verifyChain}>
            Verify the hash chain
          </Button>
          {chain && (
            <span className={`text-sm ${chain.valid ? 'text-emerald-700' : 'text-red-700'}`}>
              {chain.valid
                ? `Chain is intact (${chain.checked} entries checked).`
                : `Chain is BROKEN at entry ${chain.broken_at_id}.`}
            </span>
          )}
        </div>
        <Alert>{logs.error}</Alert>
        {logs.loading && !logs.data ? (
          <Loading />
        ) : (
          <Table
            empty="No audit entries yet."
            rows={logs.data ? logs.data.items : []}
            columns={[
              { label: '#', key: 'id' },
              { label: 'When', render: (l) => fmtDate(l.created_at) },
              { label: 'User', render: (l) => l.user_id ?? 'system' },
              { label: 'Action', key: 'action' },
              { label: 'Entity', render: (l) => `${l.entity_type}${l.entity_id ? ` #${l.entity_id}` : ''}` },
              { label: 'IP', render: (l) => l.ip_address || '—' },
            ]}
          />
        )}
        <div className="flex items-center gap-3 mt-3 text-sm">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Newer
          </Button>
          <span className="text-slate-500">
            Page {page} of {lastPage}
          </span>
          <Button variant="secondary" disabled={page >= lastPage} onClick={() => setPage(page + 1)}>
            Older
          </Button>
        </div>
      </Card>
    </>
  );
}
