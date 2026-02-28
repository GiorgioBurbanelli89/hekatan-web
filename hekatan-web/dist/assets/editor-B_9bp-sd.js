import"./modulepreload-polyfill-B5Qt9EMX.js";const D="https://xcas.univ-grenoble-alpes.fr/xcasjs",W=45e3;let s=null,g=null,M=!1;const R={name:"giac",label:"Giac/Xcas (C++ WASM)",isReady(){return s!==null},async init(){if(!s){if(M)throw new Error("Giac init previously failed");return g||(g=new Promise((t,e)=>{const n=setTimeout(()=>{M=!0,e(new Error("Giac WASM load timeout (45s)"))},W),a=document.createElement("script");a.src=`${D}/giac.js`,a.onload=()=>{const r=()=>{const i=globalThis;i.Module&&i.Module.ccall?(s=i.Module,clearTimeout(n),console.log("[CAS] Giac/Xcas WASM loaded"),t()):i.UI&&i.UI.caseval?(s={caseval:i.UI.caseval},clearTimeout(n),console.log("[CAS] Giac/Xcas (UI.caseval) loaded"),t()):setTimeout(r,300)};r()},a.onerror=()=>{clearTimeout(n),M=!0,e(new Error("Failed to load Giac WASM from CDN"))},document.head.appendChild(a)}),g)}},async evaluate(t){if(!s)throw new Error("Giac not loaded");const e=performance.now();let n;try{if(s.caseval)n=s.caseval(t);else if(s.ccall)n=s.ccall("caseval","string",["string"],[t]);else throw new Error("Giac: no evaluation method available")}catch(i){throw new Error(`Giac error: ${i.message||i}`)}const a=performance.now()-e;let r;try{const i=`latex(${t})`;s.caseval?r=s.caseval(i):s.ccall&&(r=s.ccall("caseval","string",["string"],[i])),r&&r.startsWith('"')&&r.endsWith('"')&&(r=r.slice(1,-1))}catch{}return{text:n,latex:r,engine:"giac",timeMs:a}},supports(t){return!0}},A="https://cdn.jsdelivr.net/pyodide/v0.27.5/full/";let u=null,v=null;function j(t){return t.replace(/\^/g,"**")}const B={name:"sympy",label:"SymPy (Python WASM)",isReady(){return u!==null},async init(){if(!u)return v||(v=(async()=>{globalThis.loadPyodide||await new Promise((e,n)=>{const a=document.createElement("script");a.src=`${A}pyodide.js`,a.onload=()=>e(),a.onerror=()=>n(new Error("Failed to load Pyodide")),document.head.appendChild(a)});const t=globalThis.loadPyodide;u=await t({indexURL:A}),await u.loadPackage("sympy"),await u.runPythonAsync(`
from sympy import *
x, y, z, t, s, n, k, m, a, b, c, d = symbols('x y z t s n k m a b c d')
init_printing()

def _hekatan_eval(expr_str):
    """Evaluate a SymPy expression string and return (text, latex, numeric)"""
    try:
        _expr = eval(expr_str)
    except Exception as e:
        return (f"Error: {e}", "", None)

    _text = str(_expr)

    try:
        _ltx = latex(_expr)
    except:
        _ltx = ""

    _num = None
    try:
        _n = N(_expr)
        if _n.is_number:
            _num = float(_n)
    except:
        pass

    return (_text, _ltx, _num)
`),console.log("[CAS] SymPy/Pyodide loaded")})(),v)},async evaluate(t){if(!u)throw new Error("SymPy not loaded");const e=performance.now(),n=j(t),a=`_hekatan_eval(${JSON.stringify(n)})`,r=await u.runPythonAsync(a),[i,o,c]=r.toJs();r.destroy();const f=performance.now()-e;if(typeof i=="string"&&i.startsWith("Error:"))throw new Error(i);return{text:i,latex:o||void 0,numeric:c??void 0,engine:"sympy",timeMs:f}},supports(t){return!0}},F="https://maxima-on-wasm.pages.dev";let l=null,p=!1,E=null,G=0;const y=new Map;function U(t){if(t.source!==(l==null?void 0:l.contentWindow))return;const e=t.data;if(!(!e||typeof e!="object")){if(e.type==="maxima-ready"){p=!0;return}if(e.type==="maxima-result"&&typeof e.id=="number"){const n=y.get(e.id);n&&(y.delete(e.id),e.error?n.reject(new Error(e.error)):n.resolve(e))}}}const O={name:"maxima",label:"Maxima (Lisp WASM)",isReady(){return p},async init(){if(!p)return E||(E=new Promise((t,e)=>{window.addEventListener("message",U),l=document.createElement("iframe"),l.style.display="none",l.src=F,document.body.appendChild(l);const n=setTimeout(()=>{p||e(new Error("Maxima init timeout (60s)"))},6e4),a=setInterval(()=>{p&&(clearInterval(a),clearTimeout(n),console.log("[CAS] Maxima WASM loaded"),t())},500)}),E)},async evaluate(t){if(!p||!(l!=null&&l.contentWindow))throw new Error("Maxima not loaded");const e=performance.now(),n=++G,a=await new Promise((i,o)=>{y.set(n,{resolve:i,reject:o}),l.contentWindow.postMessage({type:"maxima-eval",id:n,expr:t},"*"),setTimeout(()=>{y.has(n)&&(y.delete(n),o(new Error("Maxima eval timeout (30s)")))},3e4)}),r=performance.now()-e;return{text:a.text||String(a.result),latex:a.latex||void 0,engine:"maxima",timeMs:r}},supports(t){return!0}};let b=!1,w=null;const X=["ode","laplace","fourier"];function q(t){try{const n=new Function("Math",`"use strict"; return (${t});`)(Math);if(typeof n=="number"&&isFinite(n))return String(n)}catch{}return`[SymEngine fallback] ${t}`}const z={name:"symengine",label:"SymEngine (C++ — JS fallback)",isReady(){return b},async init(){if(!b)return w||(w=(async()=>{b=!0,console.log("[CAS] SymEngine initialized (JS fallback mode)")})(),w)},async evaluate(t){if(!b)throw new Error("SymEngine not initialized");const e=performance.now(),n=q(t),a=performance.now()-e,r=parseFloat(n);return{text:n,numeric:isFinite(r)?r:void 0,engine:"symengine",timeMs:a}},supports(t){return!X.includes(t)}},x={giac:R,sympy:B,maxima:O,symengine:z};let m=["sympy","giac","maxima","symengine"];function H(t){const e=t.trim().toLowerCase();return/\bdiff\b|\bderivative\b/.test(e)?"diff":/\bintegrat/.test(e)?"integrate":/\blimit\b/.test(e)?"limit":/\bsolve\b|\broots?\b/.test(e)?"solve":/\bode\b|\bdsolve\b/.test(e)?"ode":/\bmatrix\b|\bdet\b|\beigenval/.test(e)?"matrix":/\bseries\b|\btaylor\b/.test(e)?"series":/\blaplace\b/.test(e)?"laplace":/\bfourier\b/.test(e)?"fourier":/\bsimplif/.test(e)?"simplify":/\bexpand\b/.test(e)?"expand":/\bfactor\b/.test(e)?"factor":/\bsum\b/.test(e)?"sum":/\bproduct\b/.test(e)?"product":"eval"}const C={get engines(){return x},get priority(){return[...m]},setPriority(t){m=[...t]},async init(){for(const t of m)try{return await x[t].init(),t}catch(e){console.warn(`[CAS] Failed to init ${t}:`,e)}return null},async initEngine(t){await x[t].init()},async initAll(){return(await Promise.allSettled(m.map(async e=>(await x[e].init(),e)))).filter(e=>e.status==="fulfilled").map(e=>e.value)},async evaluate(t,e){const n=H(t),a=[],r=e?[e,...m.filter(i=>i!==e)]:m;for(const i of r){const o=x[i];if(o.supports(n)){if(!o.isReady())try{await o.init()}catch(c){a.push(`${i}: init failed — ${c.message}`);continue}try{return await o.evaluate(t)}catch(c){a.push(`${i}: ${c.message}`)}}}throw new Error(`All CAS engines failed for "${t}":
${a.join(`
`)}`)}},S=document.getElementById("codeInput"),h=document.getElementById("output"),$=document.getElementById("btnRun"),I=document.getElementById("btnInitAll"),J=document.getElementById("engineSelect"),d=document.getElementById("statusText"),K=document.getElementById("exampleList");let L=!1;async function Y(){if(!L){if(window.katex){L=!0;return}await new Promise((t,e)=>{const n=document.createElement("script");n.src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js",n.onload=()=>{L=!0,t()},n.onerror=()=>e(new Error("Failed to load KaTeX")),document.head.appendChild(n)})}}function Q(t,e){try{window.katex.render(t,e,{throwOnError:!1,displayMode:!0})}catch{e.textContent=t}}function _(){const t=C.engines;for(const e of["giac","sympy","maxima","symengine"]){const n=document.getElementById(`dot-${e}`);n&&(n.className=`engine-dot ${t[e].isReady()?"on":"off"}`)}}const k={Derivadas:`# Derivadas
diff(sin(x)*x^2, x)
diff(ln(x^2+1), x)
diff(exp(x)*cos(x), x, x)`,Integrales:`# Integrales
integrate(x^2*sin(x), x)
integrate(1/(1+x^2), x)
integrate(exp(-x^2), x, -oo, oo)`,Ecuaciones:`# Resolver ecuaciones
solve(x^3 - 6*x^2 + 11*x - 6, x)
solve(x^2 + 2*x - 3 = 0, x)`,Limites:`# Limites
limit(sin(x)/x, x, 0)
limit((1+1/n)^n, n, oo)
limit(x*ln(x), x, 0, '+')`,Series:`# Series de Taylor
series(sin(x), x, 0, 10)
series(exp(x), x, 0, 8)
series(1/(1-x), x, 0, 6)`,Matrices:`# Matrices
det([[1,2,3],[4,5,6],[7,8,10]])
eigenvals([[2,1],[1,3]])`,Simplificar:`# Simplificacion
simplify(sin(x)^2 + cos(x)^2)
expand((x+1)^4)
factor(x^4 - 1)`,EDO:`# Ecuaciones diferenciales
dsolve(diff(y(x),x) + y(x) - x, y(x))
dsolve(diff(y(x),x,x) + y(x), y(x))`,Laplace:`# Transformada de Laplace
laplace(sin(t), t, s)
laplace(exp(-a*t)*cos(b*t), t, s)`,"Todas las operaciones":`# Demo completo - Hekatan CAS
> Derivada
diff(x^3*sin(x), x)

> Integral definida
integrate(x*exp(-x), x, 0, oo)

> Limite
limit((1+1/n)^n, n, oo)

> Ecuacion cubica
solve(x^3 - 1, x)

> Serie de Taylor
series(cos(x), x, 0, 8)

> Simplificar
simplify((x^2-1)/(x-1))

> Expandir
expand((a+b)^3)

> Factorizar
factor(x^4 - 16)

> Determinante
det([[a,b],[c,d]])`};for(const[t,e]of Object.entries(k)){const n=document.createElement("li");n.textContent=t,n.addEventListener("click",()=>{S.value=e,document.querySelectorAll(".example-list li").forEach(a=>a.classList.remove("active")),n.classList.add("active")}),K.appendChild(n)}function V(t){return t.split(`
`).filter(e=>e.trim().length>0).map(e=>{const n=e.trim();return n.startsWith("#")?{type:"comment",content:n.slice(1).trim()}:n.startsWith(">")?{type:"text",content:n.slice(1).trim()}:{type:"expr",content:n}})}function T(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}async function N(){const t=S.value.trim();if(!t)return;h.innerHTML="";const e=V(t),n=J.value||void 0;d.textContent="Ejecutando...",$.disabled=!0,await Y();for(const a of e){if(a.type==="comment"){const i=document.createElement("div");i.className="cas-comment",i.textContent=a.content,h.appendChild(i);continue}if(a.type==="text"){const i=document.createElement("div");i.className="cas-text",i.innerHTML=`<strong>${T(a.content)}</strong>`,h.appendChild(i);continue}const r=document.createElement("div");r.className="cas-result loading",r.innerHTML=`
      <div class="expr-input">${T(a.content)}</div>
      <div class="expr-output">Evaluando...</div>
    `,h.appendChild(r);try{const i=await C.evaluate(a.content,n);r.className="cas-result";const o=r.querySelector(".expr-output");i.latex?Q(i.latex,o):o.textContent=i.text;const c=document.createElement("span");c.className="engine-badge",c.textContent=i.engine,r.appendChild(c);const f=document.createElement("span");f.className="timing",f.textContent=`${i.timeMs.toFixed(1)} ms`,r.appendChild(f),_()}catch(i){r.className="cas-result error";const o=r.querySelector(".expr-output");o.textContent=i.message}}d.textContent="Listo",$.disabled=!1}$.addEventListener("click",N);S.addEventListener("keydown",t=>{t.key==="Enter"&&(t.ctrlKey||t.metaKey)&&(t.preventDefault(),N())});I.addEventListener("click",async()=>{d.textContent="Cargando todos los motores...",I.disabled=!0;for(const e of["giac","sympy","maxima","symengine"]){const n=document.getElementById(`dot-${e}`);n&&!n.classList.contains("on")&&(n.className="engine-dot loading")}const t=await C.initAll();_(),d.textContent=`${t.length} motores cargados: ${t.join(", ")}`,I.disabled=!1});var P;(P=document.getElementById("engineList"))==null||P.addEventListener("click",async t=>{const e=t.target.closest("li");if(!e)return;const n=e.dataset.engine;if(!n)return;const a=document.getElementById(`dot-${n}`);a&&(a.className="engine-dot loading"),d.textContent=`Cargando ${n}...`;try{await C.initEngine(n),d.textContent=`${n} cargado`}catch(r){d.textContent=`Error: ${r.message}`}_()});S.value=k["Todas las operaciones"];document.querySelectorAll(".example-list li").forEach(t=>{t.textContent==="Todas las operaciones"&&t.classList.add("active")});_();d.textContent="Listo — Ctrl+Enter para ejecutar";
