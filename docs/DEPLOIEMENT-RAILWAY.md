# Déploiement contrôlé CRM ProtecToit (Railway)

Ce document est une procédure de vérification, **pas** une preuve de déploiement. Claude et ChatGPT se coordonnent dans [l'issue #2](https://github.com/ProtecToitinc/crm-eprotectoit/issues/2).

## 1. Avant de fusionner une PR

- [ ] Comparer le HEAD de la PR avec `main`; ne pas écraser le travail d'un autre agent.
- [ ] Vérifier la CI GitHub : compilation React, syntaxe serveur et tests sur **base temporaire**.
- [ ] Vérifier chaque migration SQLite sur une copie anonymisée de la base existante; compter clients, opportunités, soumissions avant et après.
- [ ] Vérifier la conservation de tous les clients, documents, événements et travaux préexistants; vérifier l'absence de doublons.
- [ ] Vérifier les sessions, les permissions et l'expiration des jetons après les éventuelles modifications d'authentification.
- [ ] Documenter tout nouveau secret requis **sans le coller** dans un commit, une issue ou un message de chat.

## 2. Préparation Railway

- [ ] Identifier le service, l'environnement et le volume persistant **existants**, ainsi que le chemin réel `DB_PATH`.
- [ ] Vérifier la présence des variables `CRM_PASSWORD`, `DB_PATH`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` si pertinentes.
- [ ] Ajouter les nouvelles variables éventuellement requises par la version sécurisée (vérifier dans le code de Claude), sans divulguer leur valeur.
- [ ] Faire une **sauvegarde restaurable** de SQLite ET des fichiers du volume; conserver une copie externe protégée.
- [ ] Préparer une procédure de retour arrière du code et des données si une migration nécessite un rollback.
- [ ] Planifier la reconnexion des utilisateurs : la nouvelle authentification peut invalider les anciennes sessions.

**Important :** un déploiement automatique ne doit pas être présumé fonctionnel. Vérifier le SHA réellement déployé dans Railway. Si la connexion GitHub ↔ Railway n'a pas déclenché la mise à jour, utiliser l'action *Check for updates / Update* du service et examiner les logs de build.

## 3. Contrôle de lancement (sans synchronisation)

- [ ] Le service Railway démarre sans boucle de redémarrage.
- [ ] La page de connexion fonctionne et la protection des routes API renvoie 401 sans session.
- [ ] Les anciennes pages (Clients, Pipeline, Calendrier, Soumissions, Facturation, Appels, Notes) fonctionnent.
- [ ] Les nouvelles pages (Opportunités, Intégrations, et les pages commerciales ajoutées par Claude) se chargent sur téléphone et sur ordinateur.
- [ ] Le volume monté contient les **mêmes données** qu'avant le déploiement.
- [ ] Les anciens documents sont accessibles.
- [ ] Observer les logs serveur, erreurs de migrations et pannes récurrentes.

## 4. Activation progressive des intégrations

**Étape A : Google.** Vérifier OAuth, `state`, scopes Drive et Gmail, compte sélectionné et rafraîchissement de jeton. Les secrets doivent être stockés de façon sécurisée.

**Étape B : Drive.** Garder la synchronisation automatique désactivée. Faire un `dry-run` complet, vérifier les rapprochements par numéro/identité/téléphone et examiner **chaque** cas « à valider ». Aucun client dupliqué ni dossier terminé rétrogradé. N'activer la synchro réelle qu'après accord explicite.

**Étape C : Meta.** Vérifier les autorisations Page/Lead Ads et le compte de publicité; envoyer un **lead de test** et vérifier qu'il apparaît une seule fois. Importer l'historique sans inonder la boîte courriel.

**Étape D : notifications.** Après accord explicite du responsable, envoyer un courriel de test vers une boîte contrôlée; vérifier la délivrabilité et l'absence de duplicata. Tester une déconnexion temporaire et la reprise.

## 5. Critères de mise en service

- [ ] CI verte et tests de parcours complets réussis.
- [ ] Backup restaurable vérifié.
- [ ] Pas d'erreur critique dans les logs Railway.
- [ ] Pas de doublons à l'import ni de changement inexpliqué de valeur/stade.
- [ ] Notifications et synchronisations surveillées; alerte visible en cas d'échec.
- [ ] Validation finale du responsable pour les connexions externes et les envois réels.

## 6. Suivi après mise en ligne

Contrôler à J+1 et J+7 le nombre de leads reçus, les erreurs API, les synchronisations Drive, les nouvelles soumissions, les notifications, les sauvegardes et les temps de réponse. Consigner les anomalies dans les issues GitHub.

### Règles de collaboration

Claude gère les fonctionnalités et la sécurité déjà annoncées sur l'issue #2. ChatGPT traite ce document et peut effectuer une revue des pull requests de Claude **sans modifier les mêmes fichiers simultanément**. Toute nouvelle intervention doit être annoncée dans l'issue.
