# COPACI BI Finance — Module Odoo 18

Module Odoo qui publie le dashboard Finance BI interactif. Remplace la
version `18.0.3.0.1` de l'intégrateur par `18.0.4.0.0` (nouveau contenu,
même nom technique).

## Structure

```
copaci_finance_bi/
├── __manifest__.py              v18.0.4.0.0
├── __init__.py                  vide (pas de modèle Python)
├── README.md                    ce fichier
├── security/
│   ├── security.xml             groupe "Finance BI / Utilisateur"
│   └── ir.model.access.csv      vide (pas de modèle custom)
├── views/
│   └── actions.xml              action client + menu app
└── static/
    ├── description/
    │   └── icon.png             icône de l'app
    └── src/
        ├── html/
        │   └── dashboard.html   le dashboard (copie de preview.html)
        └── js/
            └── dashboard_action.js   composant OWL (iframe du dashboard)
```

## Remplacement du module existant sur la recette

1. Dans le repo git de la recette Odoo, aller dans le dossier
   `copaci_finance_bi/` (celui de l'intégrateur)
2. **Supprimer tout son contenu**
3. **Copier le contenu de ce dossier** (`odoo_module/copaci_finance_bi/`) à sa place
4. Commiter et pusher

```bash
# Depuis le repo de la recette
cd copaci_finance_bi/
rm -rf *
cp -r /path/to/this/odoo_module/copaci_finance_bi/* .
git add -A
git commit -m "Upgrade copaci_finance_bi to v18.0.4.0.0 — dashboard RPC live"
git push
```

5. Attendre le déploiement Odoo.sh (qq minutes)
6. Dans l'Odoo recette : **Apps → Mettre à jour la liste des apps**
7. Chercher "COPACI BI Finance" → **Mettre à jour**

La version passe à `18.0.4.0.0` et le nouveau dashboard prend le relais
sur le même menu.

## Configurer l'accès

Par défaut, **personne n'a accès**. Pour ajouter des utilisateurs :

1. Odoo → **Paramètres → Utilisateurs**
2. Ouvrir un utilisateur (ex: Victor Any-Grah)
3. Onglet **Droits d'accès** → chercher la section "Comptabilité"
4. Cocher **Finance BI / Utilisateur**
5. Sauvegarder

Les utilisateurs **sans ce groupe ne voient pas le menu** "COPACI BI
Finance" dans la barre de navigation.

## Comment ça marche

### Aucun Python, aucun controller

Le module est **100% statique côté serveur Odoo**. Pas de modèle, pas
de controller, pas de logique métier Python. Tout est dans le HTML/JS.

### Pipeline de données

1. L'utilisateur clique sur le menu "COPACI BI Finance"
2. L'action client monte un composant OWL qui affiche un `<iframe>`
3. L'iframe charge `/copaci_finance_bi/static/src/html/dashboard.html`
4. Le dashboard détecte qu'il est sur `*.odoo.com` → bascule en
   **mode RPC live**
5. Il appelle `/web/session/get_session_info` pour récupérer les
   sociétés autorisées de l'utilisateur
6. Il appelle `/web/dataset/call_kw` pour extraire :
   - `balance20XX` (P&L mensuel via `read_group`)
   - `bsEnd20XX` / `bsCurrent` (Bilan via `read_group`)
   - `accounts` (référentiel comptes)
   - `debt_lines` (triplets account/partner/journal)
   - `move_lines` (écritures P&L détail + agrégées)
7. Les droits Odoo s'appliquent automatiquement — aucun risque de
   fuite inter-société

### Fallback hors Odoo

Si quelqu'un ouvre `dashboard.html` en direct (pas via Odoo), le
dashboard bascule en **mode JSON statique** et charge
`copaci_finance_data.json` (snapshot local). Dans le module Odoo ce
fichier n'existe pas, donc le fallback produit une erreur douce avec
bannière — comportement attendu si usage hors iframe Odoo.

### Session expirée

Si les cookies de session Odoo expirent pendant l'utilisation, un
overlay 🔒 "Session Odoo expirée" s'affiche avec un bouton
"Recharger la page" qui déclenche `window.location.reload()` — l'utilisateur
est redirigé vers `/web/login` si vraiment déconnecté, ou renouvelle
automatiquement sa session sinon.

## Tests

### Test 1 — Utilisateur avec droits

1. Compte admin (Victor) ou compte avec groupe "Finance BI / Utilisateur"
2. Le menu "COPACI BI Finance" est visible
3. Clic → overlay de chargement avec checklist (~10-20 sec)
4. Dashboard rendu, badge `Live` dans le header avec timestamp
5. Tous les onglets fonctionnent

### Test 2 — Utilisateur sans droits

1. Compte standard (sans le groupe Finance BI)
2. Le menu "COPACI BI Finance" est **absent**
3. Même avec l'URL directe, accès refusé

### Test 3 — Utilisateur COPACI DG uniquement

1. Compte qui n'a que la société COPACI DG autorisée
2. Dashboard charge avec seulement les données COPACI DG
3. Le sélecteur société est **masqué** (puisqu'il n'y a qu'une société)

### Test 4 — Session expirée

1. DevTools → Application → Cookies → supprimer `session_id`
2. Cliquer sur "Rafraîchir" dans le dashboard
3. Overlay 🔒 "Session Odoo expirée" s'affiche
4. Cliquer "Recharger la page" → comportement normal

## Versions

| Version | Date | Changement |
|---------|------|------------|
| 18.0.3.0.1 | — | Version intégrateur initial (à remplacer) |
| **18.0.4.0.0** | 2026-04-24 | Dashboard refondu : mode RPC live + JSON fallback, drill P&L side panel, gestion session expirée, groupe d'accès dédié |
