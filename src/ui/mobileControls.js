import { addTouchLook, pressTouchSpell, setTouchMove, setTouchRibbon, setTouchSurf } from "../core/input.js";

const STYLE = `
#mobile-hud{position:fixed;inset:0;z-index:60;pointer-events:none;color:#edf7ff;font:500 10px/1 ui-sans-serif,system-ui;opacity:0;transition:opacity .8s ease}
#mobile-hud.on{opacity:1}#mobile-hud button{pointer-events:auto;color:inherit;border:1px solid rgba(222,241,255,.48);background:radial-gradient(circle,rgba(27,51,74,.20),rgba(6,13,23,.08) 66%);box-shadow:inset 0 0 28px rgba(154,214,247,.06),0 0 22px rgba(0,0,0,.18);backdrop-filter:blur(5px);touch-action:none}
.mh-top{position:absolute;top:max(18px,env(safe-area-inset-top));left:18px;right:18px;display:flex;justify-content:space-between;pointer-events:none}.mh-top button{pointer-events:auto;width:42px;height:42px;border-radius:50%;font-size:16px}.mh-rose{letter-spacing:.14em;font-size:10px;text-shadow:0 2px 9px #000}.mh-rose b{display:block;font-size:14px;margin-top:4px;text-align:center}
.mh-stick{position:absolute;left:max(20px,env(safe-area-inset-left));bottom:max(24px,env(safe-area-inset-bottom));width:132px;height:132px;border-radius:50%}.mh-stick i{position:absolute;left:43px;top:43px;width:44px;height:44px;border:1px solid rgba(235,248,255,.8);border-radius:50%;box-shadow:0 0 16px rgba(160,218,255,.23)}
.mh-look{position:absolute;right:0;bottom:0;width:48vw;height:58vh;pointer-events:auto;touch-action:none}.mh-surf{position:absolute;left:50%;bottom:max(24px,env(safe-area-inset-bottom));transform:translateX(-50%);width:64px;height:64px;border-radius:50%;font-size:19px}.mh-spells{position:absolute;right:max(18px,env(safe-area-inset-right));bottom:145px;display:grid;gap:10px}.mh-spells button{width:46px;height:46px;border-radius:50%;font-size:12px}.mh-spells button:active,.mh-surf:active{background:rgba(151,216,255,.35);box-shadow:0 0 24px rgba(154,220,255,.55)}
.mh-card{position:absolute;top:74px;left:50%;transform:translateX(-50%) translateY(-8px);width:min(300px,78vw);padding:14px 16px;border:1px solid rgba(220,242,255,.24);border-radius:16px;background:rgba(5,13,24,.52);backdrop-filter:blur(16px);text-align:center;letter-spacing:.06em;line-height:1.55;opacity:0;pointer-events:none;transition:.25s}.mh-card.show{opacity:1;transform:translateX(-50%) translateY(0)}
@media (pointer:fine){#mobile-hud{display:none}}@media (orientation:portrait){.mh-spells{bottom:124px}.mh-stick{width:116px;height:116px}.mh-stick i{left:36px;top:36px}.mh-look{height:52vh}}
`;

export class MobileControls {
    constructor({ overlay, rig }) {
        this.active = matchMedia("(pointer: coarse)").matches;
        if (!this.active) return;
        const style = document.createElement("style"); style.textContent = STYLE; document.head.append(style);
        const el = document.createElement("div"); el.id = "mobile-hud";
        el.innerHTML = `<div class="mh-top"><div class="mh-rose">DIRECTION<b>—</b></div><button aria-label="Directions" data-dir>✧</button><button aria-label="Settings" data-settings>⚙</button></div><div class="mh-card" data-card>Follow the light. Drag the right side to look. Hold the snowflake to surf.</div><button class="mh-stick" aria-label="Move"><i></i></button><div class="mh-look" aria-label="Look around"></div><button class="mh-surf" aria-label="Hold to snow surf">❄</button><div class="mh-spells">${[1,2,3,4,5].map(n => `<button data-spell="${n}" aria-label="Spell ${n}">${n}</button>`).join("")}</div>`;
        document.body.append(el); this.el = el;
        el.classList.add("on");
        const rose = el.querySelector(".mh-rose b");
        setInterval(() => { const d = ((rig.yaw * 180 / Math.PI) % 360 + 360) % 360; rose.textContent = ["N","NE","E","SE","S","SW","W","NW"][Math.round(d / 45) % 8]; }, 250);
        el.querySelector("[data-settings]").onclick = () => overlay.toggle();
        el.querySelector("[data-dir]").onclick = () => { const card = el.querySelector("[data-card]"); card.classList.add("show"); setTimeout(() => card.classList.remove("show"), 2800); };
        this._stick(el.querySelector(".mh-stick")); this._look(el.querySelector(".mh-look"));
        this._hold(el.querySelector(".mh-surf"), setTouchSurf);
        el.querySelectorAll("[data-spell]").forEach(b => { const n = +b.dataset.spell; if (n === 2) this._hold(b, setTouchRibbon); else b.addEventListener("pointerdown", e => { e.preventDefault(); pressTouchSpell(n); }); });
    }
    _hold(el, fn) { el.addEventListener("pointerdown", e => { e.preventDefault(); el.setPointerCapture(e.pointerId); fn(true); }); ["pointerup","pointercancel"].forEach(k => el.addEventListener(k, () => fn(false))); }
    _look(el) { let x=0,y=0; el.addEventListener("pointerdown",e=>{x=e.clientX;y=e.clientY;el.setPointerCapture(e.pointerId)}); el.addEventListener("pointermove",e=>{if(!e.buttons)return;addTouchLook(e.clientX-x,e.clientY-y);x=e.clientX;y=e.clientY}); }
    _stick(el) { const knob=el.querySelector("i"), move=e=>{const r=el.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),l=Math.hypot(dx,dy)||1,m=Math.min(1,l/(r.width*.33));setTouchMove(dx/l*m,-dy/l*m);knob.style.transform=`translate(${dx/l*m*28}px,${dy/l*m*28}px)`};el.addEventListener("pointerdown",e=>{el.setPointerCapture(e.pointerId);move(e)});el.addEventListener("pointermove",e=>{if(e.buttons)move(e)});["pointerup","pointercancel"].forEach(k=>el.addEventListener(k,()=>{setTouchMove(0,0);knob.style.transform=""})); }
}
