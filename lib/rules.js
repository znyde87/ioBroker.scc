'use strict';

/**
 * Regel-Engine: Schwellwerte, Hysterese, Min-Dauer, Verzögerung.
 * @param {object} adapter - ioBroker Adapter
 * @param {object[]} rulesConfig - native.rules
 */
function RuleEngine(adapter, rulesConfig) {
    this.adapter = adapter;
    this.config = Array.isArray(rulesConfig) ? rulesConfig : [];
    this.ruleState = {};  // ruleId -> { onSince, offSince, delayOnAt, delayOffAt, currentOn }
}

RuleEngine.prototype.getRuleId = function (r) {
    return r.id || (r.targetStateId && r.targetStateId.replace(/[.\s]/g, '_')) || `rule_${this.config.indexOf(r)}`;
};

RuleEngine.prototype.evaluate = async function (availableForDevicesW) {
    const now = Date.now();
    const avail = Number(availableForDevicesW) || 0;
    const debugRules = this.adapter.config && this.adapter.config.debugRules === true;
    const simulationMode = this.adapter.config && this.adapter.config.simulationMode === true;

    const sorted = [...this.config]
        .filter(r => r.enabled !== false)
        .sort((a, b) => (a.priority || 0) - (b.priority || 0));

    for (const r of sorted) {
        const ruleId = this.getRuleId(r);
        let state = this.ruleState[ruleId] || { currentOn: false, onSince: null, offSince: null, delayOnAt: null, delayOffAt: null };

        const thresholdOn = Number(r.thresholdOn) || 0;
        const devicePowerW = Math.max(0, Number(r.devicePowerW) || 0);
        const effectiveThresholdOn = devicePowerW > 0 ? Math.max(thresholdOn, devicePowerW) : thresholdOn;
        const thresholdOff = Number(r.thresholdOff) !== undefined ? Number(r.thresholdOff) : thresholdOn * 0.5;
        const minOnSec = Number(r.minOnSec) || 0;
        const minOffSec = Number(r.minOffSec) || 0;
        const delayOnSec = Number(r.delayOnSec) || 0;
        const delayOffSec = Number(r.delayOffSec) || 0;

        const wantOn = avail >= effectiveThresholdOn;
        const wantOff = avail <= thresholdOff;

        if (wantOn && !state.currentOn) {
            if (delayOnSec > 0) {
                if (!state.delayOnAt) state.delayOnAt = now;
                const delayElapsed = (now - state.delayOnAt) / 1000;
                if (delayElapsed >= delayOnSec) {
                    if (minOffSec > 0 && state.offSince && (now - state.offSince) / 1000 < minOffSec) {
                        if (debugRules) this.adapter.log.debug(`[Regel ${ruleId}] Warte auf Min-AUS (${minOffSec}s): noch ${(minOffSec - (now - state.offSince) / 1000).toFixed(0)}s`);
                    } else {
                        state.currentOn = true;
                        state.onSince = now;
                        state.delayOnAt = null;
                        state.delayOffAt = null;
                        if (!simulationMode) await this.setTargetState(r, true);
                        else if (debugRules) this.adapter.log.debug(`[Regel ${ruleId}] Simulation: würde EIN schalten (avail=${avail}W >= ${effectiveThresholdOn}W)`);
                    }
                } else if (debugRules) this.adapter.log.debug(`[Regel ${ruleId}] Verz. EIN: ${delayElapsed.toFixed(0)}s/${delayOnSec}s (avail=${avail}W)`);
            } else {
                if (minOffSec > 0 && state.offSince && (now - state.offSince) / 1000 < minOffSec) {
                    if (debugRules) this.adapter.log.debug(`[Regel ${ruleId}] Warte auf Min-AUS (${minOffSec}s)`);
                } else {
                    state.currentOn = true;
                    state.onSince = now;
                    state.delayOnAt = null;
                    state.delayOffAt = null;
                    if (!simulationMode) await this.setTargetState(r, true);
                    else if (debugRules) this.adapter.log.debug(`[Regel ${ruleId}] Simulation: würde EIN schalten`);
                }
            }
        } else if (!wantOn && !state.currentOn && debugRules && avail < thresholdOn) {
            this.adapter.log.debug(`[Regel ${ruleId}] Kein EIN: avail ${avail}W < Schwellwert ${effectiveThresholdOn}W`);
        } else if (!wantOn) {
            state.delayOnAt = null;
        }

        if (wantOff && state.currentOn) {
            if (delayOffSec > 0) {
                if (!state.delayOffAt) state.delayOffAt = now;
                const delayElapsed = (now - state.delayOffAt) / 1000;
                if (delayElapsed >= delayOffSec) {
                    if (minOnSec > 0 && state.onSince && (now - state.onSince) / 1000 < minOnSec) {
                        if (debugRules) this.adapter.log.debug(`[Regel ${ruleId}] Warte auf Min-EIN (${minOnSec}s): noch ${(minOnSec - (now - state.onSince) / 1000).toFixed(0)}s`);
                    } else {
                        state.currentOn = false;
                        state.offSince = now;
                        state.delayOffAt = null;
                        state.delayOnAt = null;
                        if (!simulationMode) await this.setTargetState(r, false);
                        else if (debugRules) this.adapter.log.debug(`[Regel ${ruleId}] Simulation: würde AUS schalten`);
                    }
                } else if (debugRules) this.adapter.log.debug(`[Regel ${ruleId}] Verz. AUS: ${delayElapsed.toFixed(0)}s/${delayOffSec}s`);
            } else {
                if (minOnSec > 0 && state.onSince && (now - state.onSince) / 1000 < minOnSec) {
                    if (debugRules) this.adapter.log.debug(`[Regel ${ruleId}] Warte auf Min-EIN (${minOnSec}s)`);
                } else {
                    state.currentOn = false;
                    state.offSince = now;
                    state.delayOffAt = null;
                    state.delayOnAt = null;
                    if (!simulationMode) await this.setTargetState(r, false);
                    else if (debugRules) this.adapter.log.debug(`[Regel ${ruleId}] Simulation: würde AUS schalten`);
                }
            }
        } else if (!wantOff && state.currentOn && debugRules && avail > thresholdOff) {
            this.adapter.log.debug(`[Regel ${ruleId}] Kein AUS: avail ${avail}W > Schwellwert AUS ${thresholdOff}W`);
        } else if (!wantOff) {
            state.delayOffAt = null;
        }

        this.ruleState[ruleId] = state;
    }
};

RuleEngine.prototype.setTargetState = async function (rule, on) {
    const targetStateId = rule.targetStateId || rule.targetState;
    if (!targetStateId) return;
    const val = on ? (rule.valueOn !== undefined ? rule.valueOn : true) : (rule.valueOff !== undefined ? rule.valueOff : false);
    try {
        await this.adapter.setStateAsync(targetStateId, { val, ack: true });
    } catch (e) {
        this.adapter.log.warn(`Rule ${rule.id || targetStateId}: setState failed - ${e.message}`);
    }
};

RuleEngine.prototype.getRuleStates = function () {
    const out = {};
    for (const r of this.config) {
        const ruleId = this.getRuleId(r);
        const state = this.ruleState[ruleId];
        out[ruleId] = {
            state: state ? state.currentOn : false,
            lastSwitch: state && (state.onSince || state.offSince)
                ? new Date(Math.max(state.onSince || 0, state.offSince || 0)).toISOString()
                : null
        };
    }
    return out;
};

module.exports = { RuleEngine };
