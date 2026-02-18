'use strict';

const units = require('./units');

/** Quell-Typen wie im Konzept */
const SOURCE_TYPES = {
    grid: 'grid',           // Netzleistung (negativ = Einspeisung)
    generation: 'generation',
    consumption: 'consumption',      // für Berechnung (Überschuss, Hausverbrauch)
    consumptionDetail: 'consumptionDetail',  // nur Anzeige, Teile von Hausverbrauch gesamt
    feedIn: 'feedIn'
};

/**
 * @param {object} adapter - ioBroker Adapter
 * @param {object[]} sourcesConfig - native.sources
 */
function SourceManager(adapter, sourcesConfig) {
    this.adapter = adapter;
    this.config = Array.isArray(sourcesConfig) ? sourcesConfig : [];
    this.lastValues = {};   // stateId -> normalized value (W)
    this.norms = {};        // stateId -> { factor, unit } for power
    this.initialized = false;
}

function _idFromVal(val) {
    if (val == null) return '';
    if (typeof val === 'string') return val.trim();
    if (typeof val === 'object' && val.id != null) return String(val.id).trim();
    return '';
}

SourceManager.prototype.getStateId = function (source) {
    if (Array.isArray(source)) {
        const v = source[0];
        const id = _idFromVal(v);
        return id.length > 0 ? id : '';
    }
    if (!source || typeof source !== 'object') return '';
    const id = _idFromVal(source.stateId) || _idFromVal(source.id) || (source.stateid !== undefined ? _idFromVal(source.stateid) : '');
    return id.length > 0 ? id : '';
};

SourceManager.prototype.init = async function () {
    this.adapter.log.debug('sources init: ' + this.config.length + ' entries');
    for (let i = 0; i < this.config.length; i++) {
        const s = this.config[i];
        const stateId = this.getStateId(s);
        if (!stateId) {
            let keyInfo = '';
            try {
                if (s != null && typeof s === 'object' && !Array.isArray(s)) keyInfo = Object.keys(s).join(', ');
                else if (Array.isArray(s)) keyInfo = 'array len=' + s.length + ' [0]=' + (typeof s[0]);
                else keyInfo = typeof s;
            } catch (e) { keyInfo = 'error: ' + (e && e.message); }
            this.adapter.log.debug('sources init: skip entry ' + i + ' without stateId (keys: ' + keyInfo + ')');
            continue;
        }
        try {
            const obj = await this.adapter.getObjectAsync(stateId);
            const unit = units.getUnitFromObject(obj);
            const manual = s.unit || 'auto';
            this.norms[stateId] = units.getPowerFactorToW(unit, manual);
            this.adapter.log.debug('sources init: ' + stateId + ' norm factor=' + (this.norms[stateId] && this.norms[stateId].factor));
        } catch (e) {
            this.adapter.log.warn(`Source ${stateId}: getObject failed, using W - ${e.message}`);
            this.norms[stateId] = { factor: 1, unit: 'W' };
        }
    }
    this.initialized = true;
};

SourceManager.prototype.setLastValue = function (stateId, rawValue) {
    const norm = this.norms[stateId];
    const w = units.powerToW(Number(rawValue), norm);
    this.lastValues[stateId] = w;
};

SourceManager.prototype.getLastValueW = function (stateId) {
    const w = this.lastValues[stateId];
    return w != null && !isNaN(w) ? w : null;
};

/**
 * Brutto-Überschuss in Watt berechnen.
 * - Nur grid: Überschuss = max(0, -gridW)
 * - Sonst: generation + feedIn - consumption, dann max(0, x)
 */
SourceManager.prototype.computeBruttoSurplusW = function () {
    let gridW = null;
    let generationW = 0;
    let consumptionW = 0;
    let feedInW = 0;

    for (const s of this.config) {
        const stateId = this.getStateId(s);
        const w = this.getLastValueW(stateId);
        if (w == null) continue;

        const type = s.type || 'generation';
        const factor = typeof s.factor === 'number' ? s.factor : 1;
        const val = w * factor;

        switch (type) {
            case SOURCE_TYPES.grid:
                gridW = val;
                break;
            case SOURCE_TYPES.generation:
                generationW += val;
                break;
            case SOURCE_TYPES.consumption:
                consumptionW += val;
                break;
            case SOURCE_TYPES.consumptionDetail:
                break;  // nur Anzeige, nicht für Überschuss
            case SOURCE_TYPES.feedIn:
                feedInW += val;
                break;
            default:
                generationW += val;
        }
    }

    if (gridW !== null) {
        return Math.max(0, -gridW);
    }
    return Math.max(0, generationW + feedInW - consumptionW);
};

/** Summe aller Quellen vom Typ Verbrauch (W) – für State „Verbrauch gesamt“. consumptionDetail ignoriert. */
SourceManager.prototype.getConsumptionTotalW = function () {
    let sum = 0;
    for (const s of this.config) {
        if ((s.type || 'generation') !== SOURCE_TYPES.consumption) continue;
        const stateId = this.getStateId(s);
        const w = this.getLastValueW(stateId);
        if (w != null && w > 0) sum += w;
    }
    return sum;
};

/** Einspeisung (W): Summe der Quellen vom Typ Einspeisung, oder null wenn keine. */
SourceManager.prototype.getFeedInFromSourcesW = function () {
    let sum = 0;
    let hasFeedIn = false;
    for (const s of this.config) {
        if ((s.type || 'generation') !== SOURCE_TYPES.feedIn) continue;
        hasFeedIn = true;
        const stateId = this.getStateId(s);
        const w = this.getLastValueW(stateId);
        if (w != null && w > 0) sum += w;
    }
    return hasFeedIn ? sum : null;
};

/** Rohwert Netzleistung (W): eine Quelle Typ grid; positiv = Bezug, negativ = Einspeisung. */
SourceManager.prototype.getGridPowerW = function () {
    for (const s of this.config) {
        if ((s.type || 'generation') !== SOURCE_TYPES.grid) continue;
        const stateId = this.getStateId(s);
        const w = this.getLastValueW(stateId);
        if (w != null && !isNaN(w)) return w;
    }
    return null;
};

/** Netzbezug (W) = max(0, Netzleistung). */
SourceManager.prototype.getGridConsumptionW = function () {
    const gridW = this.getGridPowerW();
    return gridW != null ? Math.max(0, gridW) : null;
};

/** Netzeinspeisung (W) aus Grid-Quelle = max(0, -Netzleistung). */
SourceManager.prototype.getGridFeedInW = function () {
    const gridW = this.getGridPowerW();
    return gridW != null ? Math.max(0, -gridW) : null;
};

/** Summe aller Quellen vom Typ Erzeugung (PV) in W – für State „PV-Quellen gesamt“. */
SourceManager.prototype.getGenerationTotalW = function () {
    let sum = 0;
    for (const s of this.config) {
        if ((s.type || 'generation') !== SOURCE_TYPES.generation) continue;
        const stateId = this.getStateId(s);
        const w = this.getLastValueW(stateId);
        if (w != null && w > 0) sum += w;
    }
    return sum;
};

/** Alle Quell-State-IDs für Subscribe */
SourceManager.prototype.getSubscribeIds = function () {
    return this.config
        .map(s => this.getStateId(s))
        .filter(Boolean);
};

/** Prüfen ob mindestens eine Quelle einen gültigen Wert hat */
SourceManager.prototype.hasAnyValidValue = function () {
    const ids = this.getSubscribeIds();
    if (ids.length === 0) return false;
    return ids.some(id => this.getLastValueW(id) != null);
};

module.exports = { SourceManager, SOURCE_TYPES };
