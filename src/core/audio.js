/**
 * Event-led soundscape. Real CC0 recordings carry the snow, water, ice and
 * wind texture. Each spell is a small foley composition, not a musical cue:
 * a physical impact, a secondary material layer, then a short air or grain
 * tail that matches what the effect is doing on screen.
 */

import { S } from "./settings.js";

const ASSET = {
    footstepA: new URL("../assets/audio/snow-footstep-a.flac", import.meta.url).href,
    footstepB: new URL("../assets/audio/snow-footstep-b.flac", import.meta.url).href,
    surfWind: new URL("../assets/audio/snow-surf-wind.ogg", import.meta.url).href,
    ribbonWater: new URL("../assets/audio/ribbon-water-loop.ogg", import.meta.url).href,
    sweepWater: new URL("../assets/audio/sweep-water.ogg", import.meta.url).href,
    sweepSpray: new URL("../assets/audio/sweep-snow-spray.ogg", import.meta.url).href,
    bloomSplash: new URL("../assets/audio/bloom-splash.ogg", import.meta.url).href,
    bloomImpact: new URL("../assets/audio/bloom-impact.ogg", import.meta.url).href,
    bloomFallout: new URL("../assets/audio/bloom-fallout-rain.ogg", import.meta.url).href,
    ribbonBubble: new URL("../assets/audio/ribbon-bubble.ogg", import.meta.url).href,
    crystallizeIce: new URL("../assets/audio/crystallize-ice.wav", import.meta.url).href,
    crystallizeColdsnap: new URL("../assets/audio/crystallize-coldsnap.wav", import.meta.url).href,
};

const AudioContextCtor = window.AudioContext || window.webkitAudioContext;

function makePool(url, size) {
    const voices = [];
    for (let i = 0; i < size; i++) {
        const voice = new Audio(url);
        voice.preload = "auto";
        voices.push(voice);
    }
    return { voices, cursor: 0 };
}

function makeLoop(url) {
    const voice = new Audio(url);
    voice.loop = true;
    voice.preload = "auto";
    voice.volume = 0;
    return voice;
}

export class Soundscape {
    /** @param {HTMLCanvasElement} canvas */
    constructor(canvas) {
        this.unlocked = false;
        this.context = null;
        this.ribbonHeld = false;
        this.bloomFallout = 0;
        this.vortexStrength = 0;
        this.elapsed = 0;
        this.nextRibbonBubble = 0;
        this.nextVortexGust = 0;

        this.footsteps = [makePool(ASSET.footstepA, 3), makePool(ASSET.footstepB, 3)];
        this.sweep = makePool(ASSET.sweepWater, 3);
        this.sweepSpray = makePool(ASSET.sweepSpray, 3);
        this.bloom = makePool(ASSET.bloomSplash, 3);
        this.bloomImpact = makePool(ASSET.bloomImpact, 3);
        this.ribbonBubbles = makePool(ASSET.ribbonBubble, 3);
        this.ice = makePool(ASSET.crystallizeIce, 3);
        this.coldSnap = makePool(ASSET.crystallizeColdsnap, 3);
        this.vortex = makePool(ASSET.surfWind, 2);
        this.surfLoop = makeLoop(ASSET.surfWind);
        this.ribbonLoop = makeLoop(ASSET.ribbonWater);
        this.bloomFalloutLoop = makeLoop(ASSET.bloomFallout);
        this.vortexLoop = makeLoop(ASSET.surfWind);

        const unlock = () => this.unlock();
        canvas.addEventListener("pointerdown", unlock, { once: true });
        window.addEventListener("keydown", unlock, { once: true });
    }

    unlock() {
        this.unlocked = true;
        if (!this.context && AudioContextCtor) this.context = new AudioContextCtor();
        this.context?.resume().catch(() => {});
    }

    /** @param {number} dt @param {{surf:number, speed01:number}} character @param {{touchdown:boolean[]}|null} figure */
    update(dt, character, figure) {
        if (!this.unlocked) return;
        this.elapsed += dt;

        if (figure && character.surf < 0.5) {
            for (let foot = 0; foot < figure.touchdown.length; foot++) {
                if (!figure.touchdown[foot]) continue;
                // Dry, compacted snow is intentionally quiet: the texture should
                // sit beneath the visual footfall rather than read as grass.
                this._play(this.footsteps[foot & 1], 0.14 + character.speed01 * 0.06, 0.94 + Math.random() * 0.12);
            }
        }

        const surfStrength = character.surf * (0.28 + character.speed01 * 0.72);
        this._loop(this.surfLoop, surfStrength * 0.32, 0.82 + character.speed01 * 0.34, dt);
        this._loop(this.ribbonLoop, this.ribbonHeld ? 0.27 : 0, 0.92, dt);
        this._loop(this.bloomFalloutLoop, this.bloomFallout * 0.19, 0.84, dt);
        this._loop(this.vortexLoop, this.vortexStrength * 0.31, 0.72 + this.vortexStrength * 0.30, dt);

        // A held ribbon has small, irregular water particles on top of its
        // continuous body, which keeps it from sounding like a static loop.
        if (this.ribbonHeld && this.elapsed >= this.nextRibbonBubble) {
            this._play(this.ribbonBubbles, 0.14 + Math.random() * 0.06, 0.88 + Math.random() * 0.22);
            this.nextRibbonBubble = this.elapsed + 0.32 + Math.random() * 0.42;
        }

        // A real vortex builds, sustains, and sheds material rather than ending
        // with a single gust. These tiny grit accents follow that live envelope.
        if (this.vortexStrength > 0.58 && this.elapsed >= this.nextVortexGust) {
            this._play(this.sweepSpray, 0.10 + this.vortexStrength * 0.06, 0.74 + Math.random() * 0.16);
            this._noise(0.16, 0.016 + this.vortexStrength * 0.012, 1650, 1.9);
            this.nextVortexGust = this.elapsed + 0.42 + Math.random() * 0.28;
        }
    }

    /** @param {number} key */
    spell(key) {
        if (!this.unlocked) return;
        if (key === 1) {
            // Sweep: a rushing water edge cuts across loose snow.
            this._play(this.sweep, 0.44, 0.90 + Math.random() * 0.10);
            this._play(this.sweepSpray, 0.23, 0.93 + Math.random() * 0.14, 0.035);
            this._noise(0.26, 0.035, 1100, 1.4);
        } else if (key === 3) {
            // Bloom reaches the ground at 100 ms, so its heavy eruption follows
            // the visual crater and then leaves a falling-water/snow tail.
            this._noise(0.72, 0.07, 300, 0.75);
            this._play(this.bloom, 0.68, 0.86 + Math.random() * 0.10, 0.10);
            this._play(this.bloomImpact, 0.42, 0.82 + Math.random() * 0.10, 0.145);
            this._play(this.sweepSpray, 0.24, 1.00 + Math.random() * 0.12, 0.12);
        } else if (key === 4) {
            // Crystallize: the main ice split is followed by a colder fracture.
            this._play(this.ice, 0.46, 0.92 + Math.random() * 0.12);
            this._play(this.coldSnap, 0.20, 1.05 + Math.random() * 0.08, 0.055);
            this._noise(0.34, 0.026, 3100, 2.6);
        } else if (key === 5) {
            // Vortex begins with the snow lifting from the ground; the live loop
            // in update() then follows its spin-up, hold, and settling phase.
            this._play(this.vortex, 0.42, 0.92 + Math.random() * 0.08);
            this._play(this.sweepSpray, 0.23, 0.82 + Math.random() * 0.12, 0.045);
            this._noise(0.80, 0.062, 720, 0.95);
        }
    }

    /** @param {boolean} held */
    setRibbon(held) {
        this.ribbonHeld = held;
        if (held) this.nextRibbonBubble = this.elapsed + 0.15;
    }

    ribbonStart() {
        if (!this.unlocked) return;
        this._play(this.ribbonBubbles, 0.22, 0.92 + Math.random() * 0.10);
        this._noise(0.22, 0.02, 1300, 1.5);
    }

    ribbonRelease() {
        if (!this.unlocked) return;
        // Releasing 2 throws the recorded water body forward: it gets a clear
        // launch rush and a loose-snow shear, rather than simply stopping.
        this._play(this.sweep, 0.34, 1.04 + Math.random() * 0.10);
        this._play(this.sweepSpray, 0.20, 0.94 + Math.random() * 0.12, 0.055);
        this._noise(0.38, 0.04, 920, 1.0);
    }

    /** @param {number} intensity */
    setBloomFallout(intensity) {
        this.bloomFallout = Math.max(0, Math.min(1, intensity));
    }

    /** @param {number} intensity */
    setVortex(intensity) {
        this.vortexStrength = Math.max(0, Math.min(1, intensity));
        if (this.vortexStrength > 0.58 && this.nextVortexGust < this.elapsed) {
            this.nextVortexGust = this.elapsed + 0.16;
        }
    }

    _play(pool, gain, rate, delay = 0) {
        if (S.sfxVolume <= 0.001) return;
        const voice = pool.voices[pool.cursor++ % pool.voices.length];
        voice.volume = Math.min(1, gain * S.sfxVolume);
        voice.playbackRate = rate;
        const start = () => {
            voice.pause();
            try { voice.currentTime = 0; } catch {}
            voice.play().catch(() => {});
        };
        if (delay > 0) window.setTimeout(start, delay * 1000);
        else start();
    }

    _loop(voice, gain, rate, dt) {
        const target = Math.min(1, gain * S.sfxVolume);
        voice.volume += (target - voice.volume) * (1 - Math.exp(-dt * 9));
        voice.playbackRate = rate;
        if (target > 0.002 && voice.paused) voice.play().catch(() => {});
        if (target <= 0.002 && voice.volume < 0.003 && !voice.paused) voice.pause();
    }

    _noise(duration, gain, frequency, q) {
        const ctx = this.context;
        if (!ctx || S.sfxVolume <= 0.001) return;
        const now = ctx.currentTime;
        const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
        const samples = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = frequency;
        filter.Q.value = q;
        const amp = ctx.createGain();
        amp.gain.setValueAtTime(0.0001, now);
        amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * S.sfxVolume), now + 0.012);
        amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        source.connect(filter).connect(amp).connect(ctx.destination);
        source.start(now);
        source.stop(now + duration + 0.02);
    }

    dispose() {
        for (const voice of [this.surfLoop, this.ribbonLoop, this.bloomFalloutLoop, this.vortexLoop]) {
            voice.pause();
            voice.src = "";
        }
        this.context?.close().catch(() => {});
    }
}
