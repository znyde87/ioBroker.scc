'use strict';

/** Leistung: bekannte Units → Faktor auf Watt */
const POWER_UNITS = {
    'W': 1,
    'w': 1,
    'kW': 1000,
    'kw': 1000,
    'KWh': 1000,
    'kWh': 1000,
    'kwh': 1000,
    'Wh': 1,
    'wh': 1
};

/** SoC/Anteil: bekannte Units → Faktor auf Prozent (0-100) */
const SOC_UNITS = {
    '%': 1,
    'percent': 1,
    'decimal': 100   // 0-1 → *100
};

/**
 * Liest common.unit aus einem State-Objekt (ioBroker getObject).
 * @param {object} obj - State-Objekt (common.unit)
 * @returns {string} - Unit-String oder ''
 */
function getUnitFromObject(obj) {
    if (!obj || !obj.common || obj.common.unit === undefined) return '';
    const u = obj.common.unit;
    return typeof u === 'string' ? u.trim() : '';
}

/**
 * Faktor um Rohwert (Leistung) in Watt zu bringen.
 * @param {string} unit - common.unit oder manuell gewählt
 * @param {string} manual - 'auto' | 'W' | 'kW' (manueller Override)
 * @returns {{ factor: number, unit: string }}
 */
function getPowerFactorToW(unit, manual) {
    if (manual && manual !== 'auto') {
        const f = POWER_UNITS[manual] || POWER_UNITS['W'];
        return { factor: f, unit: manual };
    }
    const u = (unit || '').trim();
    const factor = POWER_UNITS[u];
    if (factor !== undefined) return { factor, unit: u || 'W' };
    return { factor: 1, unit: 'W' };
}

/**
 * Faktor um Rohwert (SoC) in Prozent (0-100) zu bringen.
 * @param {string} unit - common.unit
 * @param {string} manual - 'auto' | '%' | 'decimal'
 * @returns {{ factor: number, unit: string }}
 */
function getSocFactorToPercent(unit, manual) {
    if (manual && manual !== 'auto') {
        const f = SOC_UNITS[manual] || SOC_UNITS['%'];
        return { factor: f, unit: manual };
    }
    const u = (unit || '').trim().toLowerCase();
    if (u === 'decimal' || u === '0-1') return { factor: 100, unit: 'decimal' };
    const factor = SOC_UNITS[u] || SOC_UNITS[u === '%' ? '%' : '%'];
    return { factor: factor || 1, unit: u || '%' };
}

/**
 * Rohwert Leistung → Watt (number).
 * @param {number} value - Rohwert
 * @param {{ factor: number }} norm - Ergebnis von getPowerFactorToW
 */
function powerToW(value, norm) {
    if (value == null || typeof value !== 'number' || isNaN(value)) return NaN;
    return value * (norm && norm.factor ? norm.factor : 1);
}

/**
 * Rohwert SoC → Prozent 0-100.
 * @param {number} value - Rohwert
 * @param {{ factor: number }} norm - Ergebnis von getSocFactorToPercent
 */
function socToPercent(value, norm) {
    if (value == null || typeof value !== 'number' || isNaN(value)) return NaN;
    return value * (norm && norm.factor ? norm.factor : 1);
}

module.exports = {
    getUnitFromObject,
    getPowerFactorToW,
    getSocFactorToPercent,
    powerToW,
    socToPercent,
    POWER_UNITS,
    SOC_UNITS
};
