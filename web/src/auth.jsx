import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

export const HOME = {
  CITIZEN: '/parcels',
  LAND_OFFICER: '/queue',
  TAX_OFFICIAL: '/taxdesk',
  GIS_OFFICER: '/map',
  SYSTEM_ADMIN: '/dashboard',
};

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) return;
    api
      .get('/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const signIn = async (token) => {
    setToken(token);
    setUser(await api.get('/auth/me'));
  };
  const signOut = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
