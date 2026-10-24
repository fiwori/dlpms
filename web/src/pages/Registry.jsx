import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Alert, Button, Card, Input, Loading, PageTitle, Select, Table, useAction, useLoad } from '../ui.jsx';

const LAND_USES = ['residential', 'commercial', 'agricultural', 'industrial', 'mixed'];

export default function Registry() {
  const { user } = useAuth();
  const canEdit = ['LAND_OFFICER', 'SYSTEM_ADMIN'].includes(user.role);
  const [search, setSearch] = useState('');
  const parcels = useLoad(() => api.get(`/parcels?limit=50&search=${encodeURIComponent(search)}`), [search]);
  const owners = useLoad(() => api.get('/owners?limit=100'));

  const refresh = async () => {
    await Promise.all([parcels.reload(), owners.reload()]);
  };
  const act = useAction(refresh);

  const [owner, setOwner] = useState({ full_name: '', national_id: '', phone_number: '', address: '' });
  const [parcel, setParcel] = useState({
    parcel_number: '',
    kebele: '',
    sub_city: '',
    area_sqm: '',
    land_use: 'residential',
    owner_id: '',
  });

  const addOwner = (e) => {
    e.preventDefault();
    act.run(async () => {
      await api.post('/owners', owner);
      setOwner({ full_name: '', national_id: '', phone_number: '', address: '' });
    });
  };
  const addParcel = (e) => {
    e.preventDefault();
    act.run(async () => {
      const body = { ...parcel, area_sqm: Number(parcel.area_sqm) };
      if (!body.owner_id) delete body.owner_id;
      else body.owner_id = Number(body.owner_id);
      await api.post('/parcels', body);
      setParcel({ ...parcel, parcel_number: '', area_sqm: '' });
    });
  };

  return (
    <>
      <PageTitle>Registry</PageTitle>
      <Alert>{act.error}</Alert>

      <Card title="Parcels">
        <div className="max-w-sm mb-3">
          <Input label="Search by parcel number, kebele, sub-city or owner" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {parcels.loading ? (
          <Loading />
        ) : (
          <Table
            empty="No parcels found."
            rows={parcels.data ? parcels.data.items : []}
            columns={[
              { label: 'Parcel number', key: 'parcel_number' },
              { label: 'Kebele', key: 'kebele' },
              { label: 'Area (sq. m)', key: 'area_sqm' },
              { label: 'Land use', key: 'land_use' },
              { label: 'Owner', render: (p) => (p.owner ? p.owner.full_name : '—') },
              { label: 'Version', key: 'version' },
            ]}
          />
        )}
      </Card>

      {canEdit && (
        <Card title="Register a parcel" className="mt-4">
          <form onSubmit={addParcel} className="grid gap-3 md:grid-cols-3">
            <Input label="Parcel number" value={parcel.parcel_number} onChange={(e) => setParcel({ ...parcel, parcel_number: e.target.value })} required />
            <Input label="Kebele" value={parcel.kebele} onChange={(e) => setParcel({ ...parcel, kebele: e.target.value })} required />
            <Input label="Sub-city" value={parcel.sub_city} onChange={(e) => setParcel({ ...parcel, sub_city: e.target.value })} />
            <Input label="Area (sq. m)" type="number" min="1" step="any" value={parcel.area_sqm} onChange={(e) => setParcel({ ...parcel, area_sqm: e.target.value })} required />
            <Select label="Land use" value={parcel.land_use} onChange={(e) => setParcel({ ...parcel, land_use: e.target.value })}>
              {LAND_USES.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Select>
            <Select label="Owner" value={parcel.owner_id} onChange={(e) => setParcel({ ...parcel, owner_id: e.target.value })}>
              <option value="">No owner yet</option>
              {(owners.data ? owners.data.items : []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.full_name} ({o.national_id})
                </option>
              ))}
            </Select>
            <div className="md:col-span-3">
              <Button type="submit" disabled={act.busy}>
                Register parcel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card title="Owners" className="mt-4">
        {owners.loading ? (
          <Loading />
        ) : (
          <Table
            empty="No owners yet."
            rows={owners.data ? owners.data.items : []}
            columns={[
              { label: 'Name', key: 'full_name' },
              { label: 'National ID', key: 'national_id' },
              { label: 'Phone', render: (o) => o.phone_number || '—' },
              { label: 'Address', render: (o) => o.address || '—' },
            ]}
          />
        )}
        {canEdit && (
          <form onSubmit={addOwner} className="grid gap-3 md:grid-cols-4 mt-4 pt-4 border-t border-slate-100">
            <Input label="Full name" value={owner.full_name} onChange={(e) => setOwner({ ...owner, full_name: e.target.value })} required />
            <Input label="National ID" value={owner.national_id} onChange={(e) => setOwner({ ...owner, national_id: e.target.value })} required />
            <Input label="Phone" value={owner.phone_number} onChange={(e) => setOwner({ ...owner, phone_number: e.target.value })} />
            <Input label="Address" value={owner.address} onChange={(e) => setOwner({ ...owner, address: e.target.value })} />
            <div className="md:col-span-4">
              <Button type="submit" disabled={act.busy}>
                Register owner
              </Button>
            </div>
          </form>
        )}
      </Card>
    </>
  );
}
