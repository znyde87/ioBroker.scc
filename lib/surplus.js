'use strict';

/** Priorität: Wer bekommt zuerst den Überschuss? */
const PRIORITY = {
    BATTERY_FIRST: 'battery_first',  // Erst Batterie reservieren, Rest für Geräte
    DEVICES_FIRST: 'devices_first'    // Gesamter Überschuss für Geräte, Batterie bekommt was übrig bleibt
};

/**
 * Für Verbraucher verfügbare Leistung (W).
 * - battery_first: Brutto − Lade-Reserve [+ Entladeleistung, wenn onlyFromSurplus=false].
 * - devices_first: Brutto [+ Entladeleistung, wenn onlyFromSurplus=false] (keine Reservierung für Batterie).
 * Wenn onlyFromSurplus=true: Entladeleistung wird nicht addiert – Geräte nur bei echtem Überschuss (PV/Netz), nicht aus Batterie.
 * @param {number} surplusPowerW - Brutto-Überschuss (W)
 * @param {number} reservedChargeW - Für Batterieladung reserviert (W)
 * @param {number} totalDischargeW - Summe Entladeleistung aller Batterien (W)
 * @param {string} [priority] - 'battery_first' (Standard) oder 'devices_first'
 * @param {boolean} [onlyFromSurplus=false] - true = Entladeleistung nicht addieren (Geräte nur mit echtem Überschuss)
 * @returns {number}
 */
function availableForDevicesW(surplusPowerW, reservedChargeW, totalDischargeW, priority, onlyFromSurplus) {
    const s = Number(surplusPowerW);
    let r = Number(reservedChargeW);
    const d = Number(totalDischargeW);
    if (isNaN(s)) return 0;
    if (priority === PRIORITY.DEVICES_FIRST) r = 0;
    if (isNaN(r) || r < 0) r = 0;
    const discharge = (onlyFromSurplus === true) ? 0 : (isNaN(d) ? 0 : d);
    return Math.max(0, s - r + discharge);
}

module.exports = { availableForDevicesW, PRIORITY };
