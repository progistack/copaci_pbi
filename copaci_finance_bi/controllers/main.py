# -*- coding: utf-8 -*-
"""
COPACI Finance BI — Controller
Fournit les donnees comptables en JSON pour le dashboard.
Respecte les droits d'acces Odoo (groupes comptables + multi-societe).
"""
import json
import logging
import os
from datetime import date

from odoo import http
from odoo.http import request, Response
from odoo.exceptions import AccessError

_logger = logging.getLogger(__name__)

# Chemin du fichier HTML du dashboard (resolu une seule fois au chargement)
_MODULE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DASHBOARD_PATH = os.path.join(_MODULE_DIR, 'static', 'src', 'dashboard', 'index.html')


class FinanceBIController(http.Controller):

    # ------------------------------------------------------------------
    #  Data endpoint — retourne le JSON attendu par le dashboard
    #
    #  Securite :
    #  - auth='user' : utilisateur authentifie obligatoire
    #  - PAS de .sudo() : les record rules Odoo s'appliquent
    #  - Filtrage company_id explicite : le dashboard envoie company_ids
    #    (ex. ?company_ids=1,3). Le controller intersecte TOUJOURS avec
    #    request.env.companies (les societes autorisees pour l'utilisateur).
    #    → impossible de demander une societe non autorisee
    #  - CSRF : actif par defaut (Odoo ne l'applique que sur POST)
    # ------------------------------------------------------------------
    @http.route('/copaci_finance_bi/data', type='http', auth='user',
                methods=['GET'])
    def get_finance_data(self, **kwargs):
        """Extrait les donnees GL et Bilan depuis account.move.line."""
        user = request.env.user
        AML = request.env['account.move.line']

        # Verification d'acces : l'utilisateur doit etre au moins
        # dans le groupe 'Accounting / Read-only'
        if not user.has_group('account.group_account_readonly'):
            raise AccessError(
                "Acces refuse : vous devez avoir un acces comptable "
                "pour consulter le dashboard Finance BI."
            )

        today = date.today()
        cy = today.year
        years = [cy - 2, cy - 1, cy]

        # ----------------------------------------------------------
        #  Multi-societe : intersection securisee
        #  - allowed  = societes autorisees par le panneau Odoo
        #  - selected = sous-ensemble demande par le dashboard
        #  - Si aucun parametre, on prend toutes les autorisees
        # ----------------------------------------------------------
        allowed_companies = request.env.companies
        allowed_ids = set(allowed_companies.ids)

        company_ids_param = kwargs.get('company_ids', '')
        if company_ids_param:
            try:
                requested = [int(x) for x in company_ids_param.split(',') if x.strip()]
                # Intersection securisee : on ne garde que les IDs autorises
                selected_ids = [cid for cid in requested if cid in allowed_ids]
                if not selected_ids:
                    # Demande invalide → fallback sur toutes les autorisees
                    selected_ids = list(allowed_ids)
            except (ValueError, TypeError):
                selected_ids = list(allowed_ids)
        else:
            selected_ids = list(allowed_ids)

        # Filtre company_id utilise dans TOUTES les requetes
        company_domain = [('company_id', 'in', selected_ids)]

        # Metadata societes pour le dashboard
        company_info = [
            {'id': c.id, 'name': c.name}
            for c in allowed_companies
        ]

        result = {
            '_version': 10,
            '_source': 'Odoo natif (module copaci_finance_bi)',
            '_extracted': today.isoformat(),
            '_companies': company_info,
            '_selectedCompanyIds': selected_ids,
            '_years': years,
        }

        # ----------------------------------------------------------
        #  1. GL mensuel par annee (balance{year})
        # ----------------------------------------------------------
        for year in years:
            try:
                rows = AML.read_group(
                    domain=[
                        ('date', '>=', f'{year}-01-01'),
                        ('date', '<=', f'{year}-12-31'),
                        ('parent_state', '=', 'posted'),
                    ] + company_domain,
                    fields=['balance:sum'],
                    groupby=['account_id', 'date:month'],
                    lazy=False,
                )
                result[f'balance{year}'] = [
                    {
                        'account_id': r['account_id'],
                        'date:month': r['date:month'],
                        'balance': r['balance'],
                    }
                    for r in rows
                ]
                _logger.info(
                    'Finance BI [%s]: GL %d — %d lignes (companies=%s)',
                    ', '.join(c['name'] for c in company_info),
                    year, len(rows), selected_ids,
                )
            except AccessError:
                raise
            except Exception as e:
                _logger.error('Finance BI: erreur GL %d — %s', year, e)
                result[f'balance{year}'] = []

        # ----------------------------------------------------------
        #  2. Snapshots Bilan (bsEnd{year})
        #     Solde cumule de TOUS les comptes au 31/12/year
        #     PAS de filtre account_type — le JS filtre par prefixe
        # ----------------------------------------------------------
        for year in [cy - 2, cy - 1]:
            try:
                rows = AML.read_group(
                    domain=[
                        ('date', '<=', f'{year}-12-31'),
                        ('parent_state', '=', 'posted'),
                    ] + company_domain,
                    fields=['balance:sum'],
                    groupby=['account_id'],
                    lazy=False,
                )
                result[f'bsEnd{year}'] = [
                    {
                        'account_id': r['account_id'],
                        'balance': r['balance'],
                    }
                    for r in rows
                ]
                _logger.info(
                    'Finance BI: BS end %d — %d comptes', year, len(rows),
                )
            except AccessError:
                raise
            except Exception as e:
                _logger.error('Finance BI: erreur BS %d — %s', year, e)
                result[f'bsEnd{year}'] = []

        # ----------------------------------------------------------
        #  3. Bilan courant (bsCurrent)
        # ----------------------------------------------------------
        try:
            rows = AML.read_group(
                domain=[
                    ('date', '<=', today.isoformat()),
                    ('parent_state', '=', 'posted'),
                ] + company_domain,
                fields=['balance:sum'],
                groupby=['account_id'],
                lazy=False,
            )
            result['bsCurrent'] = [
                {
                    'account_id': r['account_id'],
                    'balance': r['balance'],
                }
                for r in rows
            ]
            _logger.info(
                'Finance BI: BS current — %d comptes', len(rows),
            )
        except AccessError:
            raise
        except Exception as e:
            _logger.error('Finance BI: erreur BS current — %s', e)
            result['bsCurrent'] = []

        # ----------------------------------------------------------
        #  Reponse JSON
        # ----------------------------------------------------------
        body = json.dumps(result, ensure_ascii=False)
        return Response(
            body,
            content_type='application/json; charset=utf-8',
            headers={
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
            },
        )

    # ------------------------------------------------------------------
    #  Dashboard page — sert le HTML du dashboard
    # ------------------------------------------------------------------
    @http.route('/copaci_finance_bi/dashboard', type='http', auth='user')
    def dashboard_page(self, **kwargs):
        """Sert le dashboard HTML depuis le fichier statique du module."""
        try:
            with open(_DASHBOARD_PATH, 'r', encoding='utf-8') as f:
                html = f.read()
            return Response(html, content_type='text/html; charset=utf-8')
        except FileNotFoundError:
            _logger.error(
                'Finance BI: dashboard HTML non trouve')
            return Response(
                '<h1>Dashboard Finance BI non disponible</h1>'
                '<p>Veuillez contacter l\'administrateur.</p>',
                content_type='text/html; charset=utf-8',
                status=404,
            )

    # ------------------------------------------------------------------
    #  Static file server — sert les JS/CSS/libs du dashboard
    #  Odoo.sh utilise des assets hashes ; le chemin /<module>/static/
    #  ne fonctionne pas pour les pages servies hors du framework OWL.
    #  Cette route sert les fichiers depuis le repertoire du module.
    # ------------------------------------------------------------------
    _STATIC_DIR = os.path.join(_MODULE_DIR, 'static')

    _MIME = {
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
        '.json': 'application/json',
    }

    @http.route('/copaci_finance_bi/static/<path:filepath>',
                type='http', auth='user', csrf=False)
    def serve_static(self, filepath, **kwargs):
        """Sert les fichiers statiques du dashboard (JS, CSS, images)."""
        # Securite : empecher la traversee de repertoire
        safe_path = os.path.normpath(filepath)
        if safe_path.startswith('..') or safe_path.startswith(os.sep):
            return Response('Forbidden', status=403)

        full_path = os.path.join(self._STATIC_DIR, safe_path)
        # Verifier que le fichier est bien dans le repertoire static
        if not os.path.abspath(full_path).startswith(
                os.path.abspath(self._STATIC_DIR)):
            return Response('Forbidden', status=403)

        if not os.path.isfile(full_path):
            return Response('Not Found', status=404)

        ext = os.path.splitext(full_path)[1].lower()
        content_type = self._MIME.get(ext, 'application/octet-stream')

        try:
            with open(full_path, 'rb') as f:
                content = f.read()
            return Response(
                content,
                content_type=content_type,
                headers={
                    'Cache-Control': 'public, max-age=86400',
                },
            )
        except Exception as e:
            _logger.error('Finance BI: erreur lecture static %s — %s',
                          filepath, e)
            return Response('Internal Error', status=500)
