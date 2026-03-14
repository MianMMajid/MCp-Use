import { mapleLog } from "./logging.js";

const STATE_CLOSED = "closed";
const STATE_OPEN = "open";
const STATE_HALF_OPEN = "half_open";

export class CircuitBreaker {
    name;
    failureThreshold;
    resetTimeoutMs;
    halfOpenMaxAttempts;

    state = STATE_CLOSED;
    failureCount = 0;
    lastFailureTime = 0;
    halfOpenAttempts = 0;

    constructor(name, options = {}) {
        this.name = name;
        this.failureThreshold = options.failureThreshold ?? 5;
        this.resetTimeoutMs = options.resetTimeoutMs ?? 30000;
        this.halfOpenMaxAttempts = options.halfOpenMaxAttempts ?? 3;
    }

    async execute(fn) {
        if (this.state === STATE_OPEN) {
            if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
                this._transitionTo(STATE_HALF_OPEN);
            } else {
                const err = new Error(`CircuitBreaker [${this.name}] is OPEN — call rejected`);
                err.code = "UNAVAILABLE";
                throw err;
            }
        }

        if (this.state === STATE_HALF_OPEN && this.halfOpenAttempts >= this.halfOpenMaxAttempts) {
            this._transitionTo(STATE_OPEN);
            const err = new Error(`CircuitBreaker [${this.name}] is OPEN — half-open attempts exhausted`);
            err.code = "UNAVAILABLE";
            throw err;
        }

        try {
            if (this.state === STATE_HALF_OPEN) {
                this.halfOpenAttempts++;
            }
            const result = await fn();
            this._onSuccess();
            return result;
        } catch (err) {
            this._onFailure();
            throw err;
        }
    }

    getState() {
        // Check if open circuit should transition to half-open
        if (this.state === STATE_OPEN && Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
            return STATE_HALF_OPEN;
        }
        return this.state;
    }

    reset() {
        this._transitionTo(STATE_CLOSED);
    }

    _onSuccess() {
        if (this.state === STATE_HALF_OPEN) {
            this._transitionTo(STATE_CLOSED);
        }
        this.failureCount = 0;
    }

    _onFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.state === STATE_HALF_OPEN) {
            this._transitionTo(STATE_OPEN);
            return;
        }

        if (this.failureCount >= this.failureThreshold) {
            this._transitionTo(STATE_OPEN);
        }
    }

    _transitionTo(newState) {
        if (this.state === newState) return;
        const previousState = this.state;
        this.state = newState;

        if (newState === STATE_CLOSED) {
            this.failureCount = 0;
            this.halfOpenAttempts = 0;
        }
        if (newState === STATE_HALF_OPEN) {
            this.halfOpenAttempts = 0;
        }

        mapleLog("info", "circuit_breaker_state_change", {
            name: this.name,
            from: previousState,
            to: newState,
        });
    }
}
