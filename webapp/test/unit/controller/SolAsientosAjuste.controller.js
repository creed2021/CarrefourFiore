/*global QUnit*/

sap.ui.define([
	"com/carrefour/solicitudasientosajuste/controller/SolAsientosAjuste.controller"
], function (Controller) {
	"use strict";

	QUnit.module("SolAsientosAjuste Controller");

	QUnit.test("I should test the SolAsientosAjuste controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
