import"./modulepreload-polyfill-B5Qt9EMX.js";import{p as G,H as Y,e as W}from"./evaluator-C8FPjifL.js";let oe=4;function P(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function T(t){switch(t.type){case"number":return I(t.value);case"variable":return`<var>${P(t.name)}</var>`;case"assign":{let e=`<var>${P(t.name)}</var>`;return t.indices&&(e+=`<sub>${t.indices.map(T).join(",")}</sub>`),`${e} = ${T(t.expr)}`}case"binary":{const{op:e,left:n,right:s}=t;return e==="/"?`<span class="dvc">${T(n)}<span class="dvl"></span>${T(s)}</span>`:`${T(n)} ${ie(e)} ${T(s)}`}case"unary":return t.op==="-"?`−${T(t.operand)}`:`${t.op}${T(t.operand)}`;case"call":{const e=t.args.map(T).join("; ");return`<b>${P(t.name)}</b>(${e})`}case"index":{const e=t.indices.map(T).join(",");return`${T(t.target)}<sub>${e}</sub>`}case"cellarray":case"vector":return`{${t.elements.map(T).join("; ")}}`;case"matrix":return ae(t.rows);default:return P(String(t.value||"?"))}}function ie(t){switch(t){case"*":return"·";case"<=":return"≤";case">=":return"≥";case"!=":return"≠";default:return t}}function I(t){return isFinite(t)?t.toFixed(oe).replace(/\.?0+$/,"")||"0":t>0?"∞":t<0?"−∞":"NaN"}function ae(t){let e='<table class="mat"><tbody>';for(const n of t){e+="<tr>";for(const s of n)e+=`<td>${T(s)}</td>`;e+="</tr>"}return e+"</tbody></table>"}function K(t,e){return Array.isArray(t)?Array.isArray(t[0])?ce(t):re(t):I(t)}function ce(t){let e='<table class="mat"><tbody>';for(const n of t){e+="<tr>";for(const s of n)e+=`<td>${I(s)}</td>`;e+="</tr>"}return e+"</tbody></table>"}function re(t){return`{${t.map(I).join("; ")}}`}function C(t){let e="",n=t.replace(/≤/g,"≤").replace(/≥/g,"≥").replace(/·/g,"·").replace(/×/g,"×"),s=0;for(;s<n.length;){const o=n[s];if("∫∬∭∑∏ΣΠ".includes(o)){const i=o==="Σ"?"∑":o==="Π"?"∏":o,c=A(n,s+1,i);e+=c.html,s=c.end;continue}if(o==="∂"){const c=n.slice(s).match(/^∂([²³]?)\/∂([A-Za-z])\1/);if(c){const l=c[1],f=c[2],b=l?`∂${l}`:"∂",d=`∂${f}${l}`;e+=`<span class="dvc">${b}<span class="dvl"></span>${d}</span>`,s+=c[0].length;continue}e+="∂",s++;continue}if(o==="^"&&s>0){const i=z(n,s+1);if(i){e+=`<sup>${P(i.content)}</sup>`,s=i.end;continue}}if(o==="_"&&s>0){const i=z(n,s+1);if(i){e+=`<sub>${P(i.content)}</sub>`,s=i.end;continue}}e+=P(o),s++}return e}const Z={alpha:"α",beta:"β",gamma:"γ",delta:"δ",epsilon:"ε",zeta:"ζ",eta:"η",theta:"θ",iota:"ι",kappa:"κ",lambda:"λ",mu:"μ",nu:"ν",xi:"ξ",omicron:"ο",rho:"ρ",sigma:"σ",tau:"τ",upsilon:"υ",phi:"φ",chi:"χ",psi:"ψ",omega:"ω",Alpha:"Α",Beta:"Β",Gamma:"Γ",Delta:"Δ",Epsilon:"Ε",Zeta:"Ζ",Eta:"Η",Theta:"Θ",Lambda:"Λ",Xi:"Ξ",Sigma:"Σ",Phi:"Φ",Psi:"Ψ",Omega:"Ω"},le=new Set(["sin","cos","tan","cot","sec","csc","asin","acos","atan","acot","sinh","cosh","tanh","coth","ln","log","exp","sqrt","abs","sgn","sign","min","max","sum","prod","det","tr","rank","dim","ker","Im","Re"]);function M(t){let e="",n=0;const s=t.length;for(;n<s;){const o=t[n];if("∫∬∭∑∏".includes(o)){const i=A(t,n+1,o);e+=i.html,n=i.end;continue}if(o==="Σ"||o==="Π"){const i=o==="Σ"?"∑":"∏",c=A(t,n+1,i);e+=c.html,n=c.end;continue}if(o==="∂"){const c=t.slice(n).match(/^∂([²³⁴]?)\/∂([A-Za-z])([²³⁴]?)/);if(c){const l=c[1]||c[3],f=c[2],b=l?`∂${l}`:"∂",d=`∂${f}${l}`;e+=`<span class="dvc">${b}<span class="dvl"></span>${d}</span>`,n+=c[0].length;continue}e+="∂",n++;continue}if(o==="_"){const i=z(t,n+1);if(i){e+=`<sub>${M(i.content)}</sub>`,n=i.end;continue}}if(o==="^"){const i=z(t,n+1);if(i){e+=`<sup>${M(i.content)}</sup>`,n=i.end;continue}}if(o==="{"){const i=q(t,n);if(i>0&&i+1<s&&t[i+1]==="/"){const l=t.slice(n+1,i),f=i+2;if(f<s&&t[f]==="{"){const b=q(t,f);if(b>0){const d=t.slice(f+1,b);e+=`<span class="dvc">${M(l)}<span class="dvl"></span>${M(d)}</span>`,n=b+1;continue}}}const c=q(t,n);if(c>0){e+=M(t.slice(n+1,c)),n=c+1;continue}}if(o==="("){const i=Q(t,n);if(i>0&&i+1<s&&t[i+1]==="/"){const l=i+2;if(l<s&&t[l]==="("){const f=Q(t,l);if(f>0){const b=t.slice(n+1,i),d=t.slice(l+1,f);e+=`<span class="dvc">${M(b)}<span class="dvl"></span>${M(d)}</span>`,n=f+1;continue}}}const c=Q(t,n);if(c>0){e+=`(${M(t.slice(n+1,c))})`,n=c+1;continue}}if(o==="-"&&n+1<s&&t[n+1]===">"){e+="→",n+=2;continue}if(o===">"&&n+1<s&&t[n+1]==="="){e+="≥",n+=2;continue}if(o==="<"&&n+1<s&&t[n+1]==="="){e+="≤",n+=2;continue}if(o==="!"&&n+1<s&&t[n+1]==="="){e+="≠",n+=2;continue}if(o==="~"&&n+1<s&&t[n+1]==="="){e+="≈",n+=2;continue}if(/[A-Za-z]/.test(o)){let i="",c=n;for(;c<s&&/[A-Za-z0-9]/.test(t[c]);)i+=t[c],c++;if(i==="Int"||i==="int"){const l=A(t,c,"∫");e+=l.html,n=l.end;continue}if(i==="Sum"){const l=A(t,c,"∑");e+=l.html,n=l.end;continue}if(i==="Prod"){const l=A(t,c,"∏");e+=l.html,n=l.end;continue}if(i==="lim"){let l='<span style="font-style:normal;font-weight:bold;">lim</span>';if(c<s&&t[c]==="_"){const f=z(t,c+1);f&&(l=`<span class="dvr">${l}<small>${M(f.content)}</small></span>`,c=f.end)}e+=l,n=c;continue}if(i==="d"&&c<s&&t[c]==="/"){const l=t.slice(n).match(/^d([²³]?)\/d([A-Za-z])([²³]?)/);if(l){const f=l[1]||l[3],b=l[2],d=f?`d${f}`:"d",_=`d${b}${f}`;e+=`<span class="dvc">${d}<span class="dvl"></span>${_}</span>`,n+=l[0].length;continue}}if(Z[i]){e+=Z[i],n=c;continue}if(le.has(i)){e+=`<b>${i}</b>`,n=c;continue}if(i==="inf"||i==="infty"||i==="infinity"){e+="∞",n=c;continue}e+=`<var>${P(i)}</var>`,n=c;continue}if(/[0-9]/.test(o)){let i="",c=n;for(;c<s&&/[0-9.]/.test(t[c]);)i+=t[c],c++;e+=i,n=c;continue}if(/[\u2200-\u22FF\u2100-\u214F]/.test(o)){e+=o,n++;continue}if("+-=<>".includes(o)){e+=` ${P(o)} `,n++;continue}if(o==="·"){e+=" · ",n++;continue}if(o===" "){e+="&thinsp;",n++;continue}e+=P(o),n++}return e}function A(t,e,n){let s=e,o="",i="";for(let l=0;l<2;l++)if(s<t.length&&t[s]==="_"){const f=z(t,s+1);f&&(o=f.content,s=f.end)}else if(s<t.length&&t[s]==="^"){const f=z(t,s+1);f&&(i=f.content,s=f.end)}let c='<span class="dvr">';return i&&(c+=`<small>${M(i)}</small>`),c+=`<span class="nary">${n==="∫"||n==="∬"||n==="∭"?`<em>${n}</em>`:n}</span>`,o&&(c+=`<small>${M(o)}</small>`),c+="</span>",{html:c,end:s}}function z(t,e){if(e>=t.length)return null;if(t[e]==="{"){const n=q(t,e);return n>0?{content:t.slice(e+1,n),end:n+1}:null}return/[A-Za-z0-9α-ωΑ-Ω∞]/.test(t[e])?{content:t[e],end:e+1}:null}function q(t,e){let n=1;for(let s=e+1;s<t.length;s++)if(t[s]==="{"&&n++,t[s]==="}"&&(n--,n===0))return s;return-1}function Q(t,e){let n=1;for(let s=e+1;s<t.length;s++)if(t[s]==="("&&n++,t[s]===")"&&(n--,n===0))return s;return-1}const de=/^@\{(plot|plotly|svg|three|eq)\b\s*([^}]*)\}\s*$/i,ue=/^@\{end\s+(plot|plotly|svg|three|eq)\}\s*$/i;function F(t){var i;const e=new Y,n=t.split(`
`);let s="",o=0;for(;o<n.length;){const l=n[o].trim();if(!l){s+='<div class="spacer"></div>',o++;continue}const f=l.match(de);if(f){const d=f[1].toLowerCase(),_=((i=f[2])==null?void 0:i.trim())||"",x=[];for(o++;o<n.length;){const v=n[o].trim();if(ue.test(v)){o++;break}x.push(n[o]),o++}s+=he(d,x,_);continue}if(/^#for\s+/i.test(l)){const d=ye(n,o,e);s+=d.html,o=d.nextLine;continue}if(/^#if\s+/i.test(l)){const d=we(n,o,e);s+=d.html,o=d.nextLine;continue}if(/^#while\s+/i.test(l)){const d=ke(n,o,e);s+=d.html,o=d.nextLine;continue}if(/^#repeat\s*$/i.test(l)){const d=ve(n,o,e);s+=d.html,o=d.nextLine;continue}if(/^#{1,6}\s+/.test(l)&&!/^#(?:for|if|else|end|while|loop|repeat|until|next)\b/i.test(l)){const d=(l.match(/^#+/)||[""])[0].length,_=l.slice(d).trim();s+=`<h${Math.min(d,6)}>${C(_)}</h${Math.min(d,6)}>`,o++;continue}if(l.startsWith(">")){const d=l.slice(1).trim();s+=`<p class="comment">${C(d)}</p>`,o++;continue}if(/^@\{cells\}\s*\|/.test(l)){const _=l.replace(/^@\{cells\}\s*/,"").split("|").map(v=>v.trim()).filter(Boolean);let x='<div class="cells-row">';for(const v of _)x+=`<div class="cell">${X(v,e)}</div>`;x+="</div>",s+=x,o++;continue}if(l.startsWith("'")){const d=l.slice(1).trim();if(d.startsWith("#")){const _=(d.match(/^#+/)||[""])[0].length,x=d.slice(_).trim();s+=`<h${Math.min(_,6)}>${C(x)}</h${Math.min(_,6)}>`}else d.startsWith("---")?s+="<hr>":d.startsWith("- ")||d.startsWith("* ")?s+=`<li>${C(d.slice(2))}</li>`:s+=`<p class="comment">${C(d)}</p>`;o++;continue}const b=l.match(/^([A-Za-z_]\w*)\(([^)]*)\)\s*=\s*(.+)$/);if(b){const[,d,_,x]=b,v=_.split(",").map(p=>p.trim()).filter(Boolean);try{const p=G(x);e.userFunctions.set(d,{params:v,body:p}),s+=`<div class="line fn-def"><var>${d}</var>(${v.join(", ")}) = ${C(x)}</div>`}catch(p){s+=`<div class="line error">${l} → Error: ${p.message}</div>`}o++;continue}s+=X(l,e),o++}return{html:s,env:e}}function X(t,e){try{const n=G(t),s=W(n,e);if(n.type==="assign"){const o=K(s);let i=`<var>${n.name}</var>`;if(n.indices){const c=n.indices.map(l=>T(l)).join(",");i+=`<sub>${c}</sub>`}return`<div class="line assign">${i} = ${T(n.expr)} = ${o}</div>`}return`<div class="line expr">${T(n)} = ${K(s)}</div>`}catch(n){return`<div class="line error">${C(t)} <span class="err">← ${n.message}</span></div>`}}function he(t,e,n){switch(t){case"eq":return fe(e,n||"");case"plot":return pe(e);case"plotly":return me(e);case"svg":return _e(e);case"three":return be(e);default:return`<pre>${e.join(`
`)}</pre>`}}function fe(t,e){if(t.length===0)return"";let s=`<div class="eq-block" style="text-align:${/^(left|right|center)$/i.test(e)?e.toLowerCase():"center"};margin:8px 0;">`;for(const o of t){const i=o.trim();if(!i){s+='<div style="height:4px"></div>';continue}const c=i.match(/\((\d+(?:\.\d+)?[a-z]?)\)\s*$/);let l=i,f="";c&&(l=i.slice(0,c.index).trim(),f=c[1]),s+='<p class="eq" style="margin:4px 0;line-height:2.2;">',s+=M(l),f&&(s+=`<span style="float:right;font-style:normal;margin-left:24px">(${f})</span>`),s+="</p>"}return s+"</div>"}function pe(t){var v;let o=-5,i=5,c=-2,l=2;const f=[],b=[];for(const p of t){const u=p.trim();if(!u||u.startsWith("#")||u.startsWith("'"))continue;const y=u.match(/^x\s*=\s*([-\d.]+)\s*:\s*([-\d.]+)/);if(y){o=+y[1],i=+y[2];continue}const m=u.match(/^y\s*=\s*([-\d.]+)\s*:\s*([-\d.]+)/);if(m){c=+m[1],l=+m[2];continue}const E=u.match(/^y\s*=\s*(.+?)(\s*\|.*)?$/);if(E){const g=E[1].trim();let a="#2196f3",w=2,r="";if(E[2]){const h=E[2],$=h.match(/color:\s*(#[0-9A-Fa-f]{3,8}|\w+)/);$&&(a=$[1]);const k=h.match(/width:\s*(\d+)/);k&&(w=+k[1]);const R=h.match(/label:\s*"([^"]+)"/);R&&(r=R[1])}f.push({expr:g,color:a,width:w,label:r});continue}b.push(u)}const d=p=>50+(p-o)/(i-o)*500,_=p=>350-(p-c)/(l-c)*300;let x='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" style="max-width:600px;background:#fff;border:1px solid #ddd;">';x+='<g stroke="#e0e0e0" stroke-width="0.5">';for(let p=Math.ceil(o);p<=Math.floor(i);p++)x+=`<line x1="${d(p)}" y1="50" x2="${d(p)}" y2="350"/>`;for(let p=Math.ceil(c);p<=Math.floor(l);p++)x+=`<line x1="50" y1="${_(p)}" x2="550" y2="${_(p)}"/>`;x+="</g>",c<=0&&l>=0&&(x+=`<line x1="50" y1="${_(0)}" x2="550" y2="${_(0)}" stroke="#666" stroke-width="1"/>`),o<=0&&i>=0&&(x+=`<line x1="${d(0)}" y1="50" x2="${d(0)}" y2="350" stroke="#666" stroke-width="1"/>`),x+='<g font-size="10" fill="#888" text-anchor="middle">';for(let p=Math.ceil(o);p<=Math.floor(i);p++)p!==0&&(x+=`<text x="${d(p)}" y="365">${p}</text>`);for(let p=Math.ceil(c);p<=Math.floor(l);p++)p!==0&&(x+=`<text x="40" y="${_(p)+4}" text-anchor="end">${p}</text>`);x+="</g>";for(const p of f){const u=new Y,y=300,m=[];for(let E=0;E<=y;E++){const g=o+(i-o)*E/y;u.setVar("x",g);try{const a=G(p.expr),w=W(a,u);isFinite(w)&&w>=c-10&&w<=l+10&&m.push(`${d(g).toFixed(1)},${_(w).toFixed(1)}`)}catch{}}m.length>1&&(x+=`<polyline points="${m.join(" ")}" fill="none" stroke="${p.color}" stroke-width="${p.width}"/>`),p.label&&(x+=`<text x="545" y="${_(0)-5}" fill="${p.color}" font-size="12" text-anchor="end">${p.label}</text>`)}for(const p of b){const u=p.split(/\s+/),y=u[0];if(y==="rect"&&u.length>=5){const[,m,E,g,a]=u.map(Number),w=u[5]||"#e3f2fd",r=Math.min(d(m),d(g)),h=Math.min(_(E),_(a)),$=Math.abs(d(g)-d(m)),k=Math.abs(_(a)-_(E));x+=`<rect x="${r}" y="${h}" width="${$}" height="${k}" fill="${w}" opacity="0.3"/>`}else if(y==="point"&&u.length>=3){const m=+u[1],E=+u[2],g=u[3]||"#f44336",a=+(u[4]||"4");x+=`<circle cx="${d(m)}" cy="${_(E)}" r="${a}" fill="${g}"/>`}else if(y==="text"&&u.length>=4){const m=+u[1],E=+u[2],g=p.match(/"([^"]+)"/),a=g?g[1]:u.slice(3).join(" "),w=(v=u[u.length-1])!=null&&v.startsWith("#")?u[u.length-1]:"#333";x+=`<text x="${d(m)}" y="${_(E)}" fill="${w}" font-size="12">${a}</text>`}else if(y==="eq"&&u.length>=4){const m=+u[1],E=+u[2],g=p.match(/"([^"]+)"/),a=g?g[1]:u.slice(3).join(" ");x+=`<text x="${d(m)}" y="${_(E)}" fill="#333" font-size="13" font-style="italic">${a}</text>`}else if(y==="line"&&u.length>=5){const[,m,E,g,a]=u.map(Number),w=u[5]||"#333",r=u[6]||"1";x+=`<line x1="${d(m)}" y1="${_(E)}" x2="${d(g)}" y2="${_(a)}" stroke="${w}" stroke-width="${r}"/>`}else if(y==="arrow"&&u.length>=5){const[,m,E,g,a]=u.map(Number),w=u[5]||"#333",r=`arr${Math.random().toString(36).slice(2,6)}`;x+=`<defs><marker id="${r}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="${w}"/></marker></defs>`,x+=`<line x1="${d(m)}" y1="${_(E)}" x2="${d(g)}" y2="${_(a)}" stroke="${w}" stroke-width="1.5" marker-end="url(#${r})"/>`}else if(y==="proj"&&u.length>=3){const m=+u[1],E=+u[2],g=u[3]||"#999";x+=`<line x1="${d(m)}" y1="${_(E)}" x2="${d(m)}" y2="${_(0)}" stroke="${g}" stroke-width="0.8" stroke-dasharray="4,3"/>`,x+=`<line x1="${d(m)}" y1="${_(E)}" x2="${d(0)}" y2="${_(E)}" stroke="${g}" stroke-width="0.8" stroke-dasharray="4,3"/>`}else if(y==="hline"&&u.length>=2){const m=+u[1],E=u[2]||"#999";x+=`<line x1="50" y1="${_(m)}" x2="550" y2="${_(m)}" stroke="${E}" stroke-width="0.8" stroke-dasharray="5,3"/>`}else if(y==="vline"&&u.length>=2){const m=+u[1],E=u[2]||"#999";x+=`<line x1="${d(m)}" y1="50" x2="${d(m)}" y2="350" stroke="${E}" stroke-width="0.8" stroke-dasharray="5,3"/>`}else if(y==="dim"&&u.length>=5){const[,m,E,g,a]=u.map(Number),w=p.match(/"([^"]+)"/),r=w?w[1]:"",h=(d(m)+d(g))/2,$=(_(E)+_(a))/2;x+=`<line x1="${d(m)}" y1="${_(E)}" x2="${d(g)}" y2="${_(a)}" stroke="#666" stroke-width="1"/>`,x+=`<text x="${h}" y="${$-5}" fill="#666" font-size="11" text-anchor="middle">${r}</text>`}}return x+="</svg>",`<div class="plot-container">${x}</div>`}function me(t){const e=`plotly_${Math.random().toString(36).slice(2,8)}`,n=t.join(`
`);return`<div id="${e}" style="width:100%;height:400px;"></div>
<script>if(window.Plotly){(function(){${n};Plotly.newPlot("${e}",data,layout||{})})()}else{document.getElementById("${e}").textContent="Plotly not loaded"}<\/script>`}function _e(t){return`<div class="svg-container">${t.join(`
`)}</div>`}const $e=new Set(["box","sphere","cylinder","cone","torus","plane","line","arrow","darrow","plate","slab","tube","pipe","node","carc3d","dim3d","axes","axeslabeled","axes_labeled","gridhelper","color","opacity","wireframe","metalness","roughness","reset","camera","background","light"]);function xe(t){const e=[],n={};let s=null;for(let o=1;o<t.length;o++){const i=t[o];if(i.includes(":")){const c=i.indexOf(":");n[i.slice(0,c).toLowerCase()]=i.slice(c+1)}else{const c=parseFloat(i);isNaN(c)?s===null&&(s=i):e.push(c)}}return{pos:e,kv:n,text:s}}function Ee(t){const e=[];let n=0;for(;n<t.length;){if(t[n]===" "||t[n]==="	"){n++;continue}if(t[n]==='"'||t[n]==="'"){const s=t[n];let o=n+1;for(;o<t.length&&t[o]!==s;)o++;e.push(t.slice(n+1,o)),n=o+1}else{let s=n;for(;s<t.length&&t[s]!==" "&&t[s]!=="	";)s++;e.push(t.slice(n,s)),n=s}}return e}function O(t){return t?t.startsWith("#")?"0x"+t.slice(1):{red:"0xff0000",green:"0x00ff00",blue:"0x0000ff",white:"0xffffff",black:"0x000000",yellow:"0xffff00",cyan:"0x00ffff",magenta:"0xff00ff",orange:"0xff8800",gray:"0x888888",grey:"0x888888",brown:"0x8b4513",pink:"0xff69b4",purple:"0x800080"}[t.toLowerCase()]||"0x4488ff":"0x4488ff"}function ge(t){const e=[];let n="#4488ff",s="1",o="false",i="0.1",c="0.5",l=0;const f=u=>O(u.color||n),b=u=>u.opacity||s,d=u=>u.wireframe||o,_=u=>u.metalness||i,x=u=>u.roughness||c,v=(u,y)=>{const m=y||f(u),E=b(u),g=d(u),a=parseFloat(E)<1?",transparent:true":"";return`new THREE.MeshStandardMaterial({color:${m},opacity:${E},wireframe:${g},metalness:${_(u)},roughness:${x(u)}${a}})`},p=(u,y,m,E)=>{const g=`_m${l++}`;if(e.push(`{const ${g}=new THREE.Mesh(${u},${v(y)});`),m.length>=3&&e.push(`${g}.position.set(${m[0]},${m[1]},${m[2]});`),E){const[a,w,r]=E.split(",").map(Number);e.push(`${g}.rotation.set(${(a||0)*Math.PI/180},${(w||0)*Math.PI/180},${(r||0)*Math.PI/180});`)}e.push(`scene.add(${g});}`)};for(const u of t){const y=u.trim();if(!y||y.startsWith("//"))continue;const m=Ee(y);if(m.length===0)continue;const E=m[0].toLowerCase();if(!$e.has(E)){e.push(y);continue}const{pos:g,kv:a,text:w}=xe(m),r=h=>h<g.length?g[h]:0;switch(E){case"color":n=m[1]||"#4488ff";break;case"opacity":s=m[1]||"1";break;case"wireframe":o=m[1]||"true";break;case"metalness":i=m[1]||"0.1";break;case"roughness":c=m[1]||"0.5";break;case"reset":n="#4488ff",s="1",o="false",i="0.1",c="0.5";break;case"camera":{if(g.length>=3&&e.push(`camera.position.set(${r(0)},${r(1)},${r(2)});`),a.lookat){const[h,$,k]=a.lookat.split(",").map(Number);e.push(`camera.lookAt(${h||0},${$||0},${k||0});`)}a.fov&&e.push(`camera.fov=${a.fov};camera.updateProjectionMatrix();`);break}case"background":e.push(`scene.background=new THREE.Color(${O(m[1]||"#f5f5f5")});`);break;case"light":{const h=O(a.color||"#ffffff"),$=a.intensity||"0.8";g.length>=3?e.push(`{const _l=new THREE.DirectionalLight(${h},${$});_l.position.set(${r(0)},${r(1)},${r(2)});scene.add(_l);}`):e.push(`{const _l=new THREE.DirectionalLight(${h},${$});_l.position.set(5,10,7);scene.add(_l);}`);break}case"gridhelper":{const h=a.size||"10",$=a.divisions||"10";e.push(`scene.add(new THREE.GridHelper(${h},${$}));`);break}case"box":{const h=a.size?a.size.split(",").map(Number):[1,1,1];p(`new THREE.BoxGeometry(${h[0]||1},${h[1]||1},${h[2]||1})`,a,[r(0),r(1),r(2)],a.rotation);break}case"sphere":{const h=a.r||a.radius||"0.5",$=a.segments||"32";p(`new THREE.SphereGeometry(${h},${$},${$})`,a,[r(0),r(1),r(2)]);break}case"cylinder":{const h=a.rtop||a.r||"0.5",$=a.rbottom||a.r||"0.5",k=a.h||a.height||"1",R=a.segments||"32";p(`new THREE.CylinderGeometry(${h},${$},${k},${R})`,a,[r(0),r(1),r(2)],a.rotation);break}case"cone":{const h=a.r||a.radius||"0.5",$=a.h||a.height||"1";p(`new THREE.ConeGeometry(${h},${$},32)`,a,[r(0),r(1),r(2)],a.rotation);break}case"torus":{const h=a.r||"1",$=a.tube||"0.3";p(`new THREE.TorusGeometry(${h},${$},16,48)`,a,[r(0),r(1),r(2)],a.rotation);break}case"plane":{const h=a.width||a.w||"5",$=a.height||a.h||"5";p(`new THREE.PlaneGeometry(${h},${$})`,a,[r(0),r(1),r(2)],a.rotation||"-90,0,0");break}case"plate":case"slab":{const h=a.w||a.width||"2",$=a.d||a.depth||"2",k=a.t||a.thickness||"0.2";p(`new THREE.BoxGeometry(${h},${k},${$})`,a,[r(0),r(1),r(2)],a.rotation);break}case"line":{const h=f(a),$=a.width||"2";e.push(`{const _pts=[new THREE.Vector3(${r(0)},${r(1)},${r(2)}),new THREE.Vector3(${r(3)},${r(4)},${r(5)})];`),e.push("const _g=new THREE.BufferGeometry().setFromPoints(_pts);"),e.push(`const _l=new THREE.Line(_g,new THREE.LineBasicMaterial({color:${h},linewidth:${$}}));scene.add(_l);}`);break}case"arrow":{const h=f(a),$=a.length,k=r(3)-r(0),R=r(4)-r(1),L=r(5)-r(2),S=$||`Math.sqrt(${k*k+R*R+L*L})`;e.push(`{const _dir=new THREE.Vector3(${k},${R},${L}).normalize();`),e.push(`const _a=new THREE.ArrowHelper(_dir,new THREE.Vector3(${r(0)},${r(1)},${r(2)}),${S},${h});scene.add(_a);}`);break}case"darrow":{const h=f(a),$=r(3)-r(0),k=r(4)-r(1),R=r(5)-r(2),L=`Math.sqrt(${$}*${$}+${k}*${k}+${R}*${R})`;e.push(`{const _d=new THREE.Vector3(${$},${k},${R}).normalize();`),e.push(`const _a1=new THREE.ArrowHelper(_d,new THREE.Vector3(${r(0)},${r(1)},${r(2)}),${L},${h},${L}*0.12,${L}*0.06);scene.add(_a1);`),e.push(`const _a2=new THREE.ArrowHelper(_d.clone().negate(),new THREE.Vector3(${r(3)},${r(4)},${r(5)}),${L},${h},${L}*0.12,${L}*0.06);scene.add(_a2);}`);break}case"tube":case"pipe":{const h=a.r||a.radius||"0.05",$=a.segments||"8";e.push(`{const _p=new THREE.LineCurve3(new THREE.Vector3(${r(0)},${r(1)},${r(2)}),new THREE.Vector3(${r(3)},${r(4)},${r(5)}));`),e.push(`const _g=new THREE.TubeGeometry(_p,1,${h},${$},false);`),e.push(`const _m=new THREE.Mesh(_g,${v(a)});scene.add(_m);}`);break}case"node":{const h=a.r||"0.1",$=w||a.label||"";if(e.push(`{const _g=new THREE.SphereGeometry(${h},16,16);`),e.push(`const _m=new THREE.Mesh(_g,${v(a,O(a.color||"white"))});`),e.push(`_m.position.set(${r(0)},${r(1)},${r(2)});scene.add(_m);`),$){const k=a.size||"48";e.push('const _c=document.createElement("canvas");_c.width=128;_c.height=64;'),e.push('const _cx=_c.getContext("2d");_cx.fillStyle="white";_cx.fillRect(0,0,128,64);'),e.push('_cx.strokeStyle="black";_cx.strokeRect(0,0,128,64);'),e.push(`_cx.font="bold ${k}px sans-serif";_cx.fillStyle="black";_cx.textAlign="center";_cx.textBaseline="middle";`),e.push(`_cx.fillText("${$}",64,32);`),e.push("const _t=new THREE.CanvasTexture(_c);const _sm=new THREE.SpriteMaterial({map:_t});"),e.push(`const _s=new THREE.Sprite(_sm);_s.position.set(${r(0)},${r(1)}+${parseFloat(h)*2},${r(2)});_s.scale.set(0.5,0.25,1);scene.add(_s);`)}e.push("}");break}case"axes":case"axeslabeled":case"axes_labeled":{const h=a.length||a.l||"3";if(e.push(`{const _ax=new THREE.AxesHelper(${h});`),g.length>=3&&e.push(`_ax.position.set(${r(0)},${r(1)},${r(2)});`),e.push("scene.add(_ax);"),E!=="axes"){const $=(k,R,L,S,j)=>{e.push('{const _c=document.createElement("canvas");_c.width=64;_c.height=64;'),e.push(`const _x=_c.getContext("2d");_x.font="bold 48px sans-serif";_x.fillStyle="${j}";_x.textAlign="center";_x.textBaseline="middle";_x.fillText("${k}",32,32);`),e.push("const _s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(_c)}));"),e.push(`_s.position.set(${R},${L},${S});_s.scale.set(0.4,0.4,1);scene.add(_s);}`)};$(a.xlabel||"X",`${h}*1.1`,"0","0","red"),$(a.ylabel||"Y","0",`${h}*1.1`,"0","green"),$(a.zlabel||"Z","0","0",`${h}*1.1`,"blue")}e.push("}");break}case"carc3d":{const h=a.r||"1",$=parseFloat(a.start||"0"),k=parseFloat(a.end||"270"),R=f(a),L=$*Math.PI/180,S=k*Math.PI/180,j=a.segments||"64";e.push("{const _pts=[];"),e.push(`for(let i=0;i<=${j};i++){const a=${L}+(${S}-${L})*i/${j};_pts.push(new THREE.Vector3(${h}*Math.cos(a)+${r(0)},${r(1)},${h}*Math.sin(a)+${r(2)}));}`),e.push("const _g=new THREE.BufferGeometry().setFromPoints(_pts);"),e.push(`scene.add(new THREE.Line(_g,new THREE.LineBasicMaterial({color:${R}})));`);const ne=a.headlength||"0.15",se=a.headradius||"0.06";e.push(`const _ea=${S};const _ex=${h}*Math.cos(_ea)+${r(0)},_ez=${h}*Math.sin(_ea)+${r(2)};`),e.push(`const _cg=new THREE.ConeGeometry(${se},${ne},12);`),e.push(`const _cm=new THREE.Mesh(_cg,new THREE.MeshStandardMaterial({color:${R}}));`),e.push(`_cm.position.set(_ex,${r(1)},_ez);`),e.push("_cm.rotation.z=Math.PI/2;_cm.rotation.y=-_ea-Math.PI/2;scene.add(_cm);}");break}case"dim3d":{const h=f(a),$=w||a.text||"";e.push(`{const _p1=new THREE.Vector3(${r(0)},${r(1)},${r(2)}),_p2=new THREE.Vector3(${r(3)},${r(4)},${r(5)});`),e.push("const _g=new THREE.BufferGeometry().setFromPoints([_p1,_p2]);"),e.push(`scene.add(new THREE.Line(_g,new THREE.LineBasicMaterial({color:${h}})));`),e.push("const _d=_p2.clone().sub(_p1);const _l=_d.length();const _dn=_d.normalize();"),e.push(`scene.add(new THREE.ArrowHelper(_dn,_p1,_l,${h},_l*0.08,_l*0.04));`),$&&(e.push("const _mid=_p1.clone().add(_p2).multiplyScalar(0.5);"),e.push('const _c=document.createElement("canvas");_c.width=256;_c.height=64;'),e.push('const _x=_c.getContext("2d");_x.fillStyle="white";_x.fillRect(0,0,256,64);'),e.push('_x.font="bold 32px sans-serif";_x.fillStyle="black";_x.textAlign="center";_x.textBaseline="middle";'),e.push(`_x.fillText("${$}",128,32);`),e.push("const _s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(_c)}));"),e.push("_s.position.copy(_mid);_s.position.y+=0.2;_s.scale.set(1,0.25,1);scene.add(_s);")),e.push("}");break}default:e.push(y);break}}return e.join(`
`)}function be(t){const e=`three_${Math.random().toString(36).slice(2,8)}`,n=ge(t);return`<div id="${e}" style="width:100%;height:400px;border:1px solid #ddd;"></div>
<script type="module">
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import {OrbitControls} from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/OrbitControls.js';
(function(){const container=document.getElementById("${e}");
const scene=new THREE.Scene();scene.background=new THREE.Color(0xf5f5f5);
const camera=new THREE.PerspectiveCamera(50,container.clientWidth/container.clientHeight,0.1,1000);
camera.position.set(5,5,5);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(container.clientWidth,container.clientHeight);
container.appendChild(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);
scene.add(new THREE.AmbientLight(0x404040));
const dirLight=new THREE.DirectionalLight(0xffffff,0.8);dirLight.position.set(5,10,7);scene.add(dirLight);
${n}
function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);}animate();
})();<\/script>`}function ye(t,e,n){const s=t[e].trim(),o=s.match(/^#for\s+(\w+)\s*=\s*(.*?)\s+to\s+(.*?)(?:\s*:\s*(.+))?\s*$/i);if(!o)return{html:`<div class="error">Invalid #for: ${s}</div>`,nextLine:e+1};const i=o[1],c=D(o[2],n),l=D(o[3],n),f=o[4]?D(o[4],n):1,b=[];let d=e+1,_=1;for(;d<t.length;){const v=t[d].trim();if(/^#for\s+/i.test(v)&&_++,/^#next\s*$/i.test(v)&&(_--,_===0)){d++;break}b.push(t[d]),d++}let x="";for(let v=c;f>0?v<=l:v>=l;v+=f){n.setVar(i,v);const p=F(b.join(`
`));x+=p.html}return{html:x,nextLine:d}}function we(t,e,n){const s=[];let o={cond:t[e].trim().replace(/^#if\s+/i,""),body:[]},i=e+1,c=1;for(;i<t.length;){const l=t[i].trim();if(/^#if\s+/i.test(l)){c++,o.body.push(t[i]),i++;continue}if(/^#end\s+if\s*$/i.test(l)){if(c--,c===0){s.push(o),i++;break}o.body.push(t[i]),i++;continue}if(c===1&&/^#else\s+if\s+/i.test(l)){s.push(o),o={cond:l.replace(/^#else\s+if\s+/i,""),body:[]},i++;continue}if(c===1&&/^#else\s*$/i.test(l)){s.push(o),o={cond:null,body:[]},i++;continue}o.body.push(t[i]),i++}for(const l of s)if(l.cond===null||D(l.cond,n))return{html:F(l.body.join(`
`)).html,nextLine:i};return{html:"",nextLine:i}}function ke(t,e,n){const s=t[e].trim().replace(/^#while\s+/i,""),o=[];let i=e+1,c=1;for(;i<t.length;){const b=t[i].trim();if(/^#while\s+/i.test(b)&&c++,/^#loop\s*$/i.test(b)&&(c--,c===0)){i++;break}o.push(t[i]),i++}let l="",f=0;for(;D(s,n)&&f<1e4;){const b=F(o.join(`
`));l+=b.html,f++}return{html:l,nextLine:i}}function ve(t,e,n){const s=[];let o=e+1,i="",c=1;for(;o<t.length;){const b=t[o].trim();if(/^#repeat\s*$/i.test(b)&&c++,/^#until\s+/i.test(b)&&(c--,c===0)){i=b.replace(/^#until\s+/i,""),o++;break}s.push(t[o]),o++}let l="",f=0;do{const b=F(s.join(`
`));l+=b.html,f++}while(!D(i,n)&&f<1e4);return{html:l,nextLine:o}}function D(t,e){try{const n=G(t),s=W(n,e);return typeof s=="number"?s:NaN}catch{return 0}}const Re=`# Ejemplo 5.1 - Analisis de Grid Frame
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
`,Te=`'# Calculo Basico
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
A = pi*r^2`,Le=`'# Grafico con anotaciones
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
@{end plot}`,Me=`'# Ecuaciones Formateadas
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
@{end eq}`,He=`'# FEM Assembly - Ensamblaje de Rigidez
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
u3 = F3/k`,Pe=`'# Operaciones con Vectores
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
sz = v1z + 5`,Ce=`'# Operaciones con Matrices
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
inv22 = a11/det2`,ze=`'# Control de Flujo
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
#next`,Se=`'# Escena 3D con Three.js
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
@{end three}`,Ae=`'# Dibujo SVG
@{svg}
<svg viewBox="0 0 400 300" style="max-width:400px;background:#fff;border:1px solid #ddd;">
  <rect x="50" y="50" width="300" height="200" fill="none" stroke="#333" stroke-width="2"/>
  <circle cx="200" cy="150" r="60" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <line x1="50" y1="150" x2="350" y2="150" stroke="#999" stroke-dasharray="5,3"/>
  <line x1="200" y1="50" x2="200" y2="250" stroke="#999" stroke-dasharray="5,3"/>
  <text x="200" y="30" text-anchor="middle" font-size="14" fill="#333">Dibujo SVG</text>
</svg>
@{end svg}`,De=`'# Calculo Simbolico (CAS)
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
' laplace(sin(t), t, s)     - Laplace`,U={calculo:{name:"Calculo Basico",code:Te},plot:{name:"@{plot} Graficos SVG",code:Le},eq_demo:{name:"@{eq} Ecuaciones",code:Me},fem_assembly:{name:"FEM Assembly",code:He},vectores:{name:"Vectores",code:Pe},matrices:{name:"Matrices",code:Ce},control_flow:{name:"Control de Flujo",code:ze},three:{name:"@{three} 3D",code:Se},svg:{name:"@{svg} Dibujo",code:Ae},cas:{name:"CAS Simbolico (info)",code:De},grid_frame:{name:"Grid Frame (Paz 5.1)",code:Re}},H=document.getElementById("codeInput"),N=document.getElementById("output"),V=document.getElementById("btnRun"),B=document.getElementById("statusText"),ee=document.getElementById("exampleList");for(const[t,e]of Object.entries(U)){const n=document.createElement("li");n.textContent=e.name,n.dataset.key=t,n.addEventListener("click",()=>{H.value=e.code,document.querySelectorAll(".example-list li").forEach(s=>s.classList.remove("active")),n.classList.add("active")}),ee.appendChild(n)}function te(){const t=H.value;if(!t.trim()){N.innerHTML="";return}B.textContent="Procesando...",V.disabled=!0;try{const e=F(t);N.innerHTML=e.html,B.textContent="Listo"}catch(e){N.innerHTML=`<div class="line error">Error: ${e.message}</div>`,B.textContent="Error"}V.disabled=!1}V.addEventListener("click",te);H.addEventListener("keydown",t=>{if(t.key==="Enter"&&(t.ctrlKey||t.metaKey)&&(t.preventDefault(),te()),t.key==="Tab"){t.preventDefault();const e=H.selectionStart,n=H.selectionEnd;H.value=H.value.substring(0,e)+"  "+H.value.substring(n),H.selectionStart=H.selectionEnd=e+2}});H.value=U.calculo.code;const J=ee.querySelector("li");J&&J.classList.add("active");B.textContent="Listo — Ctrl+Enter para ejecutar";
