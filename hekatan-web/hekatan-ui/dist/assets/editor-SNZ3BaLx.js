import"./modulepreload-polyfill-B5Qt9EMX.js";import{c as l}from"./casManager-GTGDkSkn.js";const d=document.getElementById("codeInput"),r=document.getElementById("output"),g=document.getElementById("btnRun"),p=document.getElementById("btnInitAll"),L=document.getElementById("engineSelect"),s=document.getElementById("statusText"),h=document.getElementById("exampleList");let f=!1;async function I(){if(!f){if(window.katex){f=!0;return}await new Promise((t,n)=>{const e=document.createElement("script");e.src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js",e.onload=()=>{f=!0,t()},e.onerror=()=>n(new Error("Failed to load KaTeX")),document.head.appendChild(e)})}}function b(t,n){try{window.katex.render(t,n,{throwOnError:!1,displayMode:!0})}catch{n.textContent=t}}function m(){const t=l.engines;for(const n of["giac","sympy","maxima","symengine"]){const e=document.getElementById(`dot-${n}`);e&&(e.className=`engine-dot ${t[n].isReady()?"on":"off"}`)}}const v={Derivadas:`# Derivadas
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
det([[a,b],[c,d]])`};for(const[t,n]of Object.entries(v)){const e=document.createElement("li");e.textContent=t,e.addEventListener("click",()=>{d.value=n,document.querySelectorAll(".example-list li").forEach(i=>i.classList.remove("active")),e.classList.add("active")}),h.appendChild(e)}function S(t){return t.split(`
`).filter(n=>n.trim().length>0).map(n=>{const e=n.trim();return e.startsWith("#")?{type:"comment",content:e.slice(1).trim()}:e.startsWith(">")?{type:"text",content:e.slice(1).trim()}:{type:"expr",content:e}})}function y(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}async function C(){const t=d.value.trim();if(!t)return;r.innerHTML="";const n=S(t),e=L.value||void 0;s.textContent="Ejecutando...",g.disabled=!0,await I();for(const i of n){if(i.type==="comment"){const a=document.createElement("div");a.className="cas-comment",a.textContent=i.content,r.appendChild(a);continue}if(i.type==="text"){const a=document.createElement("div");a.className="cas-text",a.innerHTML=`<strong>${y(i.content)}</strong>`,r.appendChild(a);continue}const o=document.createElement("div");o.className="cas-result loading",o.innerHTML=`
      <div class="expr-input">${y(i.content)}</div>
      <div class="expr-output">Evaluando...</div>
    `,r.appendChild(o);try{const a=await l.evaluate(i.content,e);o.className="cas-result";const c=o.querySelector(".expr-output");a.latex?b(a.latex,c):c.textContent=a.text;const x=document.createElement("span");x.className="engine-badge",x.textContent=a.engine,o.appendChild(x);const u=document.createElement("span");u.className="timing",u.textContent=`${a.timeMs.toFixed(1)} ms`,o.appendChild(u),m()}catch(a){o.className="cas-result error";const c=o.querySelector(".expr-output");c.textContent=a.message}}s.textContent="Listo",g.disabled=!1}g.addEventListener("click",C);d.addEventListener("keydown",t=>{t.key==="Enter"&&(t.ctrlKey||t.metaKey)&&(t.preventDefault(),C())});p.addEventListener("click",async()=>{s.textContent="Cargando todos los motores...",p.disabled=!0;for(const n of["giac","sympy","maxima","symengine"]){const e=document.getElementById(`dot-${n}`);e&&!e.classList.contains("on")&&(e.className="engine-dot loading")}const t=await l.initAll();m(),s.textContent=`${t.length} motores cargados: ${t.join(", ")}`,p.disabled=!1});var E;(E=document.getElementById("engineList"))==null||E.addEventListener("click",async t=>{const n=t.target.closest("li");if(!n)return;const e=n.dataset.engine;if(!e)return;const i=document.getElementById(`dot-${e}`);i&&(i.className="engine-dot loading"),s.textContent=`Cargando ${e}...`;try{await l.initEngine(e),s.textContent=`${e} cargado`}catch(o){s.textContent=`Error: ${o.message}`}m()});d.value=v["Todas las operaciones"];document.querySelectorAll(".example-list li").forEach(t=>{t.textContent==="Todas las operaciones"&&t.classList.add("active")});m();s.textContent="Listo — Ctrl+Enter para ejecutar";
