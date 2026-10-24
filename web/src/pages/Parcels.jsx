import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Alert, Card, Loading, PageTitle, Table, useLoad } from '../ui.jsx';

export default function Parcels() {
  const { data, error, loading } = useLoad(() => api.get('/parcels/mine'));

  return (
    <>
      <PageTitle>My parcels</PageTitle>
      <Alert>{error}</Alert>
      <Card>
        {loading ? (
          <Loading />
        ) : (
          <Table
            empty="You have no registered parcels yet."
            rows={data ? data.items : []}
            columns={[
              { label: 'Parcel number', key: 'parcel_number' },
              { label: 'Kebele', key: 'kebele' },
              { label: 'Sub-city', render: (p) => p.sub_city || '—' },
              { label: 'Area (sq. m)', key: 'area_sqm' },
              { label: 'Land use', key: 'land_use' },
              {
                label: '',
                render: (p) => (
                  <Link className="text-emerald-700 hover:underline" to={`/transfers/new?parcel=${p.id}`}>
                    Start a transfer
                  </Link>
                ),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
