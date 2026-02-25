import"./modulepreload-polyfill-B5Qt9EMX.js";import{p as F,H as V,e as N}from"./evaluator-CgBoaY4m.js";let U=4;function L(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function v(e){switch(e.type){case"number":return H(e.value);case"variable":return`<var>${L(e.name)}</var>`;case"assign":{let n=`<var>${L(e.name)}</var>`;return e.indices&&(n+=`<sub>${e.indices.map(v).join(",")}</sub>`),`${n} = ${v(e.expr)}`}case"binary":{const{op:n,left:t,right:s}=e;return n==="/"?`<span class="dvc">${v(t)}<span class="dvl"></span>${v(s)}</span>`:`${v(t)} ${Y(n)} ${v(s)}`}case"unary":return e.op==="-"?`−${v(e.operand)}`:`${e.op}${v(e.operand)}`;case"call":{const n=e.args.map(v).join("; ");return`<b>${L(e.name)}</b>(${n})`}case"index":{const n=e.indices.map(v).join(",");return`${v(e.target)}<sub>${n}</sub>`}case"cellarray":case"vector":return`{${e.elements.map(v).join("; ")}}`;case"matrix":return ee(e.rows);default:return L(String(e.value||"?"))}}function Y(e){switch(e){case"*":return"·";case"<=":return"≤";case">=":return"≥";case"!=":return"≠";default:return e}}function H(e){return isFinite(e)?e.toFixed(U).replace(/\.?0+$/,"")||"0":e>0?"∞":e<0?"−∞":"NaN"}function ee(e){let n='<table class="mat"><tbody>';for(const t of e){n+="<tr>";for(const s of t)n+=`<td>${v(s)}</td>`;n+="</tr>"}return n+"</tbody></table>"}function B(e,n){return Array.isArray(e)?Array.isArray(e[0])?te(e):ne(e):H(e)}function te(e){let n='<table class="mat"><tbody>';for(const t of e){n+="<tr>";for(const s of t)n+=`<td>${H(s)}</td>`;n+="</tr>"}return n+"</tbody></table>"}function ne(e){return`{${e.map(H).join("; ")}}`}function P(e){let n="",t=e.replace(/≤/g,"≤").replace(/≥/g,"≥").replace(/·/g,"·").replace(/×/g,"×"),s=0;for(;s<t.length;){const i=t[s];if("∫∬∭∑∏ΣΠ".includes(i)){const o=i==="Σ"?"∑":i==="Π"?"∏":i,c=A(t,s+1,o);n+=c.html,s=c.end;continue}if(i==="∂"){const c=t.slice(s).match(/^∂([²³]?)\/∂([A-Za-z])\1/);if(c){const a=c[1],d=c[2],_=a?`∂${a}`:"∂",r=`∂${d}${a}`;n+=`<span class="dvc">${_}<span class="dvl"></span>${r}</span>`,s+=c[0].length;continue}n+="∂",s++;continue}if(i==="^"&&s>0){const o=R(t,s+1);if(o){n+=`<sup>${L(o.content)}</sup>`,s=o.end;continue}}if(i==="_"&&s>0){const o=R(t,s+1);if(o){n+=`<sub>${L(o.content)}</sub>`,s=o.end;continue}}n+=L(i),s++}return n}const W={alpha:"α",beta:"β",gamma:"γ",delta:"δ",epsilon:"ε",zeta:"ζ",eta:"η",theta:"θ",iota:"ι",kappa:"κ",lambda:"λ",mu:"μ",nu:"ν",xi:"ξ",omicron:"ο",rho:"ρ",sigma:"σ",tau:"τ",upsilon:"υ",phi:"φ",chi:"χ",psi:"ψ",omega:"ω",Alpha:"Α",Beta:"Β",Gamma:"Γ",Delta:"Δ",Epsilon:"Ε",Zeta:"Ζ",Eta:"Η",Theta:"Θ",Lambda:"Λ",Xi:"Ξ",Sigma:"Σ",Phi:"Φ",Psi:"Ψ",Omega:"Ω"},se=new Set(["sin","cos","tan","cot","sec","csc","asin","acos","atan","acot","sinh","cosh","tanh","coth","ln","log","exp","sqrt","abs","sgn","sign","min","max","sum","prod","det","tr","rank","dim","ker","Im","Re"]);function E(e){let n="",t=0;const s=e.length;for(;t<s;){const i=e[t];if("∫∬∭∑∏".includes(i)){const o=A(e,t+1,i);n+=o.html,t=o.end;continue}if(i==="Σ"||i==="Π"){const o=i==="Σ"?"∑":"∏",c=A(e,t+1,o);n+=c.html,t=c.end;continue}if(i==="∂"){const c=e.slice(t).match(/^∂([²³⁴]?)\/∂([A-Za-z])([²³⁴]?)/);if(c){const a=c[1]||c[3],d=c[2],_=a?`∂${a}`:"∂",r=`∂${d}${a}`;n+=`<span class="dvc">${_}<span class="dvl"></span>${r}</span>`,t+=c[0].length;continue}n+="∂",t++;continue}if(i==="_"){const o=R(e,t+1);if(o){n+=`<sub>${E(o.content)}</sub>`,t=o.end;continue}}if(i==="^"){const o=R(e,t+1);if(o){n+=`<sup>${E(o.content)}</sup>`,t=o.end;continue}}if(i==="{"){const o=S(e,t);if(o>0&&o+1<s&&e[o+1]==="/"){const a=e.slice(t+1,o),d=o+2;if(d<s&&e[d]==="{"){const _=S(e,d);if(_>0){const r=e.slice(d+1,_);n+=`<span class="dvc">${E(a)}<span class="dvl"></span>${E(r)}</span>`,t=_+1;continue}}}const c=S(e,t);if(c>0){n+=E(e.slice(t+1,c)),t=c+1;continue}}if(i==="("){const o=O(e,t);if(o>0&&o+1<s&&e[o+1]==="/"){const a=o+2;if(a<s&&e[a]==="("){const d=O(e,a);if(d>0){const _=e.slice(t+1,o),r=e.slice(a+1,d);n+=`<span class="dvc">${E(_)}<span class="dvl"></span>${E(r)}</span>`,t=d+1;continue}}}const c=O(e,t);if(c>0){n+=`(${E(e.slice(t+1,c))})`,t=c+1;continue}}if(i==="-"&&t+1<s&&e[t+1]===">"){n+="→",t+=2;continue}if(i===">"&&t+1<s&&e[t+1]==="="){n+="≥",t+=2;continue}if(i==="<"&&t+1<s&&e[t+1]==="="){n+="≤",t+=2;continue}if(i==="!"&&t+1<s&&e[t+1]==="="){n+="≠",t+=2;continue}if(i==="~"&&t+1<s&&e[t+1]==="="){n+="≈",t+=2;continue}if(/[A-Za-z]/.test(i)){let o="",c=t;for(;c<s&&/[A-Za-z0-9]/.test(e[c]);)o+=e[c],c++;if(o==="Int"||o==="int"){const a=A(e,c,"∫");n+=a.html,t=a.end;continue}if(o==="Sum"){const a=A(e,c,"∑");n+=a.html,t=a.end;continue}if(o==="Prod"){const a=A(e,c,"∏");n+=a.html,t=a.end;continue}if(o==="lim"){let a='<span style="font-style:normal;font-weight:bold;">lim</span>';if(c<s&&e[c]==="_"){const d=R(e,c+1);d&&(a=`<span class="dvr">${a}<small>${E(d.content)}</small></span>`,c=d.end)}n+=a,t=c;continue}if(o==="d"&&c<s&&e[c]==="/"){const a=e.slice(t).match(/^d([²³]?)\/d([A-Za-z])([²³]?)/);if(a){const d=a[1]||a[3],_=a[2],r=d?`d${d}`:"d",f=`d${_}${d}`;n+=`<span class="dvc">${r}<span class="dvl"></span>${f}</span>`,t+=a[0].length;continue}}if(W[o]){n+=W[o],t=c;continue}if(se.has(o)){n+=`<b>${o}</b>`,t=c;continue}if(o==="inf"||o==="infty"||o==="infinity"){n+="∞",t=c;continue}n+=`<var>${L(o)}</var>`,t=c;continue}if(/[0-9]/.test(i)){let o="",c=t;for(;c<s&&/[0-9.]/.test(e[c]);)o+=e[c],c++;n+=o,t=c;continue}if(/[\u2200-\u22FF\u2100-\u214F]/.test(i)){n+=i,t++;continue}if("+-=<>".includes(i)){n+=` ${L(i)} `,t++;continue}if(i==="·"){n+=" · ",t++;continue}if(i===" "){n+="&thinsp;",t++;continue}n+=L(i),t++}return n}function A(e,n,t){let s=n,i="",o="";for(let a=0;a<2;a++)if(s<e.length&&e[s]==="_"){const d=R(e,s+1);d&&(i=d.content,s=d.end)}else if(s<e.length&&e[s]==="^"){const d=R(e,s+1);d&&(o=d.content,s=d.end)}let c='<span class="dvr">';return o&&(c+=`<small>${E(o)}</small>`),c+=`<span class="nary">${t==="∫"||t==="∬"||t==="∭"?`<em>${t}</em>`:t}</span>`,i&&(c+=`<small>${E(i)}</small>`),c+="</span>",{html:c,end:s}}function R(e,n){if(n>=e.length)return null;if(e[n]==="{"){const t=S(e,n);return t>0?{content:e.slice(n+1,t),end:t+1}:null}return/[A-Za-z0-9α-ωΑ-Ω∞]/.test(e[n])?{content:e[n],end:n+1}:null}function S(e,n){let t=1;for(let s=n+1;s<e.length;s++)if(e[s]==="{"&&t++,e[s]==="}"&&(t--,t===0))return s;return-1}function O(e,n){let t=1;for(let s=n+1;s<e.length;s++)if(e[s]==="("&&t++,e[s]===")"&&(t--,t===0))return s;return-1}const oe=/^@\{(plot|plotly|svg|three|eq)\b\s*([^}]*)\}\s*$/i,ie=/^@\{end\s+(plot|plotly|svg|three|eq)\}\s*$/i;function C(e){var o;const n=new V,t=e.split(`
`);let s="",i=0;for(;i<t.length;){const a=t[i].trim();if(!a){s+='<div class="spacer"></div>',i++;continue}const d=a.match(oe);if(d){const r=d[1].toLowerCase(),f=((o=d[2])==null?void 0:o.trim())||"",m=[];for(i++;i<t.length;){const x=t[i].trim();if(ie.test(x)){i++;break}m.push(t[i]),i++}s+=ae(r,m,f);continue}if(/^#for\s+/i.test(a)){const r=fe(t,i,n);s+=r.html,i=r.nextLine;continue}if(/^#if\s+/i.test(a)){const r=me(t,i,n);s+=r.html,i=r.nextLine;continue}if(/^#while\s+/i.test(a)){const r=he(t,i,n);s+=r.html,i=r.nextLine;continue}if(/^#repeat\s*$/i.test(a)){const r=pe(t,i,n);s+=r.html,i=r.nextLine;continue}if(/^#{1,6}\s+/.test(a)&&!/^#(?:for|if|else|end|while|loop|repeat|until|next)\b/i.test(a)){const r=(a.match(/^#+/)||[""])[0].length,f=a.slice(r).trim();s+=`<h${Math.min(r,6)}>${P(f)}</h${Math.min(r,6)}>`,i++;continue}if(a.startsWith(">")){const r=a.slice(1).trim();s+=`<p class="comment">${P(r)}</p>`,i++;continue}if(/^@\{cells\}\s*\|/.test(a)){const f=a.replace(/^@\{cells\}\s*/,"").split("|").map(x=>x.trim()).filter(Boolean);let m='<div class="cells-row">';for(const x of f)m+=`<div class="cell">${G(x,n)}</div>`;m+="</div>",s+=m,i++;continue}if(a.startsWith("'")){const r=a.slice(1).trim();if(r.startsWith("#")){const f=(r.match(/^#+/)||[""])[0].length,m=r.slice(f).trim();s+=`<h${Math.min(f,6)}>${P(m)}</h${Math.min(f,6)}>`}else r.startsWith("---")?s+="<hr>":r.startsWith("- ")||r.startsWith("* ")?s+=`<li>${P(r.slice(2))}</li>`:s+=`<p class="comment">${P(r)}</p>`;i++;continue}const _=a.match(/^([A-Za-z_]\w*)\(([^)]*)\)\s*=\s*(.+)$/);if(_){const[,r,f,m]=_,x=f.split(",").map(u=>u.trim()).filter(Boolean);try{const u=F(m);n.userFunctions.set(r,{params:x,body:u}),s+=`<div class="line fn-def"><var>${r}</var>(${x.join(", ")}) = ${P(m)}</div>`}catch(u){s+=`<div class="line error">${a} → Error: ${u.message}</div>`}i++;continue}s+=G(a,n),i++}return{html:s,env:n}}function G(e,n){try{const t=F(e),s=N(t,n);if(t.type==="assign"){const i=B(s);let o=`<var>${t.name}</var>`;if(t.indices){const c=t.indices.map(a=>v(a)).join(",");o+=`<sub>${c}</sub>`}return`<div class="line assign">${o} = ${v(t.expr)} = ${i}</div>`}return`<div class="line expr">${v(t)} = ${B(s)}</div>`}catch(t){return`<div class="line error">${P(e)} <span class="err">← ${t.message}</span></div>`}}function ae(e,n,t){switch(e){case"eq":return ce(n,t||"");case"plot":return re(n);case"plotly":return le(n);case"svg":return de(n);case"three":return ue(n);default:return`<pre>${n.join(`
`)}</pre>`}}function ce(e,n){if(e.length===0)return"";let s=`<div class="eq-block" style="text-align:${/^(left|right|center)$/i.test(n)?n.toLowerCase():"center"};margin:8px 0;">`;for(const i of e){const o=i.trim();if(!o){s+='<div style="height:4px"></div>';continue}const c=o.match(/\((\d+(?:\.\d+)?[a-z]?)\)\s*$/);let a=o,d="";c&&(a=o.slice(0,c.index).trim(),d=c[1]),s+='<p class="eq" style="margin:4px 0;line-height:2.2;">',s+=E(a),d&&(s+=`<span style="float:right;font-style:normal;margin-left:24px">(${d})</span>`),s+="</p>"}return s+"</div>"}function re(e){var x;let i=-5,o=5,c=-2,a=2;const d=[],_=[];for(const u of e){const l=u.trim();if(!l||l.startsWith("#")||l.startsWith("'"))continue;const b=l.match(/^x\s*=\s*([-\d.]+)\s*:\s*([-\d.]+)/);if(b){i=+b[1],o=+b[2];continue}const h=l.match(/^y\s*=\s*([-\d.]+)\s*:\s*([-\d.]+)/);if(h){c=+h[1],a=+h[2];continue}const p=l.match(/^y\s*=\s*(.+?)(\s*\|.*)?$/);if(p){const $=p[1].trim();let y="#2196f3",g=2,k="";if(p[2]){const M=p[2],D=M.match(/color:\s*(#[0-9A-Fa-f]{3,8}|\w+)/);D&&(y=D[1]);const z=M.match(/width:\s*(\d+)/);z&&(g=+z[1]);const I=M.match(/label:\s*"([^"]+)"/);I&&(k=I[1])}d.push({expr:$,color:y,width:g,label:k});continue}_.push(l)}const r=u=>50+(u-i)/(o-i)*500,f=u=>350-(u-c)/(a-c)*300;let m='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" style="max-width:600px;background:#fff;border:1px solid #ddd;">';m+='<g stroke="#e0e0e0" stroke-width="0.5">';for(let u=Math.ceil(i);u<=Math.floor(o);u++)m+=`<line x1="${r(u)}" y1="50" x2="${r(u)}" y2="350"/>`;for(let u=Math.ceil(c);u<=Math.floor(a);u++)m+=`<line x1="50" y1="${f(u)}" x2="550" y2="${f(u)}"/>`;m+="</g>",c<=0&&a>=0&&(m+=`<line x1="50" y1="${f(0)}" x2="550" y2="${f(0)}" stroke="#666" stroke-width="1"/>`),i<=0&&o>=0&&(m+=`<line x1="${r(0)}" y1="50" x2="${r(0)}" y2="350" stroke="#666" stroke-width="1"/>`),m+='<g font-size="10" fill="#888" text-anchor="middle">';for(let u=Math.ceil(i);u<=Math.floor(o);u++)u!==0&&(m+=`<text x="${r(u)}" y="365">${u}</text>`);for(let u=Math.ceil(c);u<=Math.floor(a);u++)u!==0&&(m+=`<text x="40" y="${f(u)+4}" text-anchor="end">${u}</text>`);m+="</g>";for(const u of d){const l=new V,b=300,h=[];for(let p=0;p<=b;p++){const $=i+(o-i)*p/b;l.setVar("x",$);try{const y=F(u.expr),g=N(y,l);isFinite(g)&&g>=c-10&&g<=a+10&&h.push(`${r($).toFixed(1)},${f(g).toFixed(1)}`)}catch{}}h.length>1&&(m+=`<polyline points="${h.join(" ")}" fill="none" stroke="${u.color}" stroke-width="${u.width}"/>`),u.label&&(m+=`<text x="545" y="${f(0)-5}" fill="${u.color}" font-size="12" text-anchor="end">${u.label}</text>`)}for(const u of _){const l=u.split(/\s+/),b=l[0];if(b==="rect"&&l.length>=5){const[,h,p,$,y]=l.map(Number),g=l[5]||"#e3f2fd",k=Math.min(r(h),r($)),M=Math.min(f(p),f(y)),D=Math.abs(r($)-r(h)),z=Math.abs(f(y)-f(p));m+=`<rect x="${k}" y="${M}" width="${D}" height="${z}" fill="${g}" opacity="0.3"/>`}else if(b==="point"&&l.length>=3){const h=+l[1],p=+l[2],$=l[3]||"#f44336",y=+(l[4]||"4");m+=`<circle cx="${r(h)}" cy="${f(p)}" r="${y}" fill="${$}"/>`}else if(b==="text"&&l.length>=4){const h=+l[1],p=+l[2],$=u.match(/"([^"]+)"/),y=$?$[1]:l.slice(3).join(" "),g=(x=l[l.length-1])!=null&&x.startsWith("#")?l[l.length-1]:"#333";m+=`<text x="${r(h)}" y="${f(p)}" fill="${g}" font-size="12">${y}</text>`}else if(b==="eq"&&l.length>=4){const h=+l[1],p=+l[2],$=u.match(/"([^"]+)"/),y=$?$[1]:l.slice(3).join(" ");m+=`<text x="${r(h)}" y="${f(p)}" fill="#333" font-size="13" font-style="italic">${y}</text>`}else if(b==="line"&&l.length>=5){const[,h,p,$,y]=l.map(Number),g=l[5]||"#333",k=l[6]||"1";m+=`<line x1="${r(h)}" y1="${f(p)}" x2="${r($)}" y2="${f(y)}" stroke="${g}" stroke-width="${k}"/>`}else if(b==="arrow"&&l.length>=5){const[,h,p,$,y]=l.map(Number),g=l[5]||"#333",k=`arr${Math.random().toString(36).slice(2,6)}`;m+=`<defs><marker id="${k}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="${g}"/></marker></defs>`,m+=`<line x1="${r(h)}" y1="${f(p)}" x2="${r($)}" y2="${f(y)}" stroke="${g}" stroke-width="1.5" marker-end="url(#${k})"/>`}else if(b==="proj"&&l.length>=3){const h=+l[1],p=+l[2],$=l[3]||"#999";m+=`<line x1="${r(h)}" y1="${f(p)}" x2="${r(h)}" y2="${f(0)}" stroke="${$}" stroke-width="0.8" stroke-dasharray="4,3"/>`,m+=`<line x1="${r(h)}" y1="${f(p)}" x2="${r(0)}" y2="${f(p)}" stroke="${$}" stroke-width="0.8" stroke-dasharray="4,3"/>`}else if(b==="hline"&&l.length>=2){const h=+l[1],p=l[2]||"#999";m+=`<line x1="50" y1="${f(h)}" x2="550" y2="${f(h)}" stroke="${p}" stroke-width="0.8" stroke-dasharray="5,3"/>`}else if(b==="vline"&&l.length>=2){const h=+l[1],p=l[2]||"#999";m+=`<line x1="${r(h)}" y1="50" x2="${r(h)}" y2="350" stroke="${p}" stroke-width="0.8" stroke-dasharray="5,3"/>`}else if(b==="dim"&&l.length>=5){const[,h,p,$,y]=l.map(Number),g=u.match(/"([^"]+)"/),k=g?g[1]:"",M=(r(h)+r($))/2,D=(f(p)+f(y))/2;m+=`<line x1="${r(h)}" y1="${f(p)}" x2="${r($)}" y2="${f(y)}" stroke="#666" stroke-width="1"/>`,m+=`<text x="${M}" y="${D-5}" fill="#666" font-size="11" text-anchor="middle">${k}</text>`}}return m+="</svg>",`<div class="plot-container">${m}</div>`}function le(e){const n=`plotly_${Math.random().toString(36).slice(2,8)}`,t=e.join(`
`);return`<div id="${n}" style="width:100%;height:400px;"></div>
<script>if(window.Plotly){(function(){${t};Plotly.newPlot("${n}",data,layout||{})})()}else{document.getElementById("${n}").textContent="Plotly not loaded"}<\/script>`}function de(e){return`<div class="svg-container">${e.join(`
`)}</div>`}function ue(e){const n=`three_${Math.random().toString(36).slice(2,8)}`,t=e.join(`
`);return`<div id="${n}" style="width:100%;height:400px;border:1px solid #ddd;"></div>
<script type="module">
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import {OrbitControls} from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/OrbitControls.js';
(function(){const container=document.getElementById("${n}");
const scene=new THREE.Scene();scene.background=new THREE.Color(0xf5f5f5);
const camera=new THREE.PerspectiveCamera(50,container.clientWidth/container.clientHeight,0.1,1000);
camera.position.set(5,5,5);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(container.clientWidth,container.clientHeight);
container.appendChild(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);
scene.add(new THREE.AmbientLight(0x404040));
const dirLight=new THREE.DirectionalLight(0xffffff,0.8);dirLight.position.set(5,10,7);scene.add(dirLight);
${t}
function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);}animate();
})();<\/script>`}function fe(e,n,t){const s=e[n].trim(),i=s.match(/^#for\s+(\w+)\s*=\s*(.*?)\s+to\s+(.*?)(?:\s*:\s*(.+))?\s*$/i);if(!i)return{html:`<div class="error">Invalid #for: ${s}</div>`,nextLine:n+1};const o=i[1],c=T(i[2],t),a=T(i[3],t),d=i[4]?T(i[4],t):1,_=[];let r=n+1,f=1;for(;r<e.length;){const x=e[r].trim();if(/^#for\s+/i.test(x)&&f++,/^#next\s*$/i.test(x)&&(f--,f===0)){r++;break}_.push(e[r]),r++}let m="";for(let x=c;d>0?x<=a:x>=a;x+=d){t.setVar(o,x);const u=C(_.join(`
`));m+=u.html}return{html:m,nextLine:r}}function me(e,n,t){const s=[];let i={cond:e[n].trim().replace(/^#if\s+/i,""),body:[]},o=n+1,c=1;for(;o<e.length;){const a=e[o].trim();if(/^#if\s+/i.test(a)){c++,i.body.push(e[o]),o++;continue}if(/^#end\s+if\s*$/i.test(a)){if(c--,c===0){s.push(i),o++;break}i.body.push(e[o]),o++;continue}if(c===1&&/^#else\s+if\s+/i.test(a)){s.push(i),i={cond:a.replace(/^#else\s+if\s+/i,""),body:[]},o++;continue}if(c===1&&/^#else\s*$/i.test(a)){s.push(i),i={cond:null,body:[]},o++;continue}i.body.push(e[o]),o++}for(const a of s)if(a.cond===null||T(a.cond,t))return{html:C(a.body.join(`
`)).html,nextLine:o};return{html:"",nextLine:o}}function he(e,n,t){const s=e[n].trim().replace(/^#while\s+/i,""),i=[];let o=n+1,c=1;for(;o<e.length;){const _=e[o].trim();if(/^#while\s+/i.test(_)&&c++,/^#loop\s*$/i.test(_)&&(c--,c===0)){o++;break}i.push(e[o]),o++}let a="",d=0;for(;T(s,t)&&d<1e4;){const _=C(i.join(`
`));a+=_.html,d++}return{html:a,nextLine:o}}function pe(e,n,t){const s=[];let i=n+1,o="",c=1;for(;i<e.length;){const _=e[i].trim();if(/^#repeat\s*$/i.test(_)&&c++,/^#until\s+/i.test(_)&&(c--,c===0)){o=_.replace(/^#until\s+/i,""),i++;break}s.push(e[i]),i++}let a="",d=0;do{const _=C(s.join(`
`));a+=_.html,d++}while(!T(o,t)&&d<1e4);return{html:a,nextLine:i}}function T(e,n){try{const t=F(e),s=N(t,n);return typeof s=="number"?s:NaN}catch{return 0}}const _e=`# Ejemplo 5.1 - Analisis de Grid Frame
> Mario Paz - Matrix Structural Analysis
> 2 elementos, 3 nodos, 9 GDL
> Unidades: kip, inch, rad

## 1. Propiedades
> W 14 x 82 - Todos los miembros
@{cells} |L = 100|I_z = 882|J_t = 5.08|
@{cells} |E_s = 29000|G_s = 11600|
> L [in], I_z [in^4], J_t [in^4], E_s [ksi], G_s [ksi]

## 2. Coeficientes de Rigidez
@{cells} |t_1 = G_s*J_t/L|a_4 = 4*E_s*I_z/L|a_2 = 2*E_s*I_z/L|
@{cells} |b_6 = 6*E_s*I_z/L^2|c_12 = 12*E_s*I_z/L^3|
> t [kip*in], a [kip*in], b [kip], c [kip/in]

## 3. Matriz de Rigidez Local [k] (eq 5.7)
> DOF: [theta_x, theta_z, delta_y] por nodo
> Igual para ambos elementos (eq a)
k = [[t_1,0,0,-t_1,0,0],[0,a_4,b_6,0,a_2,-b_6],[0,b_6,c_12,0,b_6,-c_12],[-t_1,0,0,t_1,0,0],[0,a_2,b_6,0,a_4,-b_6],[0,-b_6,-c_12,0,-b_6,c_12]]

## 4. Transformacion Elemento 2
> Elem 1: theta=0 => T_1=I (identidad)
> Elem 2: theta=90 grados (eq 5.11, eq b)
T_2 = [[0,-1,0,0,0,0],[1,0,0,0,0,0],[0,0,1,0,0,0],[0,0,0,0,-1,0],[0,0,0,1,0,0],[0,0,0,0,0,1]]

## 5. Rigidez Global Elemento 2
> k_bar_2 = T_2' * k * T_2 (eq 5.15, eq c)
kb2 = transpose(T_2) * k * T_2

## 6. Ensamblaje [K]_R
> Nodo 2 (libre) = extremo j Elem 1 (DOFs 4:6) + extremo i Elem 2 (DOFs 1:3)
> Submatriz Elem 1:
k1R = k[4:6, 4:6]
> Submatriz Elem 2 (global):
k2R = kb2[1:3, 1:3]
> [K]_R = k1R + k2R (eq d)
K_R = k1R + k2R

## 7. Fuerzas de Empotramiento
> Elem 1: M_0=200 kip*in a L/2, Apendice I Caso (b) (eq e)
@{cells} |L_1 = L/2|L_2 = L/2|M_0 = 200|
> Q_1=6*M_0*L_1*L_2/L^3, Q_2=M_0*L_2*(2*L_1-L_2)/L^2, Q_3=-Q_1, Q_4=M_0*L_1*(2*L_2-L_1)/L^2
@{cells} |Q_1 = 6*M_0*L_1*L_2/L^3|Q_2 = M_0*L_2*(2*L_1 - L_2)/L^2|
@{cells} |Q_3 = -Q_1|Q_4 = M_0*L_1*(2*L_2 - L_1)/L^2|
> DOF grid: [theta_x, theta_z, delta_y] => Q_f = [0, Q2, Q1, 0, Q4, Q3]
Q_f1 = col(0, Q_2, Q_1, 0, Q_4, Q_3)
> Elem 2: w=0.1 kip/in, Apendice I Caso (a) (eq f)
@{cells} |w_0 = 0.1|
> Q_f locales: M_i=wL^2/12, V_i=wL/2, M_j=-wL^2/12, V_j=wL/2
Q_f2L = col(0, w_0*L^2/12, w_0*L/2, 0, -w_0*L^2/12, w_0*L/2)
> Q_f en coordenadas globales via T_2'
Q_f2 = transpose(T_2) * Q_f2L

## 8. Vector de Fuerzas Reducido
> {F}_R = P - Q_f1(4:6) - Q_f2(1:3) (eq g)
> Incluye P = -10 kip en delta_y (coord 3)
P_d = col(0, 0, -10)
F_R = P_d - Q_f1[4:6] - Q_f2[1:3]

## 9. Solucion de Desplazamientos
> [K]_R {u} = {F}_R (eq h)
u = lusolve(K_R, F_R)
> u1=theta_x [rad], u2=theta_z [rad], u3=delta_y [in]

## 10. Desplazamientos Locales (eq i)
> Componentes: theta_x, theta_z, delta_y
@{cells} |u_1 = u[1]|u_2 = u[2]|u_3 = u[3]|
> Elem 1 (T_1=I): nodo 2 libre, nodo 1 empotrado
d_1 = col(u_1, u_2, u_3, 0, 0, 0)
> Elem 2: d_2 = T_2 * d_1 (T_1=I, mismo vector global)
d_2 = T_2 * d_1

## 11. Fuerzas en Elementos (eq 4.20)
> {P} = [k]{d} + {Q_f}
> Elem 1:
P_1 = k * d_1 + Q_f1
> Elem 2 (Q_f en locales):
P_2 = k * d_2 + Q_f2L

## 12. Reacciones en Apoyos
> Nodo 1 (empotrado): DOFs 4:6 de P_1
@{cells} |R_1 = P_1[4]|R_2 = P_1[5]|R_3 = P_1[6]|
> Nodo 3 (empotrado): P_bar_2 = T_2' * P_2 (eq 5.12)
Pb2 = transpose(T_2) * P_2
@{cells} |R_7 = Pb2[4]|R_8 = Pb2[5]|R_9 = Pb2[6]|
`,$e=`'# Calculo Basico
'Definicion de variables
a = 3
b = 4
c = sqrt(a^2 + b^2)

'Funciones trigonometricas
alpha = atan(b/a)
sin_a = sin(alpha)
cos_a = cos(alpha)

'Funcion de usuario
f(x) = x^3 - 2*x + 1
f(0)
f(1)
f(2)

'Area de circulo
r = 5
A = pi*r^2`,ye=`'# Grafico con anotaciones
@{plot}
x = -3.14 : 3.14
y = -1.5 : 1.5
y = sin(x) | color: #2196f3 | width: 2 | label: "sin(x)"
y = cos(x) | color: #f44336 | width: 2 | label: "cos(x)"
point 0 0 #333
point 1.5708 1 #2196f3 5
text 1.7 1.1 "pi/2, 1"
hline 1 #4caf50
hline -1 #4caf50
vline 0 #999
@{end plot}`,xe=`'# Ecuaciones Formateadas
@{eq}
∫_0^1 x^2 dx = {1}/{3}                              (1)
∑_{n=0}^{∞} {1}/{n!} = e                             (2)
∏_{k=1}^{N} k = N!                                    (3)
lim_{x->0} {sin(x)}/{x} = 1                          (4)
d/dx [x^n] = n·x^{n-1}                               (5)
∂/∂x [x^2·y + y^3] = 2·x·y                           (6)

∫_0^{∞} e^{-x^2} dx = {sqrt(pi)}/{2}                 (7)
∑_{n=1}^{∞} {1}/{n^2} = {pi^2}/{6}                   (8)

∂²/∂x² u + ∂²/∂y² u = 0                              (9)
d²y/dx² + omega^2·y = 0                              (10)
@{end eq}`,ge=`'# FEM Assembly - Ensamblaje de Rigidez
'Propiedades del elemento
E = 200000
A = 100
L = 1000

'Rigidez axial
k = E*A/L

'Matriz de rigidez local 2x2
K11 = k
K12 = -k
K21 = -k
K22 = k

'Ensamblaje 3 elementos en serie
'Nodo 1-2
K_global_11 = k
K_global_12 = -k
'Nodo 2 (contribucion de elem 1 y 2)
K_global_22 = k + k
K_global_23 = -k
'Nodo 3 (contribucion de elem 2 y 3)
K_global_33 = k + k
K_global_34 = -k
'Nodo 4
K_global_44 = k

'Fuerza aplicada en nodo 3
F3 = 1000
'Con nodo 1 fijo: u1=0
'Desplazamiento
u3 = F3/k`,be=`'# Operaciones con Vectores
'Definicion
v1 = {3; 4; 0}
v2 = {1; -2; 5}

'Magnitud
mag_v1 = sqrt(3^2 + 4^2 + 0^2)

'Producto punto
dot = 3*1 + 4*(-2) + 0*5

'Componentes
v1x = 3
v1y = 4
v1z = 0

'Suma de vectores
sx = v1x + 1
sy = v1y + (-2)
sz = v1z + 5`,ve=`'# Operaciones con Matrices
'Matriz 3x3
a11 = 2
a12 = 1
a13 = 0
a21 = 1
a22 = 3
a23 = -1
a31 = 0
a32 = -1
a33 = 4

'Traza (suma diagonal)
traza = a11 + a22 + a33

'Determinante 2x2
det2 = a11*a22 - a12*a21

'Determinante 3x3 (expansion cofactores)
det3 = a11*(a22*a33 - a23*a32) - a12*(a21*a33 - a23*a31) + a13*(a21*a32 - a22*a31)

'Inversa 2x2 de submatriz
inv11 = a22/det2
inv12 = -a12/det2
inv21 = -a21/det2
inv22 = a11/det2`,Ee=`'# Control de Flujo
'--- Ciclo #for ---
#for i = 1 to 5
x = i^2
#next

'--- Condicional #if ---
valor = 42
#if valor > 100
resultado = 1
#else if valor > 10
resultado = 2
#else
resultado = 3
#end if

'--- Ciclo #while ---
n = 1
suma = 0
#while n <= 10
suma = suma + n
n = n + 1
#loop

'--- Sumatoria ---
S = 0
#for k = 1 to 100
S = S + 1/k^2
#next`,ke=`'# Escena 3D con Three.js
@{three}
// Cubo
const geometry = new THREE.BoxGeometry(2, 2, 2);
const material = new THREE.MeshPhongMaterial({color: 0x2196f3});
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

// Esfera
const sphere = new THREE.Mesh(
  new THREE.SphereGeometry(0.8, 32, 32),
  new THREE.MeshPhongMaterial({color: 0xf44336})
);
sphere.position.set(3, 0, 0);
scene.add(sphere);

// Piso
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.MeshPhongMaterial({color: 0xeeeeee, side: THREE.DoubleSide})
);
floor.rotation.x = Math.PI / 2;
floor.position.y = -1.5;
scene.add(floor);

// Grid
scene.add(new THREE.GridHelper(10, 10));
@{end three}`,we=`'# Dibujo SVG
@{svg}
<svg viewBox="0 0 400 300" style="max-width:400px;background:#fff;border:1px solid #ddd;">
  <rect x="50" y="50" width="300" height="200" fill="none" stroke="#333" stroke-width="2"/>
  <circle cx="200" cy="150" r="60" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <line x1="50" y1="150" x2="350" y2="150" stroke="#999" stroke-dasharray="5,3"/>
  <line x1="200" y1="50" x2="200" y2="250" stroke="#999" stroke-dasharray="5,3"/>
  <text x="200" y="30" text-anchor="middle" font-size="14" fill="#333">Dibujo SVG</text>
</svg>
@{end svg}`,Le=`'# Calculo Simbolico (CAS)
'Para usar el editor CAS completo,
'ir a: /editor/index.html
'
'Operaciones soportadas:
' diff(sin(x)*x^2, x)     - Derivadas
' integrate(x^2, x)        - Integrales
' solve(x^2-4, x)          - Ecuaciones
' limit(sin(x)/x, x, 0)    - Limites
' series(exp(x), x, 0, 6)  - Series
' det([[1,2],[3,4]])        - Matrices
' dsolve(...)               - EDO
' laplace(sin(t), t, s)     - Laplace`,Z={calculo:{name:"Calculo Basico",code:$e},plot:{name:"@{plot} Graficos SVG",code:ye},eq_demo:{name:"@{eq} Ecuaciones",code:xe},fem_assembly:{name:"FEM Assembly",code:ge},vectores:{name:"Vectores",code:be},matrices:{name:"Matrices",code:ve},control_flow:{name:"Control de Flujo",code:Ee},three:{name:"@{three} 3D",code:ke},svg:{name:"@{svg} Dibujo",code:we},cas:{name:"CAS Simbolico (info)",code:Le},grid_frame:{name:"Grid Frame (Paz 5.1)",code:_e}},w=document.getElementById("codeInput"),q=document.getElementById("output"),Q=document.getElementById("btnRun"),j=document.getElementById("statusText"),X=document.getElementById("exampleList");for(const[e,n]of Object.entries(Z)){const t=document.createElement("li");t.textContent=n.name,t.dataset.key=e,t.addEventListener("click",()=>{w.value=n.code,document.querySelectorAll(".example-list li").forEach(s=>s.classList.remove("active")),t.classList.add("active")}),X.appendChild(t)}function J(){const e=w.value;if(!e.trim()){q.innerHTML="";return}j.textContent="Procesando...",Q.disabled=!0;try{const n=C(e);q.innerHTML=n.html,j.textContent="Listo"}catch(n){q.innerHTML=`<div class="line error">Error: ${n.message}</div>`,j.textContent="Error"}Q.disabled=!1}Q.addEventListener("click",J);w.addEventListener("keydown",e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)&&(e.preventDefault(),J()),e.key==="Tab"){e.preventDefault();const n=w.selectionStart,t=w.selectionEnd;w.value=w.value.substring(0,n)+"  "+w.value.substring(t),w.selectionStart=w.selectionEnd=n+2}});w.value=Z.calculo.code;const K=X.querySelector("li");K&&K.classList.add("active");j.textContent="Listo — Ctrl+Enter para ejecutar";
