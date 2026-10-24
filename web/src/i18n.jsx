import { createContext, useContext, useState } from 'react';

// English is the base. Amharic entries are used when present; anything missing falls back to English.
const en = {
  'app.name': 'DLPMS',
  'app.subtitle': 'Dire Dawa Land and Property Management',
  'nav.parcels': 'My parcels',
  'nav.transfers': 'Transfers',
  'nav.tax': 'Tax and payments',
  'nav.appointments': 'Appointments',
  'nav.dashboard': 'Dashboard',
  'nav.queue': 'Transfer requests',
  'nav.registry': 'Registry',
  'nav.taxdesk': 'Tax desk',
  'nav.map': 'Map',
  'nav.staffAppointments': 'Appointments',
  'nav.users': 'Users',
  'nav.settings': 'Settings',
  login: 'Log in',
  register: 'Register',
  logout: 'Log out',
  phone: 'Phone number',
  phoneOrEmail: 'Phone number or email',
  password: 'Password',
  fullName: 'Full name',
  nationalId: 'National ID',
  email: 'Email (optional)',
  address: 'Address (optional)',
  otp: 'One-time code',
  verify: 'Verify',
  continue: 'Continue',
  language: 'አማርኛ',
};

const am = {
  'app.subtitle': 'የድሬዳዋ መሬትና ንብረት አስተዳደር',
  'nav.parcels': 'የእኔ ይዞታዎች',
  'nav.transfers': 'ዝውውሮች',
  'nav.tax': 'ግብር እና ክፍያ',
  'nav.appointments': 'ቀጠሮዎች',
  'nav.dashboard': 'ዳሽቦርድ',
  'nav.queue': 'የዝውውር ጥያቄዎች',
  'nav.registry': 'መዝገብ',
  'nav.taxdesk': 'የግብር ጠረጴዛ',
  'nav.map': 'ካርታ',
  'nav.staffAppointments': 'ቀጠሮዎች',
  'nav.users': 'ተጠቃሚዎች',
  'nav.settings': 'ቅንብሮች',
  login: 'ግባ',
  register: 'ተመዝገብ',
  logout: 'ውጣ',
  phone: 'ስልክ ቁጥር',
  phoneOrEmail: 'ስልክ ቁጥር ወይም ኢሜይል',
  password: 'የይለፍ ቃል',
  fullName: 'ሙሉ ስም',
  nationalId: 'የብሔራዊ መታወቂያ ቁጥር',
  email: 'ኢሜይል (አማራጭ)',
  address: 'አድራሻ (አማራጭ)',
  otp: 'የአንድ ጊዜ ኮድ',
  verify: 'አረጋግጥ',
  continue: 'ቀጥል',
  language: 'English',
};

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(localStorage.getItem('dlpms_lang') || 'en');
  const toggle = () => {
    const next = lang === 'en' ? 'am' : 'en';
    localStorage.setItem('dlpms_lang', next);
    setLang(next);
  };
  const t = (key) => (lang === 'am' && am[key]) || en[key] || key;
  return <I18nContext.Provider value={{ t, lang, toggle }}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
export const useT = () => useContext(I18nContext).t;
