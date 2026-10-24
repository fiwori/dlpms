import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Alert, Badge, Card, fmtDate, Loading, money, PageTitle, Table, useLoad } from '../ui.jsx';

export default function Transfers() {
  const { data, error, loading } = useLoad(() => api.get('/transfers/mine'));

  return (
    <>
      <PageTitle
        action={
          <Link to="/transfers/new" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            New transfer
          </Link>
        }
      >
        My transfers
      </PageTitle>
      <Alert>{error}</Alert>
      <Card>
        {loading ? (
          <Loading />
        ) : (
          <Table
            empty="No transfer requests yet."
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
              { label: 'Created', render: (t) => fmtDate(t.created_at) },
            ]}
          />
        )}
      </Card>
    </>
  );
}
