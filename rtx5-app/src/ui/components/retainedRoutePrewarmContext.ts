import { createContext } from 'react';

// Regular routes are eligible immediately; root-retained bodies opt into the
// startup provider without importing its auth/native dependencies here.
export const RetainedRoutePrewarmContext = createContext(true);
