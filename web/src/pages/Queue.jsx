import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Alert, Badge, Card, fmtDate, Loading, money, PageTitle, Select, Table, useLoad } from '../ui.jsx';

const STATUSES = ['', 'submitted', 'tax_hold', 'tax_verified', 'under_review', 'docs_requested', 'approved', 'rejected', 'cancelled', 'draft'];

export default function Queue() {
  const [status, setStatus] = useState('tax_verified');
  const { data, error, loading } = useLoad(
    () => api.get(`/transfers?limit=100${status ? `&status=${status}` : ''}`),
    [status]
  );

  return (
    <>
      <PageTitle>Transfer requests</PageTitle>
      <Card>
        <div className="max-w-xs mb-4">
          <Select label="Show" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s ? s.replace(/_/g, ' ') : 'all statuses'}
              </option>
            ))}
          </Select>
        </div>
        <Alert>{error}</Alert>
        {loading ? (
          <Loading />
        ) : (
          <Table
            empty="No requests with this status."
            rows={data ? data.items : []}
            columns={[
              {
                label: 'Tracking ID',
                render: (t) => (
                  <Link className="text-emerald-700 hover:underline" to={`/transfers/${t.id}`}>
                    {t.tracking_id}
                  </Link>
                ),
              },
              { label: 'Parcel', render: (t) => t.parcel.parcel_number },
              { label: 'From', render: (t) => t.seller.full_name },
              { label: 'To', render: (t) => t.buyer.full_name },
              { label: 'Price', render: (t) => (t.sale_price ? money(t.sale_price) : '—') },
              { label: 'Status', render: (t) => <Badge status={t.status} /> },
              { label: 'Submitted', render: (t) => fmtDate(t.submitted_at) },
            ]}
          />
        )}
      </Card>
    </>
  );
}
