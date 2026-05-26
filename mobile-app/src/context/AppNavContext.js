import { createContext, useContext } from "react";

export const AppNavContext = createContext({
  goHome: () => {}
});

export const useAppNav = () => useContext(AppNavContext);
