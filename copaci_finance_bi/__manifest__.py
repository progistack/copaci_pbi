{
    'name': 'COPACI BI Finance',
    'version': '18.0.2.0.0',
    'category': 'Accounting/Reporting',
    'summary': 'Dashboard BI Finance COPACI — P&L, Bilan, BFR, Cash-Flow, KPIs',
    'description': """
        Module de Business Intelligence financiere COPACI.

        Fonctionnalites :
        - Compte de resultat interactif (7 niveaux de detail)
        - Bilan patrimonial avec series mensuelles
        - BFR et cycle de conversion de tresorerie (DSO, DIO, DPO, CCC)
        - Flux de tresorerie (Cash-Flow Statement)
        - KPIs et ratios de performance
        - Suivi des dettes financieres
        - Comparaison N-1 et Budget
        - Modes : Mensuel / YTD / LTM
        - Export PowerPoint natif (pptxgenjs, charts editables OOXML)
        - Theme dark / light
        - Drill-down par compte comptable
        - Donnees temps reel via controller HTTP natif (account.move.line)
        - Filtrage multi-societe avec selecteur integre
        - Acces controle par les groupes comptables Odoo
    """,
    'author': 'COPACI',
    'website': 'https://copaci.odoo.com',
    'license': 'LGPL-3',
    'depends': [
        'account',
    ],
    'data': [
        'security/ir.model.access.csv',
        'views/finance_bi_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'copaci_finance_bi/static/src/xml/finance_bi_templates.xml',
            'copaci_finance_bi/static/src/js/finance_bi_action.js',
        ],
    },
    'installable': True,
    'application': True,
    'auto_install': False,
}
