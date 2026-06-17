import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, TrendingUp, DollarSign, CheckSquare, AlertCircle, Clock, ChevronRight } from 'lucide-react';
import { api } from '../api';

const ETAPE_COLORS = {
  prospect: 'bg-gray-100 text-gray-700',
  inspection: 'bg-blue-100 text-blue-700',
  devis: 'bg-yellow-100 text-yellow-700',
  contrat: 'bg-green-100 text-green-700',
  ferme: 'bg-purple-100 text-purple-700'
};

const ETAPE_LABELS = {
  prospect: 'Prospect', inspection: 'Inspection', devis: 'Devis', contrat: 'Contrat', ferme: 'Fermé'
};

const PRIORITE_COLORS = {
  haute: 'bg-red-100 text-red-700',
  normale: 'bg-blue-100 text-blue-700',
  basse: 'bg-gray-100 text-gray-600'
};

function fmt(n) {
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.stats().then(setStats);
  }, []);

  if (!stats) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-gray-400 text-sm">Chargement...</div>
    </div>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="text-gray-500 text-sm mt-0.5">Vue d'ensemble eProtectoIT</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">Clients</span>
            <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
              <Users size={18} className="text-blue-600" />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{stats.totalClients}</div>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">Opportunités actives</span>
            <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center">
              <TrendingUp size={18} className="text-green-600" />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{stats.totalOpportunites}</div>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">Valeur pipeline</span>
            <div className="w-9 h-9 bg-yellow-50 rounded-lg flex items-center justify-center">
              <DollarSign size={18} className="text-yellow-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{fmt(stats.valeurPipeline)}</div>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">Tâches à faire</span>
            <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center">
              <CheckSquare size={18} className="text-red-600" />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{stats.tachesEnCours}</div>
          {stats.tachesEnRetard > 0 && (
            <div className="text-xs text-red-500 mt-1 flex items-center gap-1">
              <AlertCircle size={11} /> {stats.tachesEnRetard} en retard
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Pipeline par étape */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Pipeline par étape</h2>
            <Link to="/pipeline" className="text-blue-600 text-sm hover:underline flex items-center gap-1">
              Voir tout <ChevronRight size={14} />
            </Link>
          </div>
          {stats.parEtape.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Aucune opportunité</p>
          ) : (
            <div className="space-y-2">
              {['prospect', 'inspection', 'devis', 'contrat'].map(etape => {
                const data = stats.parEtape.find(p => p.etape === etape);
                return (
                  <div key={etape} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className={`badge ${ETAPE_COLORS[etape]}`}>{ETAPE_LABELS[etape]}</span>
                      <span className="text-sm text-gray-600">{data?.count || 0} dossier{(data?.count || 0) > 1 ? 's' : ''}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-700">{fmt(data?.valeur || 0)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Tâches urgentes */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Tâches urgentes</h2>
            <Link to="/taches" className="text-blue-600 text-sm hover:underline flex items-center gap-1">
              Voir tout <ChevronRight size={14} />
            </Link>
          </div>
          {stats.tachesAujourdhui.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Aucune tâche urgente</p>
          ) : (
            <div className="space-y-2">
              {stats.tachesAujourdhui.map(t => (
                <div key={t.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <AlertCircle size={15} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{t.titre}</div>
                    {t.nom && <div className="text-xs text-gray-400">{t.prenom} {t.nom}</div>}
                  </div>
                  <span className={`badge ${PRIORITE_COLORS[t.priorite] || PRIORITE_COLORS.normale}`}>{t.priorite}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Clients récents */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Derniers clients ajoutés</h2>
            <Link to="/clients" className="text-blue-600 text-sm hover:underline flex items-center gap-1">
              Voir tout <ChevronRight size={14} />
            </Link>
          </div>
          {stats.recents.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Aucun client</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 text-gray-400 font-medium">Client</th>
                    <th className="text-left py-2 text-gray-400 font-medium hidden md:table-cell">Téléphone</th>
                    <th className="text-left py-2 text-gray-400 font-medium hidden md:table-cell">Ville</th>
                    <th className="text-left py-2 text-gray-400 font-medium">Étape</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recents.map(c => (
                    <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2.5 font-medium text-gray-900">{c.prenom} {c.nom}</td>
                      <td className="py-2.5 text-gray-500 hidden md:table-cell">{c.telephone || '—'}</td>
                      <td className="py-2.5 text-gray-500 hidden md:table-cell">{c.ville || '—'}</td>
                      <td className="py-2.5">
                        {c.etape ? <span className={`badge ${ETAPE_COLORS[c.etape]}`}>{ETAPE_LABELS[c.etape]}</span> : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="py-2.5 text-right">
                        <Link to={`/clients/${c.id}`} className="text-blue-600 hover:text-blue-800 text-xs">Voir →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
