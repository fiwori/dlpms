import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Alert, Button, Card, Input, Loading, PageTitle, Select, useLoad } from '../ui.jsx';

const DOC_TYPES = ['agreement', 'id_card', 'deed', 'tax_clearance', 'other'];

export default function NewTransfer() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const parcels = useLoad(() => api.get('/parcels/mine'));
  const [parcelId, setParcelId] = useState(params.get('parcel') || '');
  const [buyer, setBuyer] = useState('');
  const [price, setPrice] = useState('');
  const [docs, setDocs] = useState([]);
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState('agreement');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const addDoc = () => {
    if (!docName.trim()) return;
    setDocs([...docs, { name: docName.trim(), type: docType }]);
    setDocName('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = {
        parcel_id: Number(parcelId),
        buyer_national_id: buyer,
        documents: docs,
      };
      if (price) body.sale_price = Number(price);
      const t = await api.post('/transfers', body);
      nav(`/transfers/${t.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageTitle>New transfer request</PageTitle>
      <Card className="max-w-xl">
        {parcels.loading ? (
          <Loading />
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Select label="Parcel to transfer" value={parcelId} onChange={(e) => setParcelId(e.target.value)} required>
              <option value="">Select a parcel</option>
              {(parcels.data ? parcels.data.items : []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.parcel_number} ({p.kebele})
                </option>
              ))}
            </Select>
            <Input label="Buyer's national ID (the buyer must be registered)" value={buyer} onChange={(e) => setBuyer(e.target.value)} required />
            <Input label="Sale price in ETB (optional)" type="number" min="1" value={price} onChange={(e) => setPrice(e.target.value)} />

            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
              <div className="text-sm font-medium text-slate-700">Supporting documents</div>
              {docs.map((d, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>
                    {d.name} <span className="text-slate-500">({d.type})</span>
                  </span>
                  <button type="button" className="text-red-600" onClick={() => setDocs(docs.filter((_, j) => j !== i))}>
                    remove
                  </button>
                </div>
              ))}
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Input label="File name" value={docName} onChange={(e) => setDocName(e.target.value)} />
                </div>
                <Select label="Type" value={docType} onChange={(e) => setDocType(e.target.value)}>
                  {DOC_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
                <Button type="button" variant="secondary" onClick={addDoc}>
                  Add
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Prototype: only the document names are recorded. File upload is the next improvement.
              </p>
            </div>

            <Alert>{error}</Alert>
            <Button type="submit" disabled={busy}>
              Create draft
            </Button>
          </form>
        )}
      </Card>
    </>
  );
}
