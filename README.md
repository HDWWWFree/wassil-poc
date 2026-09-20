# ECORoute

Application web (PWA) de **réservation de capacité de chargement pour
camions** : des chauffeurs publient la place qu'il leur reste (en
m³), des clients réservent — ou postent directement leur besoin de
transport (marché inversé), auquel des chauffeurs répondent — avec
chat en temps réel, suivi de trajet, et notation dans les deux sens.

**ECORoute met en relation, rien de plus** : aucun paiement sur la
plateforme, aucun prix imposé, aucune assurance. Voir la
[charte](docs/CHARTE.md).

- Front : HTML / CSS / JavaScript vanilla, **sans build**
- Backend : [Supabase](https://supabase.com) (PostgreSQL, Auth, Row Level Security, Realtime)
- Cartes & itinéraires : [Leaflet](https://leafletjs.com) + [OpenStreetMap](https://www.openstreetmap.org) (Nominatim, OSRM)
- Hébergement : GitHub Pages (gratuit)

## Fonctionnalités

- Compte unique, rôle choisi une fois à l'inscription (client **ou**
  chauffeur) — le chauffeur complète permis + plaque avant de pouvoir
  publier
- Recherche de trajets (texte, tri par date/prix/capacité), pagination
- Publication de trajet : départ/arrivée avec autocomplétion
  d'adresse, géolocalisation, carte et distance/durée calculées en
  direct, type de véhicule, capacité, prix
- Réservation avec estimation de prix en direct
- Marché inversé : le client poste une demande, les chauffeurs
  disponibles proposent leurs services, le client accepte
- Cycle de réservation : en attente → validée → en route (suivi
  simulé avec ETA) → livrée (ou refusée / annulée)
- Numéros de téléphone révélés aux deux parties uniquement après
  validation
- Chat en temps réel (bulles de message, notification "non lu")
  par réservation et par proposition
- Notation du chauffeur après livraison, paliers d'expérience,
  estimation CO₂ économisé
- Mode sombre, PWA installable (Android et iOS)

## Mise en route (≈ 15 min)

### 1. Supabase

1. Créez un **nouveau projet** sur supabase.com (choisissez une
   région proche de vos utilisateurs — Europe si vous visez la
   France, par exemple).
2. `SQL Editor` → New query → collez tout `supabase/schema.sql` →
   **Run**.
3. `Authentication` → `Providers` → Email : pour vos premiers tests,
   désactivez « Confirm email » (sinon chaque inscription demande de
   cliquer un lien reçu par mail).
4. `Authentication` → `URL Configuration` → **Site URL** = l'adresse
   GitHub Pages (étape 3 ci-dessous).
5. `Project Settings` → `API` : notez **Project URL** et la clé
   **anon public**.

### 2. Configurer l'application

Éditez `config.js` et remplacez `SUPABASE_URL` et `SUPABASE_ANON_KEY`.
La clé « anon » peut être publique (la sécurité est assurée par les
règles RLS du schéma). **Ne mettez jamais la clé `service_role` dans
ce dépôt.**

### 3. GitHub Pages

1. Créez un dépôt GitHub et envoyez-y les fichiers de ce dossier.
2. `Settings` → `Pages` → Source : **Deploy from a branch** → branche
   `main`, dossier `/ (root)` → Save.
3. Après ~1 minute : `https://<votre-compte>.github.io/<repo>/`

En ligne de commande :

```
git init
git add .
git commit -m "ECORoute v1"
git branch -M main
git remote add origin https://github.com/<votre-compte>/<repo>.git
git push -u origin main
```

### 4. Tester en local (facultatif)

```
python3 -m http.server 8000     # puis ouvrir http://localhost:8000
```

## Scénario de test

1. Créez deux comptes (deux navigateurs, ou un en navigation
   privée) : un **chauffeur** et un **client**.
2. Chauffeur : à la première connexion, choisir « Chauffeur »,
   compléter permis/plaque → Publier une dispo.
3. Client : à la première connexion, choisir « Client » → onglet
   Trajets → réserver sur le trajet publié.
4. Chauffeur : valider la demande → contact révélé → « Démarrer le
   trajet » (suivi + ETA en direct) → « Marquer livré ».
5. Client : note le chauffeur. Le chat fonctionne à toutes les
   étapes, avec notification de message non lu.
6. Testez aussi le sens inverse : Client → onglet Demandes → poster
   une demande ; Chauffeur → onglet Demandes clients → proposer ses
   services ; Client → accepter.

## Structure

```
index.html              coquille de l'app (PWA)
app.js                  état, rendu des vues, logique métier, chat temps réel
style.css                interface (mobile d'abord, mode sombre)
config.js                URL et clé anon Supabase  ← à éditer
sw.js, manifest.json, icons/   PWA
supabase/schema.sql      tables, RLS, realtime
supabase/README.md       note sur l'usage du schéma (nouveau projet vs existant)
docs/CHARTE.md           charte de la plateforme
```

## À savoir avant une ouverture au public

- **Juridique** : la charte est un modèle, à faire relire par un
  professionnel du droit avant toute communication publique. Publier
  un site/tester entre vous ne nécessite pas de société. Dès que la
  plateforme **fixe un prix, prend une commission ou facture le
  transport**, un cadre différent s'applique selon le pays visé — en
  France, cela peut relever du statut réglementé de
  *commissionnaire de transport* (inscription à un registre,
  attestation de capacité professionnelle) ; en Algérie, du statut
  d'*e-fournisseur* au sens de la loi sur le commerce électronique.
  À valider avec un avocat dans chaque pays visé.
- **Marque** : plusieurs noms ont été écartés en cours de route pour
  conflit (Tawssil, Qafila, FullTruck, Wasla) — vérifiez « ECORoute »
  auprès de l'INPI/ONDA/OMPI avant toute communication publique ;
  au moins deux projets non commerciaux portent un nom très proche
  (EcoRoute, EcoRoute AI), sans dépôt de marque identifié à ce jour.
- **Non géré pour l'instant** : trajets multi-arrêts, signature
  électronique de livraison, lien de suivi partageable sans compte,
  litige formel, langue arabe/RTL et anglais (français uniquement à
  ce stade), vraies notifications push mobile, suppression de compte
  en libre-service, pagination côté serveur (actuellement côté
  navigateur — suffisant tant que le volume reste modeste).

## Pistes suivantes

Trilingue FR/EN/AR avec interface RTL pour l'arabe, notifications push
(Web Push + Supabase Edge Functions), signature électronique à la
livraison, trajets multi-arrêts, filtre par rayon géographique, app
native (Capacitor) pour publication sur les stores.
