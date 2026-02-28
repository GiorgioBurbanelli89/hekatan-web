import"./modulepreload-polyfill-B5Qt9EMX.js";import{r as W,p as re,H as He,e as J,a as ye,b as Ee,c as C,d as de,f as Ne}from"./renderer-DEM0Jgf-.js";const Qe=/^@\{(plot|plotly|svg|three|eq)\b\s*([^}]*)\}\s*$/i,Ke=/^@\{end\s+(plot|plotly|svg|three|eq)\}\s*$/i;function X(e,t,n){var f;const i=t??new He,o=e.split(`
`);let r="",a=0;for(;a<o.length;){let u=o[a].trim();if(!u){r+='<div class="spacer"></div>',a++;continue}if(u.startsWith("//")){a++;continue}if(u.includes("//")&&(u=u.slice(0,u.indexOf("//")).trim(),!u)){a++;continue}if(/^@\{hide\}\s*$/i.test(u)){const b=[];for(a++;a<o.length;){const w=o[a].trim();if(/^@\{show\}\s*$/i.test(w)){a++;break}b.push(o[a]),a++}X(b.join(`
`),i);continue}const y=u.match(Qe);if(y){const b=y[1].toLowerCase(),w=((f=y[2])==null?void 0:f.trim())||"",g=[];for(a++;a<o.length;){const m=o[a].trim();if(Ke.test(m)){a++;break}g.push(o[a]),a++}r+=Ue(b,g,w,i);continue}if(/^#?for\s+/i.test(u)){const b=lt(o,a,i);r+=b.html,a=b.nextLine;continue}if(/^#?if\s+/i.test(u)){const b=rt(o,a,i);r+=b.html,a=b.nextLine;continue}if(/^#?while\s+/i.test(u)){const b=at(o,a,i);r+=b.html,a=b.nextLine;continue}if(/^#?repeat\s*$/i.test(u)){const b=ct(o,a,i);r+=b.html,a=b.nextLine;continue}if(/^#{1,6}\s+/.test(u)&&!/^#(?:for|if|else|end|while|loop|repeat|until|next)\b/i.test(u)){const b=(u.match(/^#+/)||[""])[0].length,w=u.slice(b).trim();r+=`<h${Math.min(b,6)}>${W(w)}</h${Math.min(b,6)}>`,a++;continue}if(u.startsWith(">")){const b=u.slice(1).trim();r+=`<p class="comment">${W(b)}</p>`,a++;continue}if(/^@\{cells\}\s*\|/.test(u)){const w=u.replace(/^@\{cells\}\s*/,"").split("|").map(m=>m.trim()).filter(Boolean);let g='<div class="cells-row">';for(const m of w)g+=`<div class="cell">${we(m,i)}</div>`;g+="</div>",r+=g,a++;continue}if(u.startsWith("'")){const b=u.slice(1).trim();if(b.startsWith("#")){const w=(b.match(/^#+/)||[""])[0].length,g=b.slice(w).trim();r+=`<h${Math.min(w,6)}>${W(g)}</h${Math.min(w,6)}>`}else b.startsWith("---")?r+="<hr>":b.startsWith("- ")||b.startsWith("* ")?r+=`<li>${W(b.slice(2))}</li>`:r+=`<p class="comment">${W(b)}</p>`;a++;continue}const k=u.match(/^([A-Za-z_]\w*)\(([^)]*)\)\s*=\s*(.+)$/);if(k){const[,b,w,g]=k,m=w.split(",").map(M=>M.trim()).filter(Boolean);try{const M=re(g);i.userFunctions.set(b,{params:m,body:M}),r+=`<div class="line fn-def"><var>${b}</var>(${m.join(", ")}) = ${W(g)}</div>`}catch(M){r+=`<div class="line error">${u} → Error: ${M.message}</div>`}a++;continue}r+=we(u,i,n),a++}return{html:r,env:i}}function Xe(e,t){const n=e.name,i=e.args;if(!i||i.length<3)return null;const o=i[0],r=o.type==="var"?o.name:null;if(!r)return null;const a=t.userFunctions.get(r);if(!a)return null;const f=C(a.body),p=a.params,u=(y,k)=>`<span class="dvr"><small>${k}</small><span class="nary"><em>∫</em></span><small>${y}</small></span>`;if(/^(integral|integrate)$/.test(n)&&i.length>=3){const y=C(i[1]),k=C(i[2]),b=p[0]||"x";return`${u(y,k)} (${f}) <i>d${b}</i>`}if(/^(integral2|integrate2|dblintegral)$/.test(n)&&i.length>=5){const y=C(i[1]),k=C(i[2]),b=C(i[3]),w=C(i[4]),g=p[0]||"x",m=p[1]||"y";return`${u(y,k)} ${u(b,w)} (${f}) <i>d${m}</i> <i>d${g}</i>`}if(/^(integral3|integrate3|tplintegral)$/.test(n)&&i.length>=7){const y=C(i[1]),k=C(i[2]),b=C(i[3]),w=C(i[4]),g=C(i[5]),m=C(i[6]),M=p[0]||"x",$=p[1]||"y",A=p[2]||"z";return`${u(y,k)} ${u(b,w)} ${u(g,m)} (${f}) <i>d${A}</i> <i>d${$}</i> <i>d${M}</i>`}return null}function we(e,t,n){var i;try{const o=re(e);if(o.type==="call"&&(o.name==="row"||o.name==="col")&&o.args.length===1){const a=o.args[0],f=J(a,t),p=o.name==="row"?ye(f):Ee(f);return n?`<div class="line expr">${p}</div>`:`<div class="line expr">${C(a)} = ${p}</div>`}if(o.type==="assign"&&o.expr.type==="call"&&(o.expr.name==="row"||o.expr.name==="col")&&((i=o.expr.args)==null?void 0:i.length)===1){const a=o.expr,f=a.args[0],p=J(f,t);t.setVar(o.name,p);const u=a.name==="row"?ye(p):Ee(p),y=`<var>${o.name}</var>`;return n?`<div class="line assign">${y} = ${u}</div>`:`<div class="line assign">${y} = ${C(f)} = ${u}</div>`}const r=J(o,t);if(o.type==="assign"){const a=de(r);let f=`<var>${o.name}</var>`;if(o.indices){const u=o.indices.map(y=>C(y)).join(",");f+=`<sub>${u}</sub>`}if(n)return`<div class="line assign">${f} = ${a}</div>`;const p=o.expr;if(p.type==="call"&&/^(integral[23]?|integrate[23]?|dblintegral|tplintegral)$/.test(p.name)){const u=Xe(p,t);return u?`<div class="line assign eq">${f} = ${u} = ${a}</div>`:`<div class="line assign">${f} = ${a}</div>`}return`<div class="line assign">${f} = ${C(o.expr)} = ${a}</div>`}return n?`<div class="line expr">${de(r)}</div>`:`<div class="line expr">${C(o)} = ${de(r)}</div>`}catch(o){return`<div class="line error">${W(e)} <span class="err">← ${o.message}</span></div>`}}function Ue(e,t,n,i){switch(e){case"eq":return Ye(t,n||"");case"plot":return Je(t,i);case"plotly":return Ze(t);case"svg":return et(t);case"three":return it(t);default:return`<pre>${t.join(`
`)}</pre>`}}function Ye(e,t){if(e.length===0)return"";let i=`<div class="eq-block" style="text-align:${/^(left|right|center)$/i.test(t)?t.toLowerCase():"center"};margin:8px 0;">`;for(const o of e){const r=o.trim();if(!r){i+='<div style="height:4px"></div>';continue}const a=r.match(/\((\d+(?:\.\d+)?[a-z]?)\)\s*$/);let f=r,p="";a&&(f=r.slice(0,a.index).trim(),p=a[1]),i+='<p class="eq" style="margin:4px 0;line-height:2.2;">',i+=Ne(f),p&&(i+=`<span style="float:right;font-style:normal;margin-left:24px">(${p})</span>`),i+="</p>"}return i+"</div>"}function ke(e){e=Math.max(0,Math.min(1,e));let t,n,i;return e<.25?(t=0,n=Math.round(255*e*4),i=255):e<.5?(t=0,n=255,i=Math.round(255*(1-(e-.25)*4))):e<.75?(t=Math.round(255*(e-.5)*4),n=255,i=0):(t=255,n=Math.round(255*(1-(e-.75)*4)),i=0),`rgb(${t},${n},${i})`}function Je(e,t){var A;let r=-5,a=5,f=-2,p=2;const u=[],y=[];let k="",b="",w=!1;for(const x of e){const s=x.trim();if(!s||s.startsWith("#")||s.startsWith("'"))continue;const T=s.match(/^x\s*=\s*([-\d.]+)\s*:\s*([-\d.]+)/);if(T){r=+T[1],a=+T[2];continue}const l=s.match(/^y\s*=\s*([-\d.]+)\s*:\s*([-\d.]+)/);if(l){f=+l[1],p=+l[2];continue}const c=s.match(/^heatmap\s+(\w+)\s*$/i);if(c){k=c[1];continue}const h=s.match(/^colorbar\s+"([^"]+)"/i);if(h){b=h[1];continue}if(/^mesh\s*$/i.test(s)){w=!0;continue}const _=s.match(/^y\s*=\s*(.+?)(\s*\|.*)?$/);if(_){const E=_[1].trim();let v="#2196f3",L=2,R="";if(_[2]){const S=_[2],I=S.match(/color:\s*(#[0-9A-Fa-f]{3,8}|\w+)/);I&&(v=I[1]);const Y=S.match(/width:\s*(\d+)/);Y&&(L=+Y[1]);const O=S.match(/label:\s*"([^"]+)"/);O&&(R=O[1])}u.push({expr:E,color:v,width:L,label:R});continue}y.push(s)}const g=x=>50+(x-r)/(a-r)*500,m=x=>350-(x-f)/(p-f)*300,M=b?650:600;let $=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${M} 400" style="max-width:${M}px;background:#fff;border:1px solid #ddd;">`;$+='<g stroke="#e0e0e0" stroke-width="0.5">';for(let x=Math.ceil(r);x<=Math.floor(a);x++)$+=`<line x1="${g(x)}" y1="50" x2="${g(x)}" y2="350"/>`;for(let x=Math.ceil(f);x<=Math.floor(p);x++)$+=`<line x1="50" y1="${m(x)}" x2="550" y2="${m(x)}"/>`;if($+="</g>",k&&t){const x=t.getVar(k);if(x!==void 0&&Array.isArray(x)){let s=null;if(Array.isArray(x[0])?s=x:s=[x],s){const T=s.length,l=s[0].length;let c=1/0,h=-1/0;for(const L of s)for(const R of L)R<c&&(c=R),R>h&&(h=R);const _=(a-r)/l,E=(p-f)/T,v=L=>L.toFixed(2).replace(/\.?0+$/,"")||"0";for(let L=0;L<T;L++)for(let R=0;R<l;R++){const S=s[L][R],I=h>c?(S-c)/(h-c):.5,Y=ke(I),O=r+R*_,te=p-L*E,Fe=g(O),qe=m(te),je=g(O+_)-g(O),Oe=m(te-E)-m(te);$+=`<rect x="${Fe}" y="${qe}" width="${je}" height="${Oe}" fill="${Y}" stroke="${w?"#333":Y}" stroke-width="${w?1:.5}"/>`;const We=g(O+_/2),Ve=m(te-E/2),Ge=I>.3&&I<.7?"#000":"#fff";$+=`<text x="${We}" y="${Ve+1}" fill="${Ge}" font-size="10" text-anchor="middle" dominant-baseline="central" font-weight="bold">${v(S)}</text>`}}}}if(b&&k){const c=t==null?void 0:t.getVar(k);let h=0,_=1;if(c&&Array.isArray(c)){const L=Array.isArray(c[0])?c.flat():c;h=Math.min(...L),_=Math.max(...L)}const E=20;for(let L=0;L<E;L++){const R=1-L/E,S=50+L/E*300,I=300/E+.5;$+=`<rect x="560" y="${S}" width="15" height="${I}" fill="${ke(R)}" stroke="none"/>`}$+='<rect x="560" y="50" width="15" height="300" fill="none" stroke="#333" stroke-width="0.5"/>';const v=L=>L.toFixed(2).replace(/\.?0+$/,"")||"0";$+=`<text x="578" y="54" fill="#333" font-size="9">${v(_)}</text>`,$+=`<text x="578" y="350" fill="#333" font-size="9">${v(h)}</text>`,$+=`<text x="${560+15/2}" y="44" fill="#333" font-size="9" text-anchor="middle">${b}</text>`}f<=0&&p>=0&&($+=`<line x1="50" y1="${m(0)}" x2="550" y2="${m(0)}" stroke="#666" stroke-width="1"/>`),r<=0&&a>=0&&($+=`<line x1="${g(0)}" y1="50" x2="${g(0)}" y2="350" stroke="#666" stroke-width="1"/>`),$+='<g font-size="10" fill="#888" text-anchor="middle">';for(let x=Math.ceil(r);x<=Math.floor(a);x++)x!==0&&($+=`<text x="${g(x)}" y="365">${x}</text>`);for(let x=Math.ceil(f);x<=Math.floor(p);x++)x!==0&&($+=`<text x="40" y="${m(x)+4}" text-anchor="end">${x}</text>`);$+="</g>";for(const x of u){const s=new He,T=300,l=[];for(let c=0;c<=T;c++){const h=r+(a-r)*c/T;s.setVar("x",h);try{const _=re(x.expr),E=J(_,s);isFinite(E)&&E>=f-10&&E<=p+10&&l.push(`${g(h).toFixed(1)},${m(E).toFixed(1)}`)}catch{}}l.length>1&&($+=`<polyline points="${l.join(" ")}" fill="none" stroke="${x.color}" stroke-width="${x.width}"/>`),x.label&&($+=`<text x="545" y="${m(0)-5}" fill="${x.color}" font-size="12" text-anchor="end">${x.label}</text>`)}for(const x of y){const s=x.split(/\s+/),T=s[0];if(T==="rect"&&s.length>=5){const[,l,c,h,_]=s.map(Number),E=s[5]||"#e3f2fd",v=Math.min(g(l),g(h)),L=Math.min(m(c),m(_)),R=Math.abs(g(h)-g(l)),S=Math.abs(m(_)-m(c));$+=`<rect x="${v}" y="${L}" width="${R}" height="${S}" fill="${E}" opacity="0.3"/>`}else if(T==="point"&&s.length>=3){const l=+s[1],c=+s[2],h=s[3]||"#f44336",_=+(s[4]||"4");$+=`<circle cx="${g(l)}" cy="${m(c)}" r="${_}" fill="${h}"/>`}else if(T==="text"&&s.length>=4){const l=+s[1],c=+s[2],h=x.match(/"([^"]+)"/),_=h?h[1]:s.slice(3).join(" "),E=(A=s[s.length-1])!=null&&A.startsWith("#")?s[s.length-1]:"#333";$+=`<text x="${g(l)}" y="${m(c)}" fill="${E}" font-size="12">${_}</text>`}else if(T==="eq"&&s.length>=4){const l=+s[1],c=+s[2],h=x.match(/"([^"]+)"/),_=h?h[1]:s.slice(3).join(" ");$+=`<text x="${g(l)}" y="${m(c)}" fill="#333" font-size="13" font-style="italic">${_}</text>`}else if(T==="line"&&s.length>=5){const[,l,c,h,_]=s.map(Number),E=s[5]||"#333",v=s[6]||"1";$+=`<line x1="${g(l)}" y1="${m(c)}" x2="${g(h)}" y2="${m(_)}" stroke="${E}" stroke-width="${v}"/>`}else if(T==="arrow"&&s.length>=5){const[,l,c,h,_]=s.map(Number),E=s[5]||"#333",v=`arr${Math.random().toString(36).slice(2,6)}`;$+=`<defs><marker id="${v}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="${E}"/></marker></defs>`,$+=`<line x1="${g(l)}" y1="${m(c)}" x2="${g(h)}" y2="${m(_)}" stroke="${E}" stroke-width="1.5" marker-end="url(#${v})"/>`}else if(T==="proj"&&s.length>=3){const l=+s[1],c=+s[2],h=s[3]||"#999";$+=`<line x1="${g(l)}" y1="${m(c)}" x2="${g(l)}" y2="${m(0)}" stroke="${h}" stroke-width="0.8" stroke-dasharray="4,3"/>`,$+=`<line x1="${g(l)}" y1="${m(c)}" x2="${g(0)}" y2="${m(c)}" stroke="${h}" stroke-width="0.8" stroke-dasharray="4,3"/>`}else if(T==="hline"&&s.length>=2){const l=+s[1],c=s[2]||"#999";$+=`<line x1="50" y1="${m(l)}" x2="550" y2="${m(l)}" stroke="${c}" stroke-width="0.8" stroke-dasharray="5,3"/>`}else if(T==="vline"&&s.length>=2){const l=+s[1],c=s[2]||"#999";$+=`<line x1="${g(l)}" y1="50" x2="${g(l)}" y2="350" stroke="${c}" stroke-width="0.8" stroke-dasharray="5,3"/>`}else if(T==="dim"&&s.length>=5){const[,l,c,h,_]=s.map(Number),E=x.match(/"([^"]+)"/),v=E?E[1]:"",L=(g(l)+g(h))/2,R=(m(c)+m(_))/2;$+=`<line x1="${g(l)}" y1="${m(c)}" x2="${g(h)}" y2="${m(_)}" stroke="#666" stroke-width="1"/>`,$+=`<text x="${L}" y="${R-5}" fill="#666" font-size="11" text-anchor="middle">${v}</text>`}}return $+="</svg>",`<div class="plot-container">${$}</div>`}function Ze(e){const t=`plotly_${Math.random().toString(36).slice(2,8)}`,n=e.join(`
`);return`<div id="${t}" style="width:100%;height:400px;"></div>
<script>if(window.Plotly){(function(){${n};Plotly.newPlot("${t}",data,layout||{})})()}else{document.getElementById("${t}").textContent="Plotly not loaded"}<\/script>`}function et(e){return`<div class="svg-container">${e.join(`
`)}</div>`}const tt=new Set(["box","sphere","cylinder","cone","torus","plane","line","arrow","darrow","plate","slab","tube","pipe","node","carc3d","dim3d","axes","axeslabeled","axes_labeled","gridhelper","color","opacity","wireframe","metalness","roughness","reset","camera","background","light"]);function nt(e){const t=[],n={};let i=null;for(let o=1;o<e.length;o++){const r=e[o];if(r.includes(":")){const a=r.indexOf(":");n[r.slice(0,a).toLowerCase()]=r.slice(a+1)}else{const a=parseFloat(r);isNaN(a)?i===null&&(i=r):t.push(a)}}return{pos:t,kv:n,text:i}}function st(e){const t=[];let n=0;for(;n<e.length;){if(e[n]===" "||e[n]==="	"){n++;continue}if(e[n]==='"'||e[n]==="'"){const i=e[n];let o=n+1;for(;o<e.length&&e[o]!==i;)o++;t.push(e.slice(n+1,o)),n=o+1}else{let i=n;for(;i<e.length&&e[i]!==" "&&e[i]!=="	";)i++;t.push(e.slice(n,i)),n=i}}return t}function ne(e){return e?e.startsWith("#")?"0x"+e.slice(1):{red:"0xff0000",green:"0x00ff00",blue:"0x0000ff",white:"0xffffff",black:"0x000000",yellow:"0xffff00",cyan:"0x00ffff",magenta:"0xff00ff",orange:"0xff8800",gray:"0x888888",grey:"0x888888",brown:"0x8b4513",pink:"0xff69b4",purple:"0x800080"}[e.toLowerCase()]||"0x4488ff":"0x4488ff"}function ot(e){const t=[];let n="#4488ff",i="1",o="false",r="0.1",a="0.5",f=0;const p=m=>ne(m.color||n),u=m=>m.opacity||i,y=m=>m.wireframe||o,k=m=>m.metalness||r,b=m=>m.roughness||a,w=(m,M)=>{const $=M||p(m),A=u(m),x=y(m),s=parseFloat(A)<1?",transparent:true":"";return`new THREE.MeshStandardMaterial({color:${$},opacity:${A},wireframe:${x},metalness:${k(m)},roughness:${b(m)}${s}})`},g=(m,M,$,A)=>{const x=`_m${f++}`;if(t.push(`{const ${x}=new THREE.Mesh(${m},${w(M)});`),$.length>=3&&t.push(`${x}.position.set(${$[0]},${$[1]},${$[2]});`),A){const[s,T,l]=A.split(",").map(Number);t.push(`${x}.rotation.set(${(s||0)*Math.PI/180},${(T||0)*Math.PI/180},${(l||0)*Math.PI/180});`)}t.push(`scene.add(${x});}`)};for(const m of e){const M=m.trim();if(!M||M.startsWith("//"))continue;const $=st(M);if($.length===0)continue;const A=$[0].toLowerCase();if(!tt.has(A)){t.push(M);continue}const{pos:x,kv:s,text:T}=nt($),l=c=>c<x.length?x[c]:0;switch(A){case"color":n=$[1]||"#4488ff";break;case"opacity":i=$[1]||"1";break;case"wireframe":o=$[1]||"true";break;case"metalness":r=$[1]||"0.1";break;case"roughness":a=$[1]||"0.5";break;case"reset":n="#4488ff",i="1",o="false",r="0.1",a="0.5";break;case"camera":{if(x.length>=3&&t.push(`camera.position.set(${l(0)},${l(1)},${l(2)});`),s.lookat){const[c,h,_]=s.lookat.split(",").map(Number);t.push(`camera.lookAt(${c||0},${h||0},${_||0});`)}s.fov&&t.push(`camera.fov=${s.fov};camera.updateProjectionMatrix();`);break}case"background":t.push(`scene.background=new THREE.Color(${ne($[1]||"#f5f5f5")});`);break;case"light":{const c=ne(s.color||"#ffffff"),h=s.intensity||"0.8";x.length>=3?t.push(`{const _l=new THREE.DirectionalLight(${c},${h});_l.position.set(${l(0)},${l(1)},${l(2)});scene.add(_l);}`):t.push(`{const _l=new THREE.DirectionalLight(${c},${h});_l.position.set(5,10,7);scene.add(_l);}`);break}case"gridhelper":{const c=s.size||"10",h=s.divisions||"10";t.push(`scene.add(new THREE.GridHelper(${c},${h}));`);break}case"box":{const c=s.size?s.size.split(",").map(Number):[1,1,1];g(`new THREE.BoxGeometry(${c[0]||1},${c[1]||1},${c[2]||1})`,s,[l(0),l(1),l(2)],s.rotation);break}case"sphere":{const c=s.r||s.radius||"0.5",h=s.segments||"32";g(`new THREE.SphereGeometry(${c},${h},${h})`,s,[l(0),l(1),l(2)]);break}case"cylinder":{const c=s.rtop||s.r||"0.5",h=s.rbottom||s.r||"0.5",_=s.h||s.height||"1",E=s.segments||"32";g(`new THREE.CylinderGeometry(${c},${h},${_},${E})`,s,[l(0),l(1),l(2)],s.rotation);break}case"cone":{const c=s.r||s.radius||"0.5",h=s.h||s.height||"1";g(`new THREE.ConeGeometry(${c},${h},32)`,s,[l(0),l(1),l(2)],s.rotation);break}case"torus":{const c=s.r||"1",h=s.tube||"0.3";g(`new THREE.TorusGeometry(${c},${h},16,48)`,s,[l(0),l(1),l(2)],s.rotation);break}case"plane":{const c=s.width||s.w||"5",h=s.height||s.h||"5";g(`new THREE.PlaneGeometry(${c},${h})`,s,[l(0),l(1),l(2)],s.rotation||"-90,0,0");break}case"plate":case"slab":{const c=s.w||s.width||"2",h=s.d||s.depth||"2",_=s.t||s.thickness||"0.2";g(`new THREE.BoxGeometry(${c},${_},${h})`,s,[l(0),l(1),l(2)],s.rotation);break}case"line":{const c=p(s),h=s.width||"2";t.push(`{const _pts=[new THREE.Vector3(${l(0)},${l(1)},${l(2)}),new THREE.Vector3(${l(3)},${l(4)},${l(5)})];`),t.push("const _g=new THREE.BufferGeometry().setFromPoints(_pts);"),t.push(`const _l=new THREE.Line(_g,new THREE.LineBasicMaterial({color:${c},linewidth:${h}}));scene.add(_l);}`);break}case"arrow":{const c=p(s),h=s.length,_=l(3)-l(0),E=l(4)-l(1),v=l(5)-l(2),L=h||`Math.sqrt(${_*_+E*E+v*v})`;t.push(`{const _dir=new THREE.Vector3(${_},${E},${v}).normalize();`),t.push(`const _a=new THREE.ArrowHelper(_dir,new THREE.Vector3(${l(0)},${l(1)},${l(2)}),${L},${c});scene.add(_a);}`);break}case"darrow":{const c=p(s),h=l(3)-l(0),_=l(4)-l(1),E=l(5)-l(2),v=`Math.sqrt(${h}*${h}+${_}*${_}+${E}*${E})`;t.push(`{const _d=new THREE.Vector3(${h},${_},${E}).normalize();`),t.push(`const _a1=new THREE.ArrowHelper(_d,new THREE.Vector3(${l(0)},${l(1)},${l(2)}),${v},${c},${v}*0.12,${v}*0.06);scene.add(_a1);`),t.push(`const _a2=new THREE.ArrowHelper(_d.clone().negate(),new THREE.Vector3(${l(3)},${l(4)},${l(5)}),${v},${c},${v}*0.12,${v}*0.06);scene.add(_a2);}`);break}case"tube":case"pipe":{const c=s.r||s.radius||"0.05",h=s.segments||"8";t.push(`{const _p=new THREE.LineCurve3(new THREE.Vector3(${l(0)},${l(1)},${l(2)}),new THREE.Vector3(${l(3)},${l(4)},${l(5)}));`),t.push(`const _g=new THREE.TubeGeometry(_p,1,${c},${h},false);`),t.push(`const _m=new THREE.Mesh(_g,${w(s)});scene.add(_m);}`);break}case"node":{const c=s.r||"0.1",h=T||s.label||"";if(t.push(`{const _g=new THREE.SphereGeometry(${c},16,16);`),t.push(`const _m=new THREE.Mesh(_g,${w(s,ne(s.color||"white"))});`),t.push(`_m.position.set(${l(0)},${l(1)},${l(2)});scene.add(_m);`),h){const _=s.size||"48";t.push('const _c=document.createElement("canvas");_c.width=128;_c.height=64;'),t.push('const _cx=_c.getContext("2d");_cx.fillStyle="white";_cx.fillRect(0,0,128,64);'),t.push('_cx.strokeStyle="black";_cx.strokeRect(0,0,128,64);'),t.push(`_cx.font="bold ${_}px sans-serif";_cx.fillStyle="black";_cx.textAlign="center";_cx.textBaseline="middle";`),t.push(`_cx.fillText("${h}",64,32);`),t.push("const _t=new THREE.CanvasTexture(_c);const _sm=new THREE.SpriteMaterial({map:_t});"),t.push(`const _s=new THREE.Sprite(_sm);_s.position.set(${l(0)},${l(1)}+${parseFloat(c)*2},${l(2)});_s.scale.set(0.5,0.25,1);scene.add(_s);`)}t.push("}");break}case"axes":case"axeslabeled":case"axes_labeled":{const c=s.length||s.l||"3";if(t.push(`{const _ax=new THREE.AxesHelper(${c});`),x.length>=3&&t.push(`_ax.position.set(${l(0)},${l(1)},${l(2)});`),t.push("scene.add(_ax);"),A!=="axes"){const h=(_,E,v,L,R)=>{t.push('{const _c=document.createElement("canvas");_c.width=64;_c.height=64;'),t.push(`const _x=_c.getContext("2d");_x.font="bold 48px sans-serif";_x.fillStyle="${R}";_x.textAlign="center";_x.textBaseline="middle";_x.fillText("${_}",32,32);`),t.push("const _s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(_c)}));"),t.push(`_s.position.set(${E},${v},${L});_s.scale.set(0.4,0.4,1);scene.add(_s);}`)};h(s.xlabel||"X",`${c}*1.1`,"0","0","red"),h(s.ylabel||"Y","0",`${c}*1.1`,"0","green"),h(s.zlabel||"Z","0","0",`${c}*1.1`,"blue")}t.push("}");break}case"carc3d":{const c=s.r||"1",h=parseFloat(s.start||"0"),_=parseFloat(s.end||"270"),E=p(s),v=h*Math.PI/180,L=_*Math.PI/180,R=s.segments||"64";t.push("{const _pts=[];"),t.push(`for(let i=0;i<=${R};i++){const a=${v}+(${L}-${v})*i/${R};_pts.push(new THREE.Vector3(${c}*Math.cos(a)+${l(0)},${l(1)},${c}*Math.sin(a)+${l(2)}));}`),t.push("const _g=new THREE.BufferGeometry().setFromPoints(_pts);"),t.push(`scene.add(new THREE.Line(_g,new THREE.LineBasicMaterial({color:${E}})));`);const S=s.headlength||"0.15",I=s.headradius||"0.06";t.push(`const _ea=${L};const _ex=${c}*Math.cos(_ea)+${l(0)},_ez=${c}*Math.sin(_ea)+${l(2)};`),t.push(`const _cg=new THREE.ConeGeometry(${I},${S},12);`),t.push(`const _cm=new THREE.Mesh(_cg,new THREE.MeshStandardMaterial({color:${E}}));`),t.push(`_cm.position.set(_ex,${l(1)},_ez);`),t.push("_cm.rotation.z=Math.PI/2;_cm.rotation.y=-_ea-Math.PI/2;scene.add(_cm);}");break}case"dim3d":{const c=p(s),h=T||s.text||"";t.push(`{const _p1=new THREE.Vector3(${l(0)},${l(1)},${l(2)}),_p2=new THREE.Vector3(${l(3)},${l(4)},${l(5)});`),t.push("const _g=new THREE.BufferGeometry().setFromPoints([_p1,_p2]);"),t.push(`scene.add(new THREE.Line(_g,new THREE.LineBasicMaterial({color:${c}})));`),t.push("const _d=_p2.clone().sub(_p1);const _l=_d.length();const _dn=_d.normalize();"),t.push(`scene.add(new THREE.ArrowHelper(_dn,_p1,_l,${c},_l*0.08,_l*0.04));`),h&&(t.push("const _mid=_p1.clone().add(_p2).multiplyScalar(0.5);"),t.push('const _c=document.createElement("canvas");_c.width=256;_c.height=64;'),t.push('const _x=_c.getContext("2d");_x.fillStyle="white";_x.fillRect(0,0,256,64);'),t.push('_x.font="bold 32px sans-serif";_x.fillStyle="black";_x.textAlign="center";_x.textBaseline="middle";'),t.push(`_x.fillText("${h}",128,32);`),t.push("const _s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(_c)}));"),t.push("_s.position.copy(_mid);_s.position.y+=0.2;_s.scale.set(1,0.25,1);scene.add(_s);")),t.push("}");break}default:t.push(M);break}}return t.join(`
`)}function it(e){const t=`three_${Math.random().toString(36).slice(2,8)}`,n=ot(e);return`<div id="${t}" style="width:100%;height:400px;border:1px solid #ddd;"></div>
<script type="module">
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import {OrbitControls} from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/OrbitControls.js';
(function(){const container=document.getElementById("${t}");
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
})();<\/script>`}function lt(e,t,n){const i=e[t].trim();let o=i.match(/^#?for\s+(\w+)\s*=\s*(.*?)\s+to\s+(.*?)(?:\s*:\s*(.+))?\s*$/i);if(o||(o=i.match(/^#?for\s+(\w+)\s*=\s*(.+?)\s*:\s*(.+?)(?:\s*:\s*(.+))?\s*$/i)),!o)return{html:`<div class="error">Invalid for: ${i}</div>`,nextLine:t+1};const r=o[1],a=K(o[2],n),f=K(o[3],n),p=o[4]?K(o[4],n):1,u=[];let y=t+1,k=1;for(;y<e.length;){const w=e[y].trim();if(/^#?for\s+/i.test(w)&&k++,/^#?if\s+/i.test(w)&&!/^#?else\s+if/i.test(w)&&k++,/^#?while\s+/i.test(w)&&k++,/^#?repeat\s*$/i.test(w)&&k++,(/^#?(next|end)\s*$/i.test(w)||/^#?end\s+if\s*$/i.test(w)||/^#?loop\s*$/i.test(w)||/^#?until\s+/i.test(w))&&(k--,k===0)){y++;break}u.push(e[y]),y++}let b="";for(let w=a;p>0?w<=f:w>=f;w+=p){n.setVar(r,w);const g=X(u.join(`
`),n,!0);b+=g.html}return{html:b,nextLine:y}}function rt(e,t,n){const i=[];let o={cond:e[t].trim().replace(/^#?if\s+/i,""),body:[]},r=t+1,a=1;for(;r<e.length;){const f=e[r].trim();if(/^#?if\s+/i.test(f)&&!/^#?else\s+if/i.test(f)){a++,o.body.push(e[r]),r++;continue}if(/^#?for\s+/i.test(f)){a++,o.body.push(e[r]),r++;continue}if(/^#?while\s+/i.test(f)){a++,o.body.push(e[r]),r++;continue}if(/^#?repeat\s*$/i.test(f)){a++,o.body.push(e[r]),r++;continue}if(/^#?end\s+if\s*$/i.test(f)||/^#?(next|end)\s*$/i.test(f)||/^#?loop\s*$/i.test(f)||/^#?until\s+/i.test(f)){if(a--,a===0){i.push(o),r++;break}o.body.push(e[r]),r++;continue}if(a===1&&/^#?else\s+if\s+/i.test(f)){i.push(o),o={cond:f.replace(/^#?else\s+if\s+/i,""),body:[]},r++;continue}if(a===1&&/^#?else\s*$/i.test(f)){i.push(o),o={cond:null,body:[]},r++;continue}o.body.push(e[r]),r++}for(const f of i)if(f.cond===null||K(f.cond,n))return{html:X(f.body.join(`
`),n).html,nextLine:r};return{html:"",nextLine:r}}function at(e,t,n){const i=e[t].trim().replace(/^#?while\s+/i,""),o=[];let r=t+1,a=1;for(;r<e.length;){const u=e[r].trim();if(/^#?while\s+/i.test(u)&&a++,/^#?loop\s*$/i.test(u)&&(a--,a===0)){r++;break}o.push(e[r]),r++}let f="",p=0;for(;K(i,n)&&p<1e4;){const u=X(o.join(`
`),n);f+=u.html,p++}return{html:f,nextLine:r}}function ct(e,t,n){const i=[];let o=t+1,r="",a=1;for(;o<e.length;){const u=e[o].trim();if(/^#?repeat\s*$/i.test(u)&&a++,/^#?until\s+/i.test(u)&&(a--,a===0)){r=u.replace(/^#?until\s+/i,""),o++;break}i.push(e[o]),o++}let f="",p=0;do{const u=X(i.join(`
`),n);f+=u.html,p++}while(!K(r,n)&&p<1e4);return{html:f,nextLine:o}}function K(e,t){try{const n=re(e),i=J(n,t);return typeof i=="number"?i:NaN}catch{return 0}}const dt=`# Ejemplo 5.1 - Analisis de Grid Frame
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
`,ut=`# Calculo Basico
> Definicion de variables
a = 3
b = 4
c = sqrt(a^2 + b^2)

> Funciones trigonometricas
alpha = atan(b/a)
sin_a = sin(alpha)
cos_a = cos(alpha)

> Funcion de usuario
f(x) = x^3 - 2*x + 1
f(0)
f(1)
f(2)

> Area de circulo
r = 5
A = pi*r^2`,ht=`# Grafico con anotaciones
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
@{end plot}`,ft=`# Ecuaciones Formateadas
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
@{end eq}`,mt=`# FEM Assembly
> Propiedades del elemento
E = 200000
A = 100
L = 1000

> Rigidez axial
k = E*A/L

> Matriz de rigidez local 2x2
K11 = k
K12 = -k
K21 = -k
K22 = k

> Ensamblaje 3 elementos en serie
K_global_22 = k + k
K_global_33 = k + k

> Fuerza aplicada en nodo 3
F3 = 1000
u3 = F3/k`,pt=`# Operaciones con Vectores
> Definicion
v1 = {3; 4; 0}
v2 = {1; -2; 5}

> Magnitud
mag_v1 = sqrt(3^2 + 4^2 + 0^2)

> Producto punto
dot_v = 3*1 + 4*(-2) + 0*5

> Suma
sx = 3 + 1
sy = 4 + (-2)
sz = 0 + 5`,xt=`# Dibujo SVG
@{svg}
<svg viewBox="0 0 400 300" style="max-width:400px;background:#fff;border:1px solid #ddd;">
  <rect x="50" y="50" width="300" height="200" fill="none" stroke="#333" stroke-width="2"/>
  <circle cx="200" cy="150" r="60" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <line x1="50" y1="150" x2="350" y2="150" stroke="#999" stroke-dasharray="5,3"/>
  <line x1="200" y1="50" x2="200" y2="250" stroke="#999" stroke-dasharray="5,3"/>
  <text x="200" y="30" text-anchor="middle" font-size="14" fill="#333">Dibujo SVG</text>
</svg>
@{end svg}`,gt=`# Escena 3D con Three.js
@{three}
const geometry = new THREE.BoxGeometry(2, 2, 2);
const material = new THREE.MeshPhongMaterial({color: 0x2196f3});
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

const sphere = new THREE.Mesh(
  new THREE.SphereGeometry(0.8, 32, 32),
  new THREE.MeshPhongMaterial({color: 0xf44336})
);
sphere.position.set(3, 0, 0);
scene.add(sphere);

scene.add(new THREE.GridHelper(10, 10));
@{end three}`,$t=`# Control de Flujo
for i = 1 to 5
x = i^2
next

valor = 42
if valor > 100
resultado = 1
else if valor > 10
resultado = 2
else
resultado = 3
end if

S = 0
for k = 1 to 100
S = S + 1/k^2
next`,bt=`# Integracion Numerica (Gauss-Legendre)
> Cuadratura de Gauss para integrales simples, dobles y triples

## Integral Simple

> Area bajo sin(x) de 0 a pi
f(x) = sin(x)
I_1 = integral(f, 0, pi)

> Integral de polinomio
g(x) = x^3 - 2*x + 1
I_2 = integral(g, -1, 2)

@{plot}
x = -1 : 2
y = -2 : 5
y = x^3 - 2*x + 1 | color: #2196f3 | width: 2 | label: "g(x) = x^3 - 2x + 1"
hline 0 #999
@{end plot}

## Integral Doble

> Volumen bajo paraboloide z = x^2 + y^2 en [0,1] x [0,1]
h(x,y) = x^2 + y^2
I_3 = integral2(h, 0, 1, 0, 1)

> Integral de sin(x)*cos(y) en [0,pi] x [0,pi/2]
p(x,y) = sin(x)*cos(y)
I_4 = integral2(p, 0, pi, 0, pi/2)

## Integral Triple

> Densidad r = x + y + z en cubo unitario
r(x,y,z) = x + y + z
I_5 = integral3(r, 0, 1, 0, 1, 0, 1)

> Integral de x*y*z en [0,2]^3
q(x,y,z) = x*y*z
I_6 = integral3(q, 0, 2, 0, 2, 0, 2)`,xe={calculo:{name:"Calculo Basico",code:ut},plot:{name:"@{plot} Graficos",code:ht},eq_demo:{name:"@{eq} Ecuaciones",code:ft},integral:{name:"Integrales",code:bt},fem:{name:"FEM Assembly",code:mt},vectores:{name:"Vectores",code:pt},control:{name:"Control de Flujo",code:$t},three:{name:"@{three} 3D",code:gt},svg:{name:"@{svg} Dibujo",code:xt},grid_frame:{name:"Grid Frame (Paz 5.1)",code:dt}},d=document.getElementById("codeInput"),D=document.getElementById("output"),fe=document.getElementById("btnRun"),ue=document.getElementById("statusText"),se=document.getElementById("exampleSelect"),_t=document.getElementById("chkAutoRun"),me=document.getElementById("splitter"),ve=document.getElementById("inputFrame"),yt=document.getElementById("outputFrame"),Et=document.getElementById("rulerH"),wt=document.getElementById("rulerV"),Le=document.getElementById("keypadContent"),Me=document.getElementById("lineNumbers"),Z=document.getElementById("syntaxLayer"),ge=document.getElementById("findBar"),V=document.getElementById("findInput"),$e=document.getElementById("replaceInput"),oe=document.getElementById("findCount"),G=document.getElementById("acPopup");for(const[e,t]of Object.entries(xe)){const n=document.createElement("option");n.value=e,n.textContent=t.name,se.appendChild(n)}se.addEventListener("change",()=>{const e=xe[se.value];e&&(d.value=e.code,q(),N(),F())});let z=null;function F(){const e=d.value;if(!e.trim()){D.innerHTML="";return}ue.textContent="Procesando...",fe.disabled=!0;try{const t=X(e);D.innerHTML=`<div class="output-page">${t.html}</div>`,ue.textContent="Listo",ee()}catch(t){D.innerHTML=`<div class="output-page"><div class="line error">Error: ${t.message}</div></div>`,ue.textContent="Error"}fe.disabled=!1}fe.addEventListener("click",F);d.addEventListener("keydown",e=>{if(G.classList.contains("open")){if(e.key==="ArrowDown"){e.preventDefault(),j=(j+1)%B.length,pe();return}if(e.key==="ArrowUp"){e.preventDefault(),j=(j-1+B.length)%B.length,pe();return}if(e.key==="Enter"||e.key==="Tab"){e.preventDefault(),Se();return}if(e.key==="Escape"){ie();return}}if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault(),F();return}if(e.key==="F5"){e.preventDefault(),F();return}if(e.key==="f"&&(e.ctrlKey||e.metaKey)){e.preventDefault(),Te(!1);return}if(e.key==="h"&&(e.ctrlKey||e.metaKey)){e.preventDefault(),Te(!0);return}if(e.key==="Escape"&&ge.classList.contains("open")){ce();return}if(e.key==="q"&&(e.ctrlKey||e.metaKey)&&!e.shiftKey){e.preventDefault(),Ie();return}if(e.key==="q"&&(e.ctrlKey||e.metaKey)&&e.shiftKey){e.preventDefault(),De();return}if(e.key==="Tab"){e.preventDefault();const t=d.selectionStart,n=d.selectionEnd;d.value=d.value.substring(0,t)+"  "+d.value.substring(n),d.selectionStart=d.selectionEnd=t+2}});d.addEventListener("input",()=>{Ht(),z&&clearTimeout(z),z=setTimeout(F,400)});function q(){const e=d.value,t=e.split(`
`).length,n=d.selectionStart,i=e.substring(0,n).split(`
`).length;let o="";for(let r=1;r<=t;r++)o+=`<div${r===i?' class="active"':""}>${r}</div>`;Me.innerHTML=o}function kt(){Me.scrollTop=d.scrollTop}d.addEventListener("scroll",kt);d.addEventListener("input",q);d.addEventListener("click",q);d.addEventListener("keyup",q);function N(){const t=d.value.split(`
`);let n=!1;const i=[];for(const o of t){const r=o.trimStart();if(/^@\{(?!end)/.test(r)&&(n=!0),/^@\{end\s/.test(r)){i.push(Q(o,"syn-block")),n=!1;continue}if(/^@\{/.test(r)){i.push(Q(o,"syn-block"));continue}if(n){i.push(ae(o));continue}if(/^#{1,6}\s/.test(r)){i.push(Q(o,"syn-heading"));continue}if(r.startsWith(">")){i.push(Q(o,"syn-comment"));continue}if(r.startsWith("'")){i.push(Q(o,"syn-comment"));continue}if(/^#?(for|next|if|else|end if|repeat|loop|break|continue|while|do)\b/i.test(r)){i.push(Q(o,"syn-keyword"));continue}i.push(vt(o))}Z.innerHTML=i.join(`
`),Z.scrollTop=d.scrollTop,Z.scrollLeft=d.scrollLeft}function ae(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function Q(e,t){return`<span class="${t}">${ae(e)}</span>`}function vt(e){return ae(e).replace(/\b(\d+\.?\d*([eE][+-]?\d+)?)\b/g,'<span class="syn-number">$1</span>').replace(/\b(sin|cos|tan|asin|acos|atan|atan2|sqrt|cbrt|ln|log|exp|abs|round|floor|ceiling|min|max|mod|gcd|lcm|sum|product|integral|transpose|lsolve|det|inv|identity|matrix)\b/g,'<span class="syn-function">$1</span>')}d.addEventListener("input",N);d.addEventListener("scroll",()=>{Z.scrollTop=d.scrollTop,Z.scrollLeft=d.scrollLeft});let H=[],P=-1;function Te(e=!1){ge.classList.add("open");const t=document.getElementById("replaceRow");t.style.display=e?"flex":"none",V.focus();const n=d.value.substring(d.selectionStart,d.selectionEnd);n&&!n.includes(`
`)&&(V.value=n),V.select(),U()}function ce(){ge.classList.remove("open"),H=[],P=-1,oe.textContent="",d.focus()}function U(){const e=V.value;if(!e){H=[],P=-1,oe.textContent="";return}const t=document.getElementById("findCase").checked,n=document.getElementById("findRegex").checked;H=[];const i=d.value;try{if(n){const o=t?"g":"gi",r=new RegExp(e,o);let a;for(;(a=r.exec(i))!==null;)H.push({start:a.index,end:a.index+a[0].length}),a[0].length===0&&r.lastIndex++}else{const o=t?i:i.toLowerCase(),r=t?e:e.toLowerCase();let a=0;for(;(a=o.indexOf(r,a))!==-1;)H.push({start:a,end:a+e.length}),a+=e.length}}catch{}if(H.length>0){const o=d.selectionStart;P=H.findIndex(r=>r.start>=o),P===-1&&(P=0),be()}else P=-1;_e()}function be(){if(P<0||P>=H.length)return;const e=H[P];d.selectionStart=e.start,d.selectionEnd=e.end,d.focus();const t=d.value.substring(0,e.start).split(`
`).length,n=parseFloat(getComputedStyle(d).lineHeight)||20;d.scrollTop=Math.max(0,(t-5)*n)}function _e(){H.length===0?oe.textContent=V.value?"0/0":"":oe.textContent=`${P+1}/${H.length}`}function Ce(){H.length!==0&&(P=(P+1)%H.length,be(),_e())}function Pe(){H.length!==0&&(P=(P-1+H.length)%H.length,be(),_e())}function Lt(){if(P<0||P>=H.length)return;const e=H[P],t=d.value;d.value=t.substring(0,e.start)+$e.value+t.substring(e.end),U(),q(),N()}function Tt(){if(H.length===0)return;let e=d.value;for(let t=H.length-1;t>=0;t--){const n=H[t];e=e.substring(0,n.start)+$e.value+e.substring(n.end)}d.value=e,U(),q(),N()}V.addEventListener("input",U);document.getElementById("findNext").addEventListener("click",Ce);document.getElementById("findPrev").addEventListener("click",Pe);document.getElementById("replaceOne").addEventListener("click",Lt);document.getElementById("replaceAll").addEventListener("click",Tt);document.getElementById("findClose").addEventListener("click",ce);document.getElementById("findCase").addEventListener("change",U);document.getElementById("findRegex").addEventListener("change",U);V.addEventListener("keydown",e=>{e.key==="Enter"&&(e.preventDefault(),e.shiftKey?Pe():Ce()),e.key==="Escape"&&ce()});$e.addEventListener("keydown",e=>{e.key==="Escape"&&ce()});const Rt=[...["sin","cos","tan","asin","acos","atan","atan2","sqrt","cbrt","ln","log","log2","exp","abs","round","floor","ceiling","min","max","mod","gcd","lcm","sum","product","integral","transpose","lsolve","det","inv","identity","matrix","sign","fact","comb","perm"].map(e=>({word:e+"(",kind:"fn"})),...["pi","e","inf"].map(e=>({word:e,kind:"const"})),...["for","next","if","else","end if","repeat","loop","break","continue","while","do"].map(e=>({word:e,kind:"kw"})),...["@{eq}","@{end eq}","@{plot}","@{end plot}","@{svg}","@{end svg}","@{three}","@{end three}","@{draw}","@{end draw}","@{html}","@{end html}","@{css}","@{end css}","@{markdown}","@{end markdown}","@{python}","@{end python}","@{bash}","@{end bash}","@{js}","@{end js}","@{columns 2}","@{end columns}","@{table}","@{end table}","@{function}","@{end function}","@{pagebreak}"].map(e=>({word:e,kind:"block"})),...["alpha","beta","gamma","delta","epsilon","zeta","eta","theta","lambda","mu","nu","xi","rho","sigma","tau","phi","psi","omega","Gamma","Delta","Theta","Lambda","Sigma","Phi","Psi","Omega"].map(e=>({word:e,kind:"greek"}))];let j=0,B=[];function Ae(){const e=d.selectionStart,t=d.value;let n=e;for(;n>0&&/[\w@{#.]/.test(t[n-1]);)n--;return{word:t.substring(n,e),start:n}}function Ht(){const{word:e,start:t}=Ae();if(e.length<2){ie();return}const n=e.toLowerCase();if(B=Rt.filter(k=>k.word.toLowerCase().startsWith(n)&&k.word!==e),B.length===0){ie();return}j=0,pe(),d.getBoundingClientRect();const o=d.value.substring(0,t).split(`
`),r=parseFloat(getComputedStyle(d).lineHeight)||20,a=o.length,f=o[o.length-1].length,p=7.8,u=a*r-d.scrollTop+2,y=f*p-d.scrollLeft+50;G.style.top=`${u}px`,G.style.left=`${y}px`,G.classList.add("open")}function pe(){G.innerHTML=B.map((e,t)=>`<div class="ac-item${t===j?" selected":""}" data-idx="${t}">
      <span>${ae(e.word)}</span>
      <span class="ac-kind">${e.kind}</span>
    </div>`).join("")}function ie(){G.classList.remove("open"),B=[]}function Se(){if(B.length===0)return;const e=B[j],{start:t}=Ae(),n=d.value,i=d.selectionStart;d.value=n.substring(0,t)+e.word+n.substring(i),d.selectionStart=d.selectionEnd=t+e.word.length,ie(),q(),N(),z&&clearTimeout(z),z=setTimeout(F,400)}G.addEventListener("click",e=>{const t=e.target.closest(".ac-item");t&&(j=parseInt(t.dataset.idx),Se())});function Mt(e){const t=e.replace(/\\n/g,`
`),n=d.selectionStart,i=d.selectionEnd;d.value=d.value.substring(0,n)+t+d.value.substring(i),d.selectionStart=d.selectionEnd=n+t.length,d.focus(),q(),N(),z&&clearTimeout(z),z=setTimeout(F,400)}document.addEventListener("click",e=>{const t=e.target.closest("[data-insert]");t&&Mt(t.dataset.insert)});document.addEventListener("click",e=>{e.target.closest(".menu-item")||document.querySelectorAll(".menu-item").forEach(n=>n.classList.remove("open"))});document.querySelectorAll(".menu-dropdown button[data-action]").forEach(e=>{e.addEventListener("click",()=>{const t=e.dataset.action;switch(document.querySelectorAll(".menu-item").forEach(n=>n.classList.remove("open")),t){case"new":d.value="",D.innerHTML="";break;case"save":he(d.value,"document.hcalc","text/plain");break;case"saveas":he(d.value,"document.hcalc","text/plain");break;case"open":Ct();break;case"export-html":he(D.innerHTML,"output.html","text/html");break;case"undo":document.execCommand("undo");break;case"redo":document.execCommand("redo");break;case"selectall":d.select();break;case"comment":Ie();break;case"uncomment":De();break}})});function he(e,t,n){const i=new Blob([e],{type:n}),o=document.createElement("a");o.href=URL.createObjectURL(i),o.download=t,o.click(),URL.revokeObjectURL(o.href)}function Ct(){const e=document.createElement("input");e.type="file",e.accept=".hcalc,.cpd,.txt",e.onchange=()=>{var i;const t=(i=e.files)==null?void 0:i[0];if(!t)return;const n=new FileReader;n.onload=()=>{d.value=n.result,_t.checked&&F()},n.readAsText(t)},e.click()}function Ie(){const e=d.selectionStart,t=d.selectionEnd,n=d.value,o=n.substring(0,e).lastIndexOf(`
`)+1,r=n.indexOf(`
`,t),a=r===-1?n.length:r,p=n.substring(o,a).split(`
`).map(u=>"'"+u).join(`
`);d.value=n.substring(0,o)+p+n.substring(a),d.selectionStart=o,d.selectionEnd=o+p.length}function De(){const e=d.selectionStart,t=d.selectionEnd,n=d.value,o=n.substring(0,e).lastIndexOf(`
`)+1,r=n.indexOf(`
`,t),a=r===-1?n.length:r,p=n.substring(o,a).split(`
`).map(u=>u.startsWith("'")?u.slice(1):u).join(`
`);d.value=n.substring(0,o)+p+n.substring(a),d.selectionStart=o,d.selectionEnd=o+p.length}let le=!1;me.addEventListener("mousedown",e=>{le=!0,me.classList.add("dragging"),e.preventDefault()});document.addEventListener("mousemove",e=>{if(!le)return;const n=ve.parentElement.getBoundingClientRect(),i=e.clientX-n.left,o=n.width-6,r=Math.max(15,Math.min(85,i/o*100));ve.style.flex=`0 0 ${r}%`,yt.style.flex=`0 0 ${100-r}%`,ee()});document.addEventListener("mouseup",()=>{le&&(le=!1,me.classList.remove("dragging"))});const Pt=96,ze=Pt/2.54;function ee(){At(),St()}function At(){const e=Et,t=e.parentElement;e.width=t.clientWidth-18;const n=e.getContext("2d"),i=e.width,o=e.height;n.fillStyle="#F5F5F5",n.fillRect(0,0,i,o),n.strokeStyle="#AAA",n.fillStyle="#888",n.font="9px Segoe UI",n.textAlign="center";const a=D.scrollLeft||0,f=ze,p=Math.floor(a/f),u=Math.ceil((a+i)/f);for(let y=p;y<=u;y++){const k=y*f-a;k<0||k>i||(n.beginPath(),y%5===0?(n.moveTo(k,o),n.lineTo(k,o-10),n.stroke(),n.fillText(`${y}`,k,10)):(n.moveTo(k,o),n.lineTo(k,o-5),n.stroke()))}n.beginPath(),n.moveTo(0,o-.5),n.lineTo(i,o-.5),n.stroke()}function St(){const e=wt,t=e.parentElement;e.height=t.clientHeight-18;const n=e.getContext("2d"),i=e.width,o=e.height;n.fillStyle="#F5F5F5",n.fillRect(0,0,i,o),n.strokeStyle="#AAA",n.fillStyle="#888",n.font="9px Segoe UI",n.textAlign="center";const r=D.scrollTop||0,a=ze,f=Math.floor(r/a),p=Math.ceil((r+o)/a);for(let u=f;u<=p;u++){const y=u*a-r;y<0||y>o||(n.beginPath(),u%5===0?(n.moveTo(i,y),n.lineTo(i-10,y),n.stroke(),n.save(),n.translate(9,y),n.rotate(-Math.PI/2),n.fillText(`${u}`,0,0),n.restore()):(n.moveTo(i,y),n.lineTo(i-5,y),n.stroke()))}n.beginPath(),n.moveTo(i-.5,0),n.lineTo(i-.5,o),n.stroke()}D.addEventListener("scroll",ee);window.addEventListener("resize",ee);setTimeout(ee,100);const It={greek:[{label:"α",insert:"alpha"},{label:"β",insert:"beta"},{label:"γ",insert:"gamma"},{label:"δ",insert:"delta"},{label:"ε",insert:"epsilon"},{label:"ζ",insert:"zeta"},{label:"η",insert:"eta"},{label:"θ",insert:"theta"},{label:"λ",insert:"lambda"},{label:"μ",insert:"mu"},{label:"ν",insert:"nu"},{label:"ξ",insert:"xi"},{label:"π",insert:"pi"},{label:"ρ",insert:"rho"},{label:"σ",insert:"sigma"},{label:"τ",insert:"tau"},{label:"φ",insert:"phi"},{label:"ψ",insert:"psi"},{label:"ω",insert:"omega"},{label:"Γ",insert:"Gamma"},{label:"Δ",insert:"Delta"},{label:"Θ",insert:"Theta"},{label:"Λ",insert:"Lambda"},{label:"Σ",insert:"Sigma"},{label:"Φ",insert:"Phi"},{label:"Ψ",insert:"Psi"},{label:"Ω",insert:"Omega"}],operators:[{label:"+",insert:" + "},{label:"−",insert:" - "},{label:"×",insert:"*"},{label:"÷",insert:"/"},{label:"^",insert:"^"},{label:"!",insert:"!"},{label:"√",insert:"sqrt("},{label:"∛",insert:"cbrt("},{label:"≡",insert:" == "},{label:"≠",insert:" != "},{label:"<",insert:" < "},{label:">",insert:" > "},{label:"≤",insert:" <= "},{label:"≥",insert:" >= "},{label:"∧",insert:" && "},{label:"∨",insert:" || "},{label:"∑",insert:"sum("},{label:"∏",insert:"product("},{label:"∫",insert:"integral("}],functions:[{label:"sin",insert:"sin("},{label:"cos",insert:"cos("},{label:"tan",insert:"tan("},{label:"asin",insert:"asin("},{label:"acos",insert:"acos("},{label:"atan",insert:"atan("},{label:"ln",insert:"ln("},{label:"log",insert:"log("},{label:"exp",insert:"exp("},{label:"abs",insert:"abs("},{label:"sqrt",insert:"sqrt("},{label:"cbrt",insert:"cbrt("},{label:"round",insert:"round("},{label:"floor",insert:"floor("},{label:"ceil",insert:"ceiling("},{label:"min",insert:"min("},{label:"max",insert:"max("},{label:"mod",insert:"mod("},{label:"gcd",insert:"gcd("},{label:"lcm",insert:"lcm("}],blocks:[{label:"@{eq}",insert:"@{eq}\\n\\n@{end eq}"},{label:"@{plot}",insert:"@{plot}\\n\\n@{end plot}"},{label:"@{svg}",insert:"@{svg}\\n\\n@{end svg}"},{label:"@{three}",insert:"@{three}\\n\\n@{end three}"},{label:"@{draw}",insert:"@{draw}\\n\\n@{end draw}"},{label:"@{html}",insert:"@{html}\\n\\n@{end html}"},{label:"@{python}",insert:"@{python}\\n\\n@{end python}"},{label:"@{bash}",insert:"@{bash}\\n\\n@{end bash}"},{label:"@{js}",insert:"@{js}\\n\\n@{end js}"},{label:"@{columns}",insert:"@{columns 2}\\n\\n@{end columns}"},{label:"for",insert:"for i = 1 to 10\\n\\nnext"},{label:"if",insert:"if x > 0\\n\\nelse\\n\\nend if"}]};function Be(e){Le.innerHTML="";const t=It[e]||[];for(const n of t){const i=document.createElement("button");i.className=n.label.length>3?"key-btn wide":"key-btn",i.textContent=n.label,i.dataset.insert=n.insert,i.title=n.insert.replace(/\\n/g,"↵"),Le.appendChild(i)}}document.querySelectorAll(".keypad-tab").forEach(e=>{e.addEventListener("click",()=>{document.querySelectorAll(".keypad-tab").forEach(t=>t.classList.remove("active")),e.classList.add("active"),Be(e.dataset.tab)})});Be("greek");var Re;(Re=document.getElementById("btnPrint"))==null||Re.addEventListener("click",()=>{const e=window.open("","_blank");e&&(e.document.write(`<!DOCTYPE html><html><head><title>Hekatan Calc Output</title>
    <style>body{font-family:'Segoe UI',sans-serif;padding:30px 40px;}</style></head>
    <body>${D.innerHTML}</body></html>`),e.document.close(),e.print())});d.value=xe.calculo.code;se.value="calculo";q();N();F();
