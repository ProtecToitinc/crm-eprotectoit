import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [modalMode, setModalMode] = useState(null); // 'quote' | 'rdv' | null
  const [selectedDealId, setSelectedDealId] = useState(null);
  const [toast, setToast] = useState('');
  const [prefillClientId, setPrefillClientId] = useState(null);
  const [prefillDate, setPrefillDate] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [callModal, setCallModal] = useState(null); // { clientId, appel, prefillNew } | null
  const [noteModal, setNoteModal] = useState(null); // { clientId, note } | null
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
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }, []);
  const bumpRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  // Appel : enregistrer (clientId optionnel), modifier (appel), ou créer avec un nouveau client pré-rempli (prefillNew)
  const openCallModal = useCallback((clientId = null, appel = null, prefillNew = null) => setCallModal({ clientId, appel, prefillNew }), []);
  const closeCallModal = useCallback(() => setCallModal(null), []);
  // Note : clientId null = note générale
  const openNoteModal = useCallback((clientId = null, note = null) => setNoteModal({ clientId, note }), []);
  const closeNoteModal = useCallback(() => setNoteModal(null), []);

  // Toute requête en erreur non gérée par une page s'affiche en message au lieu d'échouer en silence
  useEffect(() => {
    const onReject = (e) => {
      const msg = e.reason?.message;
      if (msg) showToast(msg);
    };
    window.addEventListener('unhandledrejection', onReject);
    return () => window.removeEventListener('unhandledrejection', onReject);
  }, [showToast]);

  return (
    <UIContext.Provider value={{
      modalMode, openModal, openRdvModal, closeModal, prefillClientId, prefillDate,
      selectedDealId, openDeal, closeDeal,
      toast, showToast,
      refreshKey, bumpRefresh,
      callModal, openCallModal, closeCallModal,
      noteModal, openNoteModal, closeNoteModal
    }}>
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  return useContext(UIContext);
}
