'use strict';

/**
 * Einfache Statistik: Überschuss-Stunden, Autarkie über Zeit.
 * @param {object} adapter - ioBroker Adapter
 */
function StatsManager(adapter) {
    this.adapter = adapter;
    this.dayStart = null;   // Timestamp heute 00:00
    this.surplusSecondsToday = 0;
    this.consumptionWhToday = 0;
    this.gridConsumptionWhToday = 0;
    this.lastTick = null;
}

StatsManager.prototype._resetDayIfNeeded = function () {
    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayStart = today.getTime();
    if (this.dayStart === null || this.dayStart !== dayStart) {
        this.dayStart = dayStart;
        this.surplusSecondsToday = 0;
        this.consumptionWhToday = 0;
        this.gridConsumptionWhToday = 0;
    }
};

StatsManager.prototype.tick = function (surplusW, consumptionW, gridConsumptionW, pollIntervalMs) {
    this._resetDayIfNeeded();
    const intervalSec = (pollIntervalMs || 1000) / 1000;
    const now = Date.now();

    if (this.lastTick != null) {
        const elapsed = (now - this.lastTick) / 1000;
        const usedInterval = Math.min(elapsed, intervalSec * 2);
        if (surplusW > 0) {
            this.surplusSecondsToday += usedInterval;
        }
        if (consumptionW != null && consumptionW > 0) {
            this.consumptionWhToday += (consumptionW * usedInterval) / 3600;
        }
        if (gridConsumptionW != null && gridConsumptionW > 0) {
            this.gridConsumptionWhToday += (gridConsumptionW * usedInterval) / 3600;
        }
    }
    this.lastTick = now;
};

StatsManager.prototype.getSurplusHoursToday = function () {
    this._resetDayIfNeeded();
    return this.surplusSecondsToday / 3600;
};

StatsManager.prototype.getAutarkyPercentToday = function () {
    this._resetDayIfNeeded();
    if (this.consumptionWhToday <= 0) return 100;
    const selfConsumed = this.consumptionWhToday - this.gridConsumptionWhToday;
    return Math.max(0, Math.min(100, (selfConsumed / this.consumptionWhToday) * 100));
};

StatsManager.prototype.getConsumptionWhToday = function () {
    this._resetDayIfNeeded();
    return this.consumptionWhToday;
};

StatsManager.prototype.getGridConsumptionWhToday = function () {
    this._resetDayIfNeeded();
    return this.gridConsumptionWhToday;
};

module.exports = { StatsManager };
