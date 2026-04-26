# COPACI BI Finance
# - Dashboard HTML/JS monolithique (static/src/html/dashboard.html)
# - OWL action client pour charger le HTML en blob (static/src/js/dashboard_action.js)
# - Controller Python conserve pour compatibilite avec le script local
#   refresh_data.pl qui appelle /copaci_finance_bi/data pour generer le snapshot JSON
from . import controllers
