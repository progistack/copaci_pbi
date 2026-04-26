/** @odoo-module **/

import { registry } from "@web/core/registry";
import { Component, xml, onMounted, useRef } from "@odoo/owl";

/**
 * COPACI BI Finance — Action client (mecanisme blob URL)
 * -------------------------------------------------------
 * Odoo applique CSP "default-src 'none'" sur tous les fichiers statiques,
 * ce qui bloque JS inline, CSS inline et CDN quand on charge via iframe.src.
 *
 * Solution : on fetch le HTML, on cree un blob URL (qui herite de l'origin
 * Odoo sans CSP restrictive), et on charge le blob dans l'iframe.
 * Les cookies de session sont partages, les RPC fonctionnent.
 *
 * Teste et valide sur la recette le 26/04/2026.
 */
class FinanceBIDashboard extends Component {
    static template = xml`
        <div class="o_finance_bi_dashboard" style="width:100%;height:calc(100vh - 46px);margin:0;padding:0;display:flex;align-items:center;justify-content:center;">
            <iframe t-ref="frame"
                    title="COPACI BI Finance Dashboard"
                    style="width:100%;height:100%;border:none;display:none;"
                    sandbox="allow-scripts allow-same-origin allow-popups"/>
            <div t-ref="loader" style="text-align:center;color:#888;">
                <div style="font-size:22px;font-weight:600;margin-bottom:10px;">Finance BI</div>
                <div style="font-size:14px;">Chargement du dashboard...</div>
            </div>
        </div>
    `;

    setup() {
        this.frameRef = useRef("frame");
        this.loaderRef = useRef("loader");
        onMounted(() => this._loadDashboard());
    }

    async _loadDashboard() {
        try {
            // 1. Fetch le HTML depuis les assets statiques du module
            const resp = await fetch("/copaci_finance_bi/static/src/html/dashboard.html");
            if (!resp.ok) throw new Error("HTTP " + resp.status);
            const html = await resp.text();

            // 2. Blob URL — herite de l'origin, bypass CSP
            const blob = new Blob([html], { type: "text/html" });
            const blobUrl = URL.createObjectURL(blob);

            // 3. Charger dans l'iframe
            const frame = this.frameRef.el;
            frame.addEventListener("load", () => {
                frame.style.display = "block";
                if (this.loaderRef.el) this.loaderRef.el.style.display = "none";
                URL.revokeObjectURL(blobUrl);
            }, { once: true });

            frame.src = blobUrl;

        } catch (err) {
            console.error("[Finance BI] Erreur chargement:", err);
            if (this.loaderRef.el) {
                this.loaderRef.el.innerHTML =
                    '<div style="color:#e74c3c;font-size:15px;margin-bottom:8px;">Erreur de chargement</div>' +
                    '<div style="color:#999;font-size:13px;">' + (err.message || "Impossible de charger le dashboard") + '</div>' +
                    '<button onclick="location.reload()" style="margin-top:14px;padding:8px 20px;background:#0d9488;color:#fff;border:none;border-radius:6px;cursor:pointer;">Reessayer</button>';
            }
        }
    }
}

registry.category("actions").add("copaci_finance_bi.dashboard", FinanceBIDashboard);
