import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { HOME, useAuth } from './auth.jsx';
import { useI18n } from './i18n.jsx';
import { Loading } from './ui.jsx';
import { Login, Register } from './pages/Auth.jsx';
import Parcels from './pages/Parcels.jsx';
import Transfers from './pages/Transfers.jsx';
import NewTransfer from './pages/NewTransfer.jsx';
import TransferDetail from './pages/TransferDetail.jsx';
import Tax from './pages/Tax.jsx';
import Appointments from './pages/Appointments.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Queue from './pages/Queue.jsx';
import Registry from './pages/Registry.jsx';
import TaxDesk from './pages/TaxDesk.jsx';
import MapPage from './pages/MapPage.jsx';
import StaffAppointments from './pages/StaffAppointments.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import Settings from './pages/Settings.jsx';

const STAFF = ['LAND_OFFICER', 'TAX_OFFICIAL', 'GIS_OFFICER', 'SYSTEM_ADMIN'];
const REPORTERS = ['LAND_OFFICER', 'TAX_OFFICIAL', 'SYSTEM_ADMIN'];

const NAV = [
  { to: '/parcels', key: 'nav.parcels', roles: ['CITIZEN'] },
  { to: '/transfers', key: 'nav.transfers', roles: ['CITIZEN'] },
  { to: '/tax', key: 'nav.tax', roles: ['CITIZEN'] },
  { to: '/appointments', key: 'nav.appointments', roles: ['CITIZEN'] },
  { to: '/dashboard', key: 'nav.dashboard', roles: REPORTERS },
  { to: '/queue', key: 'nav.queue', roles: REPORTERS },
  { to: '/registry', key: 'nav.registry', roles: STAFF },
  { to: '/taxdesk', key: 'nav.taxdesk', roles: ['TAX_OFFICIAL', 'SYSTEM_ADMIN'] },
  { to: '/map', key: 'nav.map', roles: ['LAND_OFFICER', 'GIS_OFFICER', 'SYSTEM_ADMIN'] },
  { to: '/staff-appointments', key: 'nav.staffAppointments', roles: ['LAND_OFFICER', 'SYSTEM_ADMIN'] },
  { to: '/users', key: 'nav.users', roles: ['SYSTEM_ADMIN'] },
  { to: '/settings', key: 'nav.settings', roles: ['SYSTEM_ADMIN'] },
];

function Guard({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8"><Loading /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={HOME[user.role] || '/'} replace />;
  return <Layout>{children}</Layout>;
}

function Layout({ children }) {
  const { user, signOut } = useAuth();
  const { t, toggle, lang } = useI18n();
  const nav = useNavigate();
  const links = NAV.filter((n) => n.roles.includes(user.role));

  return (
    <div className="min-h-screen">
      <header className="bg-emerald-800 text-white">
        <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center gap-4">
          <div>
            <div className="font-semibold leading-tight">{t('app.name')}</div>
            <div className="text-xs text-emerald-100">{t('app.subtitle')}</div>
          </div>
          <nav className="flex flex-wrap gap-1 text-sm">
            {links.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 ${isActive ? 'bg-emerald-600' : 'hover:bg-emerald-700'}`
                }
              >
                {t(n.key)}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-emerald-100 hidden sm:inline">
              {user.phone_number} ({user.role.replace('_', ' ').toLowerCase()})
            </span>
            <button onClick={toggle} className="rounded-md bg-emerald-700 px-2 py-1 hover:bg-emerald-600">
              {t('language')}
            </button>
            <button
              onClick={() => {
                signOut();
                nav('/login');
              }}
              className="rounded-md bg-emerald-700 px-2 py-1 hover:bg-emerald-600"
            >
              {t('logout')}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8"><Loading /></div>;
  return <Navigate to={user ? HOME[user.role] || '/login' : '/login'} replace />;
}

export default function App() {
  const citizen = ['CITIZEN'];
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/parcels" element={<Guard roles={citizen}><Parcels /></Guard>} />
      <Route path="/transfers" element={<Guard roles={citizen}><Transfers /></Guard>} />
      <Route path="/transfers/new" element={<Guard roles={citizen}><NewTransfer /></Guard>} />
      <Route path="/transfers/:id" element={<Guard><TransferDetail /></Guard>} />
      <Route path="/tax" element={<Guard roles={citizen}><Tax /></Guard>} />
      <Route path="/appointments" element={<Guard roles={citizen}><Appointments /></Guard>} />

      <Route path="/dashboard" element={<Guard roles={REPORTERS}><Dashboard /></Guard>} />
      <Route path="/queue" element={<Guard roles={REPORTERS}><Queue /></Guard>} />
      <Route path="/registry" element={<Guard roles={STAFF}><Registry /></Guard>} />
      <Route path="/taxdesk" element={<Guard roles={['TAX_OFFICIAL', 'SYSTEM_ADMIN']}><TaxDesk /></Guard>} />
      <Route path="/map" element={<Guard roles={['LAND_OFFICER', 'GIS_OFFICER', 'SYSTEM_ADMIN']}><MapPage /></Guard>} />
      <Route path="/staff-appointments" element={<Guard roles={['LAND_OFFICER', 'SYSTEM_ADMIN']}><StaffAppointments /></Guard>} />
      <Route path="/users" element={<Guard roles={['SYSTEM_ADMIN']}><AdminUsers /></Guard>} />
      <Route path="/settings" element={<Guard roles={['SYSTEM_ADMIN']}><Settings /></Guard>} />

      <Route path="*" element={<Home />} />
    </Routes>
  );
}
