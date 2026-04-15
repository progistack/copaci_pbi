/** @odoo-module **/

import { Component, useState, onMounted } from "@odoo/owl";
import { registry } from "@web/core/registry";

/**
 * Composant OWL — COPACI Finance BI Dashboard
 *
 * Charge le dashboard Finance dans un iframe qui pointe vers
 * le controller /copaci_finance_bi/dashboard.
 * Le dashboard recupere ses donnees via /copaci_finance_bi/data
 * (requete unique au controller Python, acces natif Odoo).
 *
 * Architecture :
 * - L'iframe isole le CSS/JS du dashboard de l'interface Odoo
 * - La session Odoo (cookie) est partagee → auth='user' fonctionne
 * - Pas de conversion OWL du dashboard existant (6400 lignes)
 *   → preservation integrale de toutes les fonctionnalites
 *
 * Securite :
 * - Le menu n'est visible que pour les utilisateurs ayant le groupe
 *   account.group_account_readonly (configure dans views.xml)
 * - Le controller verifie egalement le groupe avant de servir les donnees
 * - Le filtrage multi-societe est gere par les record rules Odoo
 */
class BiFinanceDashboard extends Component {
    static template = "copaci_finance_bi.Dashboard";

    setup() {
        this.state = useState({
            loading: true,
            iframeSrc: "/copaci_finance_bi/dashboard",
        });

        onMounted(() => {
            // Fallback : si t-on-load ne se declenche pas (cas rare),
            // forcer l'arret du spinner apres 15s.
            this._loadTimeout = setTimeout(() => {
                if (this.state.loading) this.state.loading = false;
            }, 15000);
        });
    }

    onIframeLoad() {
        this.state.loading = false;
        if (this._loadTimeout) {
            clearTimeout(this._loadTimeout);
            this._loadTimeout = null;
        }
    }
}

// Enregistrement dans le registre des actions client
registry.category("actions").add("copaci_finance_bi.dashboard", BiFinanceDashboard);
