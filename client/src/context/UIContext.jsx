import React, { createContext, useContext, useRef, useState, useCallback } from 'react';

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [search, setSearch] = useState('');
  const [modalMode, setModalMode] = useState(null); // 'quote' | 'rdv' | null
  const [selectedDealId, setSelectedDealId] = useState(null);
  const [toast, setToast] = useState('');
  const [prefillClientId, setPrefillClientId] = useState(null);
  const [prefillDate, setPrefillDate] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const toastTimer = useRef(null);

  const openModal = useCallback((clientId = null) => {
    setPrefillClientId(clientId);
    setPrefillDate(null);
    setModalMode('quote');
  }, []);
  const openRdvModal = useCallback((clientId = null, date = null) => {
    setPrefillClientId(clientId);
    setPrefillDate(date);
    setModalMode('rdv');
  }, []);
  const closeModal = useCallback(() => setModalMode(null), []);
  const openDeal = useCallback((id) => setSelectedDealId(id), []);
  const closeDeal = useCallback(() => setSelectedDealId(null), []);
  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);
  const bumpRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return (
    <UIContext.Provider value={{
      search, setSearch,
      modalMode, openModal, openRdvModal, closeModal, prefillClientId, prefillDate,
      selectedDealId, openDeal, closeDeal,
      toast, showToast,
      refreshKey, bumpRefresh
    }}>
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  return useContext(UIContext);
}
