import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Alert, Button, Card, PageTitle, Select, useLoad } from '../ui.jsx';

// Dire Dawa
const CENTER = [9.5931, 41.8661];

export default function MapPage() {
  const { user } = useAuth();
  const canDraw = ['GIS_OFFICER', 'SYSTEM_ADMIN'].includes(user.role);
  const parcels = useLoad(() => api.get('/parcels?limit=100'));

  const elRef = useRef(null);
  const mapRef = useRef(null);
  const shapesRef = useRef(null);
  const draftRef = useRef(null);
  const drawingRef = useRef(false);

  const [parcelId, setParcelId] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [points, setPoints] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  drawingRef.current = drawing;

  const loadShapes = async () => {
    try {
      const fc = await api.get('/gis/parcels');
      shapesRef.current.clearLayers();
      shapesRef.current.addData(fc);
      if (fc.features.length > 0 && !drawingRef.current) {
        mapRef.current.fitBounds(shapesRef.current.getBounds(), { maxZoom: 17 });
      }
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    const map = L.map(elRef.current).setView(CENTER, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    shapesRef.current = L.geoJSON(null, {
      style: { color: '#047857', weight: 2, fillOpacity: 0.2 },
      onEachFeature: (feature, layer) => {
        const p = feature.properties;
        layer.bindPopup(`<b>${p.parcel_number}</b><br/>${p.kebele}<br/>${p.owner || 'No owner'}`);
      },
    }).addTo(map);
    draftRef.current = L.polygon([], { color: '#dc2626', weight: 2 }).addTo(map);

    map.on('click', (e) => {
      if (drawingRef.current) setPoints((prev) => [...prev, [e.latlng.lat, e.latlng.lng]]);
    });

    mapRef.current = map;
    loadShapes();
    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (draftRef.current) draftRef.current.setLatLngs(points);
  }, [points]);

  const save = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const ring = points.map(([lat, lng]) => [lng, lat]); // GeoJSON order is [longitude, latitude]
      ring.push(ring[0]);
      const r = await api.put(`/gis/parcels/${parcelId}/boundary`, {
        boundary: { type: 'Polygon', coordinates: [ring] },
      });
      setMessage(`Boundary saved for ${r.parcel_number}.`);
      setPoints([]);
      setDrawing(false);
      await loadShapes();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageTitle>Parcel map</PageTitle>
      <Alert>{error}</Alert>
      <Alert kind="ok">{message}</Alert>

      {canDraw && (
        <Card title="Draw a boundary" className="mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <Select label="Parcel" value={parcelId} onChange={(e) => setParcelId(e.target.value)}>
              <option value="">Select a parcel</option>
              {(parcels.data ? parcels.data.items : []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.parcel_number}
                </option>
              ))}
            </Select>
            {!drawing ? (
              <Button disabled={!parcelId} onClick={() => { setDrawing(true); setPoints([]); setMessage(''); }}>
                Start drawing
              </Button>
            ) : (
              <>
                <Button disabled={busy || points.length < 3} onClick={save}>
                  Save boundary ({points.length} corners)
                </Button>
                <Button variant="secondary" onClick={() => setPoints((p) => p.slice(0, -1))} disabled={points.length === 0}>
                  Undo last corner
                </Button>
                <Button variant="secondary" onClick={() => { setDrawing(false); setPoints([]); }}>
                  Cancel
                </Button>
              </>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Click the map to add each corner (at least 3). The server refuses shapes that cross themselves or overlap a neighbouring parcel.
          </p>
        </Card>
      )}

      <div ref={elRef} style={{ height: '520px' }} className="rounded-xl border border-slate-200 overflow-hidden" />
    </>
  );
}
