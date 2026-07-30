/**
 * Loading-screen driver.
 *
 * A phase-weighted progress model: each phase declares how much of the bar it
 * owns, and the bar only ever moves forward. `phase()` also yields to the
 * browser so the DOM actually repaints between heavy synchronous steps.
 */

const bar = /** @type {HTMLElement} */ (document.getElementById("boot-bar"));
const label = /** @type {HTMLElement} */ (document.getElementById("boot-phase"));
const root = /** @type {HTMLElement} */ (document.getElementById("boot"));
const hint = /** @type {HTMLElement} */ (document.getElementById("hint"));

// Eight authored loading messages share one deliberate seven-second sequence.
const bootStartedAt = performance.now();
const BOOT_DURATION_MS = 7000;
const PHASE_COUNT = 8;
const PHASE_DURATION_MS = BOOT_DURATION_MS / PHASE_COUNT;
let phaseIndex = 0;

/** Yield to the compositor so the loading screen repaints. */
export function nextFrame() {
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

/**
 * @param {string} text shown under the bar
 */
export async function phase(text) {
    const scheduledAt = bootStartedAt + phaseIndex * PHASE_DURATION_MS;
    const remaining = Math.max(0, scheduledAt - performance.now());
    if (remaining > 0) {
        await new Promise((r) => setTimeout(r, remaining));
    }

    if (label) label.textContent = text;
    phaseIndex = Math.min(PHASE_COUNT, phaseIndex + 1);
    if (bar) bar.style.width = ((phaseIndex / PHASE_COUNT) * 100).toFixed(1) + "%";
    await nextFrame();
}

export async function done() {
    await phase("raasta tayyar hai — the way is ready");
    const remaining = Math.max(0, BOOT_DURATION_MS - (performance.now() - bootStartedAt));
    if (remaining > 0) {
        await new Promise((r) => setTimeout(r, remaining));
    }
    root?.classList.add("gone");
    hint?.classList.add("show");
    setTimeout(() => {
        root?.remove();
        hint?.classList.remove("show");
    }, 6000);
}

export function fail(message) {
    root?.remove();
    const el = document.getElementById("nogpu");
    if (el) {
        el.classList.add("show");
        const b = el.querySelector("b");
        if (b && message) b.textContent = message;
    }
}
