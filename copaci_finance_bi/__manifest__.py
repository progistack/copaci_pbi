{
    'name': 'COPACI BI Finance',
    'version': '18.0.4.0.1',
    'category': 'Accounting/Reporting',
    'summary': 'Dashboard Finance BI interactif — COPACI',
    'description': """
COPACI BI Finance — Dashboard financier interactif
===================================================

Dashboard financier temps reel branche sur les donnees comptables Odoo via
JSON-RPC direct. Un controller Python expose /copaci_finance_bi/data pour
le script local refresh_data.pl (mode JSON statique hors Odoo).

Fonctionnalites :
-----------------
- Compte de resultat (P&L) avec modes Mensuel / YTD / LTM
- Bilan patrimonial mensualise
- Tresorerie et BFR (DSO, DIO, DPO, CCC)
- Flux de tresorerie (CFS)
- KPIs et ratios de performance
- Dettes financieres par banque et facilite
- Drill-down P&L en side panel (comptes -> ecritures individuelles)
- Filtre multi-societe natif (respecte les droits utilisateur)
- Comparaison N-1 et budget
- Export PowerPoint natif (charts OOXML editables)
- Theme dark / light
- Mode RPC live (donnees temps reel) ou JSON statique (snapshot)

Securite :
----------
Acces restreint au groupe "Finance BI / Utilisateur". Les donnees affichees
respectent les droits comptables de l'utilisateur — filtrage automatique par
societe autorisee via allowed_company_ids sur chaque RPC.

Deploiement :
-------------
Aucun modele custom. Le dashboard est un fichier HTML/JS statique servi
depuis /copaci_finance_bi/static/ et qui appelle directement les modeles
Odoo (account.move.line, account.account, etc.) via /web/dataset/call_kw.

Le controller Python /copaci_finance_bi/data n'est pas utilise par le
dashboard en mode RPC live ; il sert uniquement au script local
refresh_data.pl pour generer un snapshot JSON consommable hors Odoo.
""",
    'author': 'COPACI',
    'website': 'https://copaci.odoo.com',
    'license': 'LGPL-3',
    'depends': [
        'account',
    ],
    'data': [
        'security/security.xml',
        'security/ir.model.access.csv',
        'views/actions.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'copaci_finance_bi/static/src/js/dashboard_action.js',
        ],
    },
    'installable': True,
    'application': True,
    'auto_install': False,
    'icon': '/copaci_finance_bi/static/description/icon.png',
}
