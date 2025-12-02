sap.ui.define([
    "sap/ui/core/UIComponent",
    "com/carrefour/solicitudasientosajuste/model/models"
], (UIComponent, models) => {
    "use strict";

    return UIComponent.extend("com.carrefour.solicitudasientosajuste.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // 🔹 Cargar XLSX solo si no existe (evita doble carga)
            if (!window.XLSX) {
                const sPath = sap.ui.require.toUrl("com/carrefour/solicitudasientosajuste/thirdparty/xlsx.safe.js");

                const oScript = document.createElement("script");
                oScript.src = sPath;
                oScript.async = false; // asegura orden
                oScript.onload = function () {
                console.info("[Component] ✅ Librería XLSX cargada correctamente (CSP-safe).");
                };
                oScript.onerror = function (e) {
                console.error("[Component] ⚠️ Error cargando XLSX.safe.js", e);
                };
                document.head.appendChild(oScript);
            } else {
                console.info("[Component] ⚙️ XLSX ya estaba disponible globalmente.");
            }


            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");

            // enable routing
            this.getRouter().initialize();
        }
    });
});