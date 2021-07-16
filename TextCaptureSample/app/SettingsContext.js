import React from 'react';

export const Mode = {
  LOT: 'LOT',
  GS1: 'GS1',
};

export const SettingsContext = React.createContext({
  settings: { mode: Mode.GS1, position: 0.5 },
  setMode: () => { },
  setPosition: () => { },
});
