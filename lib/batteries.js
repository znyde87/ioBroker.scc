'use strict';

const units = require('./units');

/**
 * @param {object} adapter - ioBroker Adapter
 * @param {object[]} batteriesConfig - native.batteries
 */
function BatteryManager(adapter, batteriesConfig) {
    this.adapter = adapter;
    this.config = Array.isArray(batteriesConfig) ? batteriesConfig : [];
    this.socValues = {};       // batteryId -> SoC %
    this.chargePowerW = {};   // batteryId -> W (wenn Ladeleistung-State)
    this.dischargePowerW = {}; // batteryId -> W (wenn Entladeleistung-State)
    this.normsSoc = {};        // socStateId -> { factor, unit }
    this.normsCharge = {};     // chargeStateId -> { factor, unit }
    this.normsDischarge = {};  // dischargeStateId -> { factor, unit }
    this.initialized = false;
}

BatteryManager.prototype.getBatteryId = function (b) {
    return b.id || (b.socStateId && b.socStateId.replace(/[.\s]/g, '_')) || `battery_${this.config.indexOf(b)}`;
};

BatteryManager.prototype.init = async function () {
    this.adapter.log.debug('batteries init: ' + this.config.length + ' entries');
    for (const b of this.config) {
        const socStateId = b.socStateId || b.socState;
        if (socStateId) {
            try {
                const obj = await this.adapter.getObjectAsync(socStateId);
                const unit = units.getUnitFromObject(obj);
                const manual = b.socUnit || 'auto';
                this.normsSoc[socStateId] = units.getSocFactorToPercent(unit, manual);
                this.adapter.log.debug('batteries init: SoC ' + socStateId);
            } catch (e) {
                this.adapter.log.warn(`Battery SoC ${socStateId}: using % - ${e.message}`);
                this.normsSoc[socStateId] = { factor: 1, unit: '%' };
            }
        }
        const chargeStateId = b.chargePowerStateId || b.chargePowerState;
        if (chargeStateId) {
            try {
                const obj = await this.adapter.getObjectAsync(chargeStateId);
                const unit = units.getUnitFromObject(obj);
                const manual = b.chargePowerUnit || 'auto';
                this.normsCharge[chargeStateId] = units.getPowerFactorToW(unit, manual);
                this.adapter.log.debug('batteries init: charge ' + chargeStateId);
            } catch (e) {
                this.normsCharge[chargeStateId] = { factor: 1, unit: 'W' };
            }
        }
        const dischargeStateId = b.dischargePowerStateId || b.dischargePowerState;
        if (dischargeStateId) {
            try {
                const obj = await this.adapter.getObjectAsync(dischargeStateId);
                const unit = units.getUnitFromObject(obj);
                const manual = b.dischargePowerUnit || 'auto';
                this.normsDischarge[dischargeStateId] = units.getPowerFactorToW(unit, manual);
                this.adapter.log.debug('batteries init: discharge ' + dischargeStateId);
            } catch (e) {
                this.normsDischarge[dischargeStateId] = { factor: 1, unit: 'W' };
            }
        }
    }
    this.initialized = true;
};

BatteryManager.prototype.setSoc = function (socStateId, rawValue) {
    const norm = this.normsSoc[socStateId];
    const pct = units.socToPercent(Number(rawValue), norm);
    const b = this.config.find(c => (c.socStateId || c.socState) === socStateId);
    if (b) {
        const bid = this.getBatteryId(b);
        this.socValues[bid] = pct;
    }
};

BatteryManager.prototype.setChargePower = function (chargeStateId, rawValue) {
    const norm = this.normsCharge[chargeStateId];
    const w = units.powerToW(Number(rawValue), norm);
    const b = this.config.find(c => (c.chargePowerStateId || c.chargePowerState) === chargeStateId);
    if (b) {
        const bid = this.getBatteryId(b);
        this.chargePowerW[bid] = w;
    }
};

BatteryManager.prototype.setDischargePower = function (dischargeStateId, rawValue) {
    const norm = this.normsDischarge[dischargeStateId];
    const w = units.powerToW(Number(rawValue), norm);
    const b = this.config.find(c => (c.dischargePowerStateId || c.dischargePowerState) === dischargeStateId);
    if (b) {
        const bid = this.getBatteryId(b);
        this.dischargePowerW[bid] = w;
    }
};

BatteryManager.prototype.getSocPercent = function (batteryId) {
    const pct = this.socValues[batteryId];
    return pct != null && !isNaN(pct) ? pct : null;
};

BatteryManager.prototype.getTargetSoc = function (batteryId) {
    const b = this.config.find(c => this.getBatteryId(c) === batteryId);
    return b && typeof b.targetSoc === 'number' ? b.targetSoc : 100;
};

BatteryManager.prototype.needsCharge = function (batteryId) {
    const soc = this.getSocPercent(batteryId);
    const target = this.getTargetSoc(batteryId);
    if (soc == null) return true;  // unbekannt → als ladebedürftig behandeln
    return soc < target;
};

BatteryManager.prototype.allCharged = function () {
    if (this.config.length === 0) return true;
    return this.config.every(b => !this.needsCharge(this.getBatteryId(b)));
};

/**
 * Reservierte Leistung für Batterieladung (W).
 * Option A: Konfig batteryReserveW (fix)
 * Option B: Summe Ladeleistung aus States (useBatteryChargePower)
 */
BatteryManager.prototype.getReservedPowerW = function (useChargePowerStates) {
    if (this.config.length === 0) return 0;
    if (this.allCharged()) return 0;
    if (useChargePowerStates) {
        let sum = 0;
        for (const b of this.config) {
            const bid = this.getBatteryId(b);
            if (this.needsCharge(bid)) {
                const w = this.chargePowerW[bid];
                if (w != null && w > 0) sum += w;
            }
        }
        if (sum > 0) return sum;
    }
    return 0;
};

/** Für Konfig: batteryReserveW wenn keine Ladeleistung-States oder useBatteryChargePower=false */
BatteryManager.prototype.getFixedReserveW = function () {
    if (this.config.length === 0) return 0;
    if (this.allCharged()) return 0;
    return 0; // Wird vom Adapter aus native.batteryReserveW gelesen
}

BatteryManager.prototype.getChargePowerW = function (batteryId) {
    const w = this.chargePowerW[batteryId];
    return w != null && !isNaN(w) ? w : null;
};

BatteryManager.prototype.getDischargePowerW = function (batteryId) {
    const w = this.dischargePowerW[batteryId];
    return w != null && !isNaN(w) ? w : null;
};

/** Summe aller Entladeleistungen (W) – für Berechnung „verfügbar für Verbraucher“. */
BatteryManager.prototype.getTotalDischargeW = function () {
    let sum = 0;
    for (const bid of Object.keys(this.dischargePowerW || {})) {
        const w = this.dischargePowerW[bid];
        if (w != null && !isNaN(w) && w > 0) sum += w;
    }
    return sum;
};

/** Summe aller Ladeleistungen (W) – tatsächliche Ladung aus States, nicht reserviert. */
BatteryManager.prototype.getTotalChargeW = function () {
    let sum = 0;
    for (const b of this.config) {
        const bid = this.getBatteryId(b);
        const w = this.chargePowerW[bid];
        if (w != null && !isNaN(w) && w > 0) sum += w;
    }
    return sum;
};

BatteryManager.prototype.getSubscribeIds = function () {
    const ids = [];
    for (const b of this.config) {
        if (b.socStateId) ids.push(b.socStateId);
        else if (b.socState) ids.push(b.socState);
        if (b.chargePowerStateId) ids.push(b.chargePowerStateId);
        else if (b.chargePowerState) ids.push(b.chargePowerState);
        if (b.dischargePowerStateId) ids.push(b.dischargePowerStateId);
        else if (b.dischargePowerState) ids.push(b.dischargePowerState);
    }
    return ids.filter(Boolean);
};

module.exports = { BatteryManager };
