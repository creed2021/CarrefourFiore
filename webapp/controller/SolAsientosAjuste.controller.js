sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Messaging",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/odata/v4/ODataModel",
    "sap/ui/model/json/JSONModel"
], (Controller, Messaging, MessageToast, MessageBox, ODataModel, JSONModel, xlsx) => {
    "use strict";


    const XLSX = window.XLSX;

    return Controller.extend("com.carrefour.solicitudasientosajuste.controller.SolAsientosAjuste", {
        onInit: function () {
            this.completaUsuario();

            sap.ui.getCore().attachValidationError(oEvent => {
                oEvent.getParameter("element").setValueState(sap.ui.core.ValueState.Error);
            });
            sap.ui.getCore().attachValidationSuccess(oEvent => {
                oEvent.getParameter("element").setValueState(sap.ui.core.ValueState.None);
            });
        },


        onAfterRendering: function () {
            var oAsientoBinding = this.getView().getModel().bindList("/CabeceraAsiento");

            this._uploadSessionId = crypto.randomUUID();
            this._adjuntosPreparados = false;

            this.oNewAsientoContext = oAsientoBinding.create({
                correo_solicitante: this.completaUsuario(),
                periodoAnio: new Date().getFullYear(),
                periodoMes: new Date().getMonth() + 1,
                moneda: "ARS",
                claseDocumento: "SA",
                sociedad: "INCS",
                items: [],
                adjuntosSolicitud: []
            });

            this.oNewAsientoContext.created().catch(err => MessageBox.error(err.message));
            this.getView().setBindingContext(this.oNewAsientoContext);

        },

        completaUsuario() {
            //Si está corriendo en Launchpad (FLP)
            if (sap.ushell && sap.ushell.Container) {
                const oUserInfo = sap.ushell.Container.getService("UserInfo");
                const sEmail = oUserInfo.getEmail();
                return sEmail || "usuario.local.unchell@dominio.com";
            } else {
                // Ejecución local
                return "usuario.local@dominio.com";
            }
        },



        // onSave: async function () {
        //     const oModel = this.getView().getModel();
        //     const oMsgManager = sap.ui.getCore().getMessageManager();
        //     oMsgManager.removeAllMessages();

        //     sap.ui.core.BusyIndicator.show(0);

        //     try {
        //         await oModel.submitBatch("myAppUpdateGroup");

        //         const aMessages = oMsgManager.getMessageModel().getData();
        //         const aErrores = aMessages.filter(m => m.type === sap.ui.core.MessageType.Error);

        //         if (aErrores.length > 0) {
        //         const sTextos = aErrores.map(m => `• ${m.message}`).join("\n");
        //         MessageBox.error("Errores detectados:\n\n" + sTextos, {
        //             title: "Errores en el envío"
        //         });
        //         } else {
        //             sap.m.MessageToast.show("✅ Asiento guardado correctamente!!!", {
        //                 onClose: function () {
        //                 if (sap.ushell && sap.ushell.Container) {
        //                     sap.ushell.Container.getServiceAsync("CrossApplicationNavigation")
        //                     .then((navService) => {
        //                         navService.toExternal({ target: { shellHash: "#" } });
        //                     });
        //                 } else {
        //                     window.close();
        //                 }
        //                 }
        //             });
        //         }

        //     } catch (err) {
        //         console.error("Error en submitBatch:", err);
        //         MessageBox.error("Error general al guardar: " + err.message);
        //     } finally {
        //         sap.ui.core.BusyIndicator.hide();
        //     }
        // },




        onSave: async function () {
            const oMsgManager = sap.ui.getCore().getMessageManager();
            oMsgManager.removeAllMessages();


            var valorPeriodo = this.getView().byId("txtPeriodo").getValue();
            var periodoMes = "";
            var periodoAnio = "";

            if (valorPeriodo && valorPeriodo.includes("/")) {
                const [mes, anio] = valorPeriodo.split("/"); // divide por "/"

                periodoMes = parseInt(mes, 10);
                periodoAnio = parseInt(anio, 10);
            }


            // 🔹 Validar campos antes de enviar
            if (!this._validarCamposRequeridos()) {
                sap.m.MessageBox.warning("Por favor, complete todos los campos obligatorios antes de enviar.");
                return;
            }

            sap.ui.core.BusyIndicator.show(0);
            const oModel = this.getView().getModel();

            try {
                // Setear propiedades en el modelo antes de guardar
                const oContext = this.getView().getBindingContext();
                oContext.setProperty("periodoMes", periodoMes);
                oContext.setProperty("periodoAnio", periodoAnio);


                await oModel.submitBatch("myAppUpdateGroup");
                const aMessages = oMsgManager.getMessageModel().getData();
                const aErrores = aMessages.filter(m => m.type === sap.ui.core.MessageType.Error);

                if (aErrores.length > 0) {
                    const sTextos = aErrores.map(m => `• ${m.message}`).join("\n");
                    MessageBox.error("Errores detectados:\n\n" + sTextos, {
                        title: "Errores en el envío"
                    });
                } else {
                    MessageToast.show("✅ Asiento guardado correctamente!!!", {
                        onClose: function () {
                            if (sap.ushell && sap.ushell.Container) {
                                sap.ushell.Container.getServiceAsync("CrossApplicationNavigation")
                                    .then(navService => navService.toExternal({ target: { shellHash: "#" } }));
                            } else {
                                window.close();
                            }
                        }
                    });
                }
            } catch (err) {
                sap.ui.core.BusyIndicator.hide();
                console.error("Error en submitBatch:", err);

                const mensajePrincipal = err?.error?.message || "Error inesperado";
                const detalles = err?.error?.details;

                // 🔹 Si hay detalles estructurados → mostrar tabla
                if (Array.isArray(detalles) && detalles.length > 0) {
                    this._mostrarDialogoErrores(mensajePrincipal, detalles);
                } else {
                    // 🔹 Si no hay detalles → mostrar error simple
                    MessageBox.error(mensajePrincipal, {
                        title: "Error"
                    });
                }
            } finally {
                sap.ui.core.BusyIndicator.hide();
            }
        },

        agregaAdjunto: function (identificadorAdjuntoParam, nombreAdjuntoParam) {

            // Obtener el binding REAL de adjuntos creado por la tabla oculta
            this.byId("tbladjuntosSolicitud").getBinding("items").create({
                nombreAdjunto: nombreAdjuntoParam,
                identificadorAdjunto: identificadorAdjuntoParam
            });

            console.log("Adjunto agregado a OData:", nombreAdjuntoParam);
        },
        onFileChangeAdjunto: async function (oEvent) {
            const oFile = oEvent.getParameter("files")?.[0];
            if (!oFile) {
                MessageBox.error("No se seleccionó ningún archivo.");
                return;
            }

            const sUrlBackend =
                this._getAppModulePath() + "/odata/v4/gestiona-asientos/prepareAdjuntos";

            // 1️⃣ Preparar carpeta temporal (una sola vez)
            if (!this._adjuntosPreparados) {
                await fetch(sUrlBackend, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        sessionId: this._uploadSessionId
                    })
                });
                this._adjuntosPreparados = true;
            }

            // 2️⃣ Subir archivo a carpeta temporal
            const nombreFinal = this.formatoNombreArchivo(oFile.name);
            const formData = new FormData();

            formData.append("cmisaction", "createDocument");
            formData.append("propertyId[0]", "cmis:name");
            formData.append("propertyValue[0]", nombreFinal);
            formData.append("propertyId[1]", "cmis:objectTypeId");
            formData.append("propertyValue[1]", "cmis:document");
            formData.append("succinct", "true");
            formData.append("includeAllowableActions", "true");
            formData.append("media", oFile, nombreFinal);

            const REPO_ID_DEV = "59ec1b8c-cf7c-465c-bd5b-460bcb6ca9a4";
            const REPO_ID_PRD = "f2fdf3d8-7692-4816-ba33-563a9390dae1";

            const BASE_URL_PRD = "";
            const BASE_URL_DEV = "https://process-automation-95oeuot4.us30.sdm.cloud.sap" +
                "/comsapecmreuse.comsapecmreusedocumentTable/api/browser/";


            console.log("this._getAppModulePath()*******", this._getAppModulePath());

            const sUrl =
                this._getAppModulePath() +
                "/apidms/browser/"+REPO_ID_PRD+"/root/solicitud-asientos-adjuntos/temp/" +
                this._uploadSessionId;

            console.log("***********sUrl*********", sUrl);

            const response = await fetch(sUrl, {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                throw new Error("Error subiendo archivo a DMS");
            }

            const data = await response.json();
            const objectId = data?.succinctProperties?.["cmis:objectId"];
            const fileName = data?.succinctProperties?.["cmis:contentStreamFileName"];

            const objectIdEncoded = encodeURIComponent(objectId);
            const fileNameEncoded = encodeURIComponent(fileName);

            const urlAdjunto =
                BASE_URL_DEV +
                REPO_ID_PRD +
                "/root" +
                "?objectId=" + objectIdEncoded +
                "&cmisSelector=content" +
                "&download=attachment" +
                "&filename=" + fileNameEncoded;

            // 3️⃣ Crear registro OData (AdjuntoSolicitud)
            this.byId("tbladjuntosSolicitud").getBinding("items").create({
                identificadorAdjunto: objectId,
                nombreAdjunto: fileName,
                urlAdjunto: urlAdjunto,
                sessionId: this._uploadSessionId
            });

            MessageToast.show("Adjunto cargado correctamente");
        },


        onFileChangeAdjuntoOLD: function (oEvent) {
            let that = this;
            let rutaInicial = "/apidms/browser/"; //despliegue
            const oFile = oEvent.getParameter("files")?.[0];
            if (!oFile) {
                MessageBox.error("No se seleccionó ningún archivo.");
                return;
            }

            // ➤ Construir nombre nuevo: nombre_base + fecha y hora
            const nombreBase = oFile.name.substring(0, oFile.name.lastIndexOf(".")) || oFile.name;
            const extension = oFile.name.split('.').pop();
            const now = new Date();

            const timestamp = now.getDate().toString().padStart(2, '0') +
                (now.getMonth() + 1).toString().padStart(2, '0') +
                now.getFullYear().toString() +
                now.getHours().toString().padStart(2, '0') +
                now.getMinutes().toString().padStart(2, '0') +
                now.getSeconds().toString().padStart(2, '0');

            const nombreFinal = `${nombreBase}_${timestamp}.${extension}`;

            var myHeaders = new Headers();
            const formData = new FormData();
            formData.append("cmisaction", "createDocument");
            formData.append("propertyId[0]", "cmis:name");
            formData.append("propertyValue[0]", this.formatoNombreArchivo(nombreFinal));
            formData.append("propertyId[1]", "cmis:objectTypeId");
            formData.append("propertyValue[1]", "cmis:document");
            formData.append("filename", this.formatoNombreArchivo(nombreFinal));
            formData.append("_charset", "UTF-8");
            formData.append("succinct", "true");
            formData.append("includeAllowableActions", "true");
            formData.append("media", oFile, nombreFinal); // obligatorio

            const sUrl = that._getAppModulePath() + rutaInicial + "59ec1b8c-cf7c-465c-bd5b-460bcb6ca9a4/root/pupuno";

            fetch(sUrl, {
                method: "POST",
                headers: myHeaders,
                body: formData,
                redirect: 'follow'
            })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    //console.log("Archivo subido:", data);
                    MessageToast.show("Archivo subido correctamente.");
                    //Obtener Archivo Subido el ID
                    // ✅ Obtener el ID del documento subido
                    const objectId = data?.succinctProperties?.["cmis:objectId"];
                    const fileName = data?.succinctProperties?.["cmis:contentStreamFileName"];

                    if (objectId) {
                        console.log("ID del documento subido:", objectId);

                        // Guardar en un modelo JSON para reutilizar en la vista
                        // const oModel = new sap.ui.model.json.JSONModel({
                        //     objectId: objectId,
                        //     fileName: fileName
                        // });
                        // that.getView().setModel(oModel, "DMSFile");

                        // that.byId("tbladjuntosSolicitud").getBinding("adjuntosSolicitud").create({
                        //     identificadorAdjunto: objectId,
                        //     nombreAdjunto: fileName
                        // });
                        this.agregaAdjunto(objectId, fileName);

                        // Mostrar al usuario
                        MessageBox.show(`Archivo "${fileName}" subido con éxito. ID: ${objectId}`);
                    } else {
                        MessageBox.warning("Archivo subido, pero no se pudo obtener el ID del documento.");
                    }
                })
                .catch(err => {
                    console.error("Error al subir archivo:", err);
                    MessageBox.error(`Error: ${err.message}`);
                });
        },

        onFileChange: async function (oEvent) {
            // esperar a que XLSX esté disponible
            if (!window.XLSX) {
                sap.m.MessageBox.warning("La librería Excel todavía se está cargando. Espere un momento y vuelva a intentar.");
                return;
            }

            const XLSX = window.XLSX; // asegurate de tomar la versión global

            var aFiles = oEvent.getParameter("files");
            if (!aFiles || aFiles.length === 0) {
                MessageToast.show("No se seleccionó ningún archivo");
                return;
            }

            var oFile = aFiles[0]; // primer archivo
            MessageToast.show("Leyendo: " + oFile.name);

            var reader = new FileReader();
            reader.onload = (e) => {
                var data = new Uint8Array(e.target.result);
                var workbook = XLSX.read(data, { type: 'array' });
                var firstSheet = workbook.SheetNames[0];
                var excelRows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);

                // modelo de la tabla
                //var oTable = this.byId("tblItems");
                //DJ var oModel = oTable.getModel("Asientos");

                // vaciar antes de cargar nuevo Excel
                //DJ oModel.setProperty("/", []);
                var aData = [];

                //Controlar 900 registros
                if (excelRows.length > 900) {
                    MessageBox.error(
                        `El Excel no puede tener mas de 900 registros.`
                    );
                    return; // aborta la función entera
                }

                // recorrer con for para poder salir en caso de error
                for (var i = 0; i < excelRows.length; i++) {
                    var row = excelRows[i];

                    // limpiar keys
                    var cleaned = {};
                    Object.keys(row).forEach(key => {
                        cleaned[key.trim()] = row[key];
                    });

                    var clave = cleaned["Clave"];

                    // validar clave
                    if (clave !== 40 && clave !== 50 && clave !== "40" && clave !== "50") {
                        MessageBox.error(
                            `Error en fila ${i + 1}: Clave inválida (${clave}). Se canceló la carga.`
                        );
                        return; // aborta la función entera
                    }

                    // si todo ok, agrego fila
                    // aData.push({
                    //     NroAsiento: i + 1,
                    //     Clave: cleaned["Clave"],
                    //     CuentaContable: cleaned["Cuenta"],
                    //     Descripcion: cleaned["Descripcion Asiento"],
                    //     Importe: cleaned["Importe"] !== undefined ? String(cleaned["Importe"]) : "",
                    //     CentroCoste: cleaned["CECO"]
                    // });

                    this.byId("tblItems").getBinding("items").create({
                        numeroLinea: i + 1,
                        clave: cleaned["Clave"],
                        cuentaContable_ID: String(cleaned["Cuenta"]),
                        descripcion: cleaned["Descripcion Asiento"],
                        importe: cleaned["Importe"] !== undefined ? cleaned["Importe"] : "",
                        centroCosto: String(cleaned["CECO"])
                    });
                }

                MessageToast.show("Se cargaron " + aData.length + " filas del Excel");

                // 🔽 Agregamos la validación de totales aquí 🔽
                this._validarTotales(aData);
            };
            reader.readAsArrayBuffer(oFile);
        },

        // --- nueva función de validación ---
        _validarTotales: function (aData) {
            let total40 = 0;
            let total50 = 0;

            aData.forEach((item) => {
                const clave = parseInt(item.Clave);
                const importe = parseFloat(item.Importe) || 0;

                if (clave === 40) {
                    total40 += importe;
                } else if (clave === 50) {
                    total50 += importe;
                }
            });

            if (Math.abs(total40 - total50) == 0) {
                sap.m.MessageBox.success("El saldo del Asiento es cero.")
            }
            else {
                sap.m.MessageBox.error(
                    `❌ Los totales no coinciden.\nSuma clave 40 = ${total40.toFixed(
                        2
                    )}\nSuma clave 50 = ${total50.toFixed(2)}`
                );
            }
        },
        _getAppModulePath: function () {
            const appId = this.getOwnerComponent().getManifestEntry("/sap.app/id");
            const appPath = appId.replaceAll(".", "/");
            //MessageBox.show(appPath);
            return jQuery.sap.getModulePath(appPath);
        },
        //Eliminacion y formato de caracteres raros en el nombre del archivo
        formatoNombreArchivo: function (sFile) {
            var textoCodificado = encodeURIComponent(sFile);
            var sNombre = decodeURIComponent(textoCodificado);
            var reemplazos = {
                'Ã': 'A', 'À': 'A', 'Á': 'A', 'Ä': 'A', 'Â': 'A',
                'È': 'E', 'É': 'E', 'Ë': 'E', 'Ê': 'E',
                'Ì': 'I', 'Í': 'I', 'Ï': 'I', 'Î': 'I',
                'Ò': 'O', 'Ó': 'O', 'Ö': 'O', 'Ô': 'O',
                'Ù': 'U', 'Ú': 'U', 'Ü': 'U', 'Û': 'U',
                'ã': 'a', 'à': 'a', 'á': 'a', 'ä': 'a', 'â': 'a',
                'è': 'e', 'é': 'e', 'ë': 'e', 'ê': 'e',
                'ì': 'i', 'í': 'i', 'ï': 'i', 'î': 'i',
                'ò': 'o', 'ó': 'o', 'ö': 'o', 'ô': 'o',
                'ù': 'u', 'ú': 'u', 'ü': 'u', 'û': 'u',
                'Ñ': 'N', 'ñ': 'n',
                'Ç': 'c', 'ç': 'c'
            };
            var textoNormalizado = sNombre.replace(/[ÃÀÁÄÂÈÉËÊÌÍÏÎÒÓÖÔÙÚÜÛãàáäâèéëêìíïîòóöôùúüûÑñÇç]/g, function (match) {
                return reemplazos[match];
            });
            return textoNormalizado;
        },

        _validarCamposRequeridos: function () {
            const oView = this.getView();
            let bValido = true;

            // Lista de campos requeridos según tu formulario
            const aCampos = [
                { id: "txtsolicitante", label: "Solicitante" },
                { id: "cbSector", label: "Sector" },
                { id: "txtsociedad", label: "Sociedad" },
                { id: "txtMoneda", label: "Moneda" },          // ComboBox
                { id: "txtClaseDocumento", label: "Clase Documento" },
                { id: "dpFechaConta", label: "Fecha Contabilización" }, // DatePicker
                { id: "dpFechaDoc", label: "Fecha Documento" },          // DatePicker
                { id: "txtPeriodo", label: "Período/Año" },              // MaskInput
                { id: "cbTipoAsiento", label: "Tipo de Asiento" },
                { id: "txttextocabecera", label: "Texto Cabecera" }
            ];

            aCampos.forEach(campo => {
                const oControl = oView.byId(campo.id);
                if (!oControl) return;

                let sValue = "";

                // 👇 Controlar cada tipo de control UI5
                if (oControl.isA("sap.m.ComboBox")) {
                    sValue = oControl.getSelectedKey?.() || oControl.getValue?.();
                } else if (oControl.isA("sap.m.DatePicker")) {
                    sValue = oControl.getDateValue?.();
                } else if (oControl.isA("sap.m.MaskInput")) {
                    sValue = oControl.getValue?.();
                } else if (oControl.isA("sap.m.Input")) {
                    sValue = oControl.getValue?.();
                } else {
                    // fallback para otros tipos
                    sValue = oControl.getValue?.() || oControl.getSelectedKey?.();
                }

                if (!sValue) {
                    oControl.setValueState(sap.ui.core.ValueState.Error);
                    oControl.setValueStateText(`"${campo.label}" es obligatorio`);
                    bValido = false;
                } else {
                    oControl.setValueState(sap.ui.core.ValueState.None);
                }
            });

            return bValido;
        },
    });
});