import"./modulepreload-polyfill-B5Qt9EMX.js";import{r as B,p as te,H as ye,e as de,a as oe,b as M,c as Se}from"./renderer-CewHCcgS.js";const Ie=/^@\{(plot|plotly|svg|three|eq)\b\s*([^}]*)\}\s*$/i,Ae=/^@\{end\s+(plot|plotly|svg|three|eq)\}\s*$/i;function V(e,t,n){var b;const s=t??new ye,o=e.split(`
`);let l="",r=0;for(;r<o.length;){let h=o[r].trim();if(!h){l+='<div class="spacer"></div>',r++;continue}if(h.startsWith("//")){r++;continue}if(h.includes("//")&&(h=h.slice(0,h.indexOf("//")).trim(),!h)){r++;continue}const p=h.match(Ie);if(p){const u=p[1].toLowerCase(),k=((b=p[2])==null?void 0:b.trim())||"",m=[];for(r++;r<o.length;){const c=o[r].trim();if(Ae.test(c)){r++;break}m.push(o[r]),r++}l+=ze(u,m,k);continue}if(/^#?for\s+/i.test(h)){const u=Ve(o,r,s);l+=u.html,r=u.nextLine;continue}if(/^#?if\s+/i.test(h)){const u=Ke(o,r,s);l+=u.html,r=u.nextLine;continue}if(/^#?while\s+/i.test(h)){const u=Ue(o,r,s);l+=u.html,r=u.nextLine;continue}if(/^#?repeat\s*$/i.test(h)){const u=Xe(o,r,s);l+=u.html,r=u.nextLine;continue}if(/^#{1,6}\s+/.test(h)&&!/^#(?:for|if|else|end|while|loop|repeat|until|next)\b/i.test(h)){const u=(h.match(/^#+/)||[""])[0].length,k=h.slice(u).trim();l+=`<h${Math.min(u,6)}>${B(k)}</h${Math.min(u,6)}>`,r++;continue}if(h.startsWith(">")){const u=h.slice(1).trim();l+=`<p class="comment">${B(u)}</p>`,r++;continue}if(/^@\{cells\}\s*\|/.test(h)){const k=h.replace(/^@\{cells\}\s*/,"").split("|").map(c=>c.trim()).filter(Boolean);let m='<div class="cells-row">';for(const c of k)m+=`<div class="cell">${ge(c,s)}</div>`;m+="</div>",l+=m,r++;continue}if(h.startsWith("'")){const u=h.slice(1).trim();if(u.startsWith("#")){const k=(u.match(/^#+/)||[""])[0].length,m=u.slice(k).trim();l+=`<h${Math.min(k,6)}>${B(m)}</h${Math.min(k,6)}>`}else u.startsWith("---")?l+="<hr>":u.startsWith("- ")||u.startsWith("* ")?l+=`<li>${B(u.slice(2))}</li>`:l+=`<p class="comment">${B(u)}</p>`;r++;continue}const g=h.match(/^([A-Za-z_]\w*)\(([^)]*)\)\s*=\s*(.+)$/);if(g){const[,u,k,m]=g,c=k.split(",").map(w=>w.trim()).filter(Boolean);try{const w=te(m);s.userFunctions.set(u,{params:c,body:w}),l+=`<div class="line fn-def"><var>${u}</var>(${c.join(", ")}) = ${B(m)}</div>`}catch(w){l+=`<div class="line error">${h} → Error: ${w.message}</div>`}r++;continue}l+=ge(h,s,n),r++}return{html:l,env:s}}function De(e,t){const n=e.name,s=e.args;if(!s||s.length<3)return null;const o=s[0],l=o.type==="var"?o.name:null;if(!l)return null;const r=t.userFunctions.get(l);if(!r)return null;const b=M(r.body),_=r.params,h=(p,g)=>`<span class="dvr"><small>${g}</small><span class="nary"><em>∫</em></span><small>${p}</small></span>`;if(/^(integral|integrate)$/.test(n)&&s.length>=3){const p=M(s[1]),g=M(s[2]),u=_[0]||"x";return`${h(p,g)} (${b}) <i>d${u}</i>`}if(/^(integral2|integrate2|dblintegral)$/.test(n)&&s.length>=5){const p=M(s[1]),g=M(s[2]),u=M(s[3]),k=M(s[4]),m=_[0]||"x",c=_[1]||"y";return`${h(p,g)} ${h(u,k)} (${b}) <i>d${c}</i> <i>d${m}</i>`}if(/^(integral3|integrate3|tplintegral)$/.test(n)&&s.length>=7){const p=M(s[1]),g=M(s[2]),u=M(s[3]),k=M(s[4]),m=M(s[5]),c=M(s[6]),w=_[0]||"x",x=_[1]||"y",y=_[2]||"z";return`${h(p,g)} ${h(u,k)} ${h(m,c)} (${b}) <i>d${y}</i> <i>d${x}</i> <i>d${w}</i>`}return null}function ge(e,t,n){try{const s=te(e),o=de(s,t);if(s.type==="assign"){const l=oe(o);let r=`<var>${s.name}</var>`;if(s.indices){const _=s.indices.map(h=>M(h)).join(",");r+=`<sub>${_}</sub>`}if(n)return`<div class="line assign">${r} = ${l}</div>`;const b=s.expr;if(b.type==="call"&&/^(integral[23]?|integrate[23]?|dblintegral|tplintegral)$/.test(b.name)){const _=De(b,t);return _?`<div class="line assign eq">${r} = ${_} = ${l}</div>`:`<div class="line assign">${r} = ${l}</div>`}return`<div class="line assign">${r} = ${M(s.expr)} = ${l}</div>`}return n?`<div class="line expr">${oe(o)}</div>`:`<div class="line expr">${M(s)} = ${oe(o)}</div>`}catch(s){return`<div class="line error">${B(e)} <span class="err">← ${s.message}</span></div>`}}function ze(e,t,n){switch(e){case"eq":return Be(t,n||"");case"plot":return Fe(t);case"plotly":return qe(t);case"svg":return je(t);case"three":return Qe(t);default:return`<pre>${t.join(`
`)}</pre>`}}function Be(e,t){if(e.length===0)return"";let s=`<div class="eq-block" style="text-align:${/^(left|right|center)$/i.test(t)?t.toLowerCase():"center"};margin:8px 0;">`;for(const o of e){const l=o.trim();if(!l){s+='<div style="height:4px"></div>';continue}const r=l.match(/\((\d+(?:\.\d+)?[a-z]?)\)\s*$/);let b=l,_="";r&&(b=l.slice(0,r.index).trim(),_=r[1]),s+='<p class="eq" style="margin:4px 0;line-height:2.2;">',s+=Se(b),_&&(s+=`<span style="float:right;font-style:normal;margin-left:24px">(${_})</span>`),s+="</p>"}return s+"</div>"}function Fe(e){var k;let o=-5,l=5,r=-2,b=2;const _=[],h=[];for(const m of e){const c=m.trim();if(!c||c.startsWith("#")||c.startsWith("'"))continue;const w=c.match(/^x\s*=\s*([-\d.]+)\s*:\s*([-\d.]+)/);if(w){o=+w[1],l=+w[2];continue}const x=c.match(/^y\s*=\s*([-\d.]+)\s*:\s*([-\d.]+)/);if(x){r=+x[1],b=+x[2];continue}const y=c.match(/^y\s*=\s*(.+?)(\s*\|.*)?$/);if(y){const E=y[1].trim();let i="#2196f3",v=2,a="";if(y[2]){const f=y[2],$=f.match(/color:\s*(#[0-9A-Fa-f]{3,8}|\w+)/);$&&(i=$[1]);const L=f.match(/width:\s*(\d+)/);L&&(v=+L[1]);const R=f.match(/label:\s*"([^"]+)"/);R&&(a=R[1])}_.push({expr:E,color:i,width:v,label:a});continue}h.push(c)}const p=m=>50+(m-o)/(l-o)*500,g=m=>350-(m-r)/(b-r)*300;let u='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" style="max-width:600px;background:#fff;border:1px solid #ddd;">';u+='<g stroke="#e0e0e0" stroke-width="0.5">';for(let m=Math.ceil(o);m<=Math.floor(l);m++)u+=`<line x1="${p(m)}" y1="50" x2="${p(m)}" y2="350"/>`;for(let m=Math.ceil(r);m<=Math.floor(b);m++)u+=`<line x1="50" y1="${g(m)}" x2="550" y2="${g(m)}"/>`;u+="</g>",r<=0&&b>=0&&(u+=`<line x1="50" y1="${g(0)}" x2="550" y2="${g(0)}" stroke="#666" stroke-width="1"/>`),o<=0&&l>=0&&(u+=`<line x1="${p(0)}" y1="50" x2="${p(0)}" y2="350" stroke="#666" stroke-width="1"/>`),u+='<g font-size="10" fill="#888" text-anchor="middle">';for(let m=Math.ceil(o);m<=Math.floor(l);m++)m!==0&&(u+=`<text x="${p(m)}" y="365">${m}</text>`);for(let m=Math.ceil(r);m<=Math.floor(b);m++)m!==0&&(u+=`<text x="40" y="${g(m)+4}" text-anchor="end">${m}</text>`);u+="</g>";for(const m of _){const c=new ye,w=300,x=[];for(let y=0;y<=w;y++){const E=o+(l-o)*y/w;c.setVar("x",E);try{const i=te(m.expr),v=de(i,c);isFinite(v)&&v>=r-10&&v<=b+10&&x.push(`${p(E).toFixed(1)},${g(v).toFixed(1)}`)}catch{}}x.length>1&&(u+=`<polyline points="${x.join(" ")}" fill="none" stroke="${m.color}" stroke-width="${m.width}"/>`),m.label&&(u+=`<text x="545" y="${g(0)-5}" fill="${m.color}" font-size="12" text-anchor="end">${m.label}</text>`)}for(const m of h){const c=m.split(/\s+/),w=c[0];if(w==="rect"&&c.length>=5){const[,x,y,E,i]=c.map(Number),v=c[5]||"#e3f2fd",a=Math.min(p(x),p(E)),f=Math.min(g(y),g(i)),$=Math.abs(p(E)-p(x)),L=Math.abs(g(i)-g(y));u+=`<rect x="${a}" y="${f}" width="${$}" height="${L}" fill="${v}" opacity="0.3"/>`}else if(w==="point"&&c.length>=3){const x=+c[1],y=+c[2],E=c[3]||"#f44336",i=+(c[4]||"4");u+=`<circle cx="${p(x)}" cy="${g(y)}" r="${i}" fill="${E}"/>`}else if(w==="text"&&c.length>=4){const x=+c[1],y=+c[2],E=m.match(/"([^"]+)"/),i=E?E[1]:c.slice(3).join(" "),v=(k=c[c.length-1])!=null&&k.startsWith("#")?c[c.length-1]:"#333";u+=`<text x="${p(x)}" y="${g(y)}" fill="${v}" font-size="12">${i}</text>`}else if(w==="eq"&&c.length>=4){const x=+c[1],y=+c[2],E=m.match(/"([^"]+)"/),i=E?E[1]:c.slice(3).join(" ");u+=`<text x="${p(x)}" y="${g(y)}" fill="#333" font-size="13" font-style="italic">${i}</text>`}else if(w==="line"&&c.length>=5){const[,x,y,E,i]=c.map(Number),v=c[5]||"#333",a=c[6]||"1";u+=`<line x1="${p(x)}" y1="${g(y)}" x2="${p(E)}" y2="${g(i)}" stroke="${v}" stroke-width="${a}"/>`}else if(w==="arrow"&&c.length>=5){const[,x,y,E,i]=c.map(Number),v=c[5]||"#333",a=`arr${Math.random().toString(36).slice(2,6)}`;u+=`<defs><marker id="${a}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="${v}"/></marker></defs>`,u+=`<line x1="${p(x)}" y1="${g(y)}" x2="${p(E)}" y2="${g(i)}" stroke="${v}" stroke-width="1.5" marker-end="url(#${a})"/>`}else if(w==="proj"&&c.length>=3){const x=+c[1],y=+c[2],E=c[3]||"#999";u+=`<line x1="${p(x)}" y1="${g(y)}" x2="${p(x)}" y2="${g(0)}" stroke="${E}" stroke-width="0.8" stroke-dasharray="4,3"/>`,u+=`<line x1="${p(x)}" y1="${g(y)}" x2="${p(0)}" y2="${g(y)}" stroke="${E}" stroke-width="0.8" stroke-dasharray="4,3"/>`}else if(w==="hline"&&c.length>=2){const x=+c[1],y=c[2]||"#999";u+=`<line x1="50" y1="${g(x)}" x2="550" y2="${g(x)}" stroke="${y}" stroke-width="0.8" stroke-dasharray="5,3"/>`}else if(w==="vline"&&c.length>=2){const x=+c[1],y=c[2]||"#999";u+=`<line x1="${p(x)}" y1="50" x2="${p(x)}" y2="350" stroke="${y}" stroke-width="0.8" stroke-dasharray="5,3"/>`}else if(w==="dim"&&c.length>=5){const[,x,y,E,i]=c.map(Number),v=m.match(/"([^"]+)"/),a=v?v[1]:"",f=(p(x)+p(E))/2,$=(g(y)+g(i))/2;u+=`<line x1="${p(x)}" y1="${g(y)}" x2="${p(E)}" y2="${g(i)}" stroke="#666" stroke-width="1"/>`,u+=`<text x="${f}" y="${$-5}" fill="#666" font-size="11" text-anchor="middle">${a}</text>`}}return u+="</svg>",`<div class="plot-container">${u}</div>`}function qe(e){const t=`plotly_${Math.random().toString(36).slice(2,8)}`,n=e.join(`
`);return`<div id="${t}" style="width:100%;height:400px;"></div>
<script>if(window.Plotly){(function(){${n};Plotly.newPlot("${t}",data,layout||{})})()}else{document.getElementById("${t}").textContent="Plotly not loaded"}<\/script>`}function je(e){return`<div class="svg-container">${e.join(`
`)}</div>`}const Oe=new Set(["box","sphere","cylinder","cone","torus","plane","line","arrow","darrow","plate","slab","tube","pipe","node","carc3d","dim3d","axes","axeslabeled","axes_labeled","gridhelper","color","opacity","wireframe","metalness","roughness","reset","camera","background","light"]);function Ge(e){const t=[],n={};let s=null;for(let o=1;o<e.length;o++){const l=e[o];if(l.includes(":")){const r=l.indexOf(":");n[l.slice(0,r).toLowerCase()]=l.slice(r+1)}else{const r=parseFloat(l);isNaN(r)?s===null&&(s=l):t.push(r)}}return{pos:t,kv:n,text:s}}function We(e){const t=[];let n=0;for(;n<e.length;){if(e[n]===" "||e[n]==="	"){n++;continue}if(e[n]==='"'||e[n]==="'"){const s=e[n];let o=n+1;for(;o<e.length&&e[o]!==s;)o++;t.push(e.slice(n+1,o)),n=o+1}else{let s=n;for(;s<e.length&&e[s]!==" "&&e[s]!=="	";)s++;t.push(e.slice(n,s)),n=s}}return t}function X(e){return e?e.startsWith("#")?"0x"+e.slice(1):{red:"0xff0000",green:"0x00ff00",blue:"0x0000ff",white:"0xffffff",black:"0x000000",yellow:"0xffff00",cyan:"0x00ffff",magenta:"0xff00ff",orange:"0xff8800",gray:"0x888888",grey:"0x888888",brown:"0x8b4513",pink:"0xff69b4",purple:"0x800080"}[e.toLowerCase()]||"0x4488ff":"0x4488ff"}function Ne(e){const t=[];let n="#4488ff",s="1",o="false",l="0.1",r="0.5",b=0;const _=c=>X(c.color||n),h=c=>c.opacity||s,p=c=>c.wireframe||o,g=c=>c.metalness||l,u=c=>c.roughness||r,k=(c,w)=>{const x=w||_(c),y=h(c),E=p(c),i=parseFloat(y)<1?",transparent:true":"";return`new THREE.MeshStandardMaterial({color:${x},opacity:${y},wireframe:${E},metalness:${g(c)},roughness:${u(c)}${i}})`},m=(c,w,x,y)=>{const E=`_m${b++}`;if(t.push(`{const ${E}=new THREE.Mesh(${c},${k(w)});`),x.length>=3&&t.push(`${E}.position.set(${x[0]},${x[1]},${x[2]});`),y){const[i,v,a]=y.split(",").map(Number);t.push(`${E}.rotation.set(${(i||0)*Math.PI/180},${(v||0)*Math.PI/180},${(a||0)*Math.PI/180});`)}t.push(`scene.add(${E});}`)};for(const c of e){const w=c.trim();if(!w||w.startsWith("//"))continue;const x=We(w);if(x.length===0)continue;const y=x[0].toLowerCase();if(!Oe.has(y)){t.push(w);continue}const{pos:E,kv:i,text:v}=Ge(x),a=f=>f<E.length?E[f]:0;switch(y){case"color":n=x[1]||"#4488ff";break;case"opacity":s=x[1]||"1";break;case"wireframe":o=x[1]||"true";break;case"metalness":l=x[1]||"0.1";break;case"roughness":r=x[1]||"0.5";break;case"reset":n="#4488ff",s="1",o="false",l="0.1",r="0.5";break;case"camera":{if(E.length>=3&&t.push(`camera.position.set(${a(0)},${a(1)},${a(2)});`),i.lookat){const[f,$,L]=i.lookat.split(",").map(Number);t.push(`camera.lookAt(${f||0},${$||0},${L||0});`)}i.fov&&t.push(`camera.fov=${i.fov};camera.updateProjectionMatrix();`);break}case"background":t.push(`scene.background=new THREE.Color(${X(x[1]||"#f5f5f5")});`);break;case"light":{const f=X(i.color||"#ffffff"),$=i.intensity||"0.8";E.length>=3?t.push(`{const _l=new THREE.DirectionalLight(${f},${$});_l.position.set(${a(0)},${a(1)},${a(2)});scene.add(_l);}`):t.push(`{const _l=new THREE.DirectionalLight(${f},${$});_l.position.set(5,10,7);scene.add(_l);}`);break}case"gridhelper":{const f=i.size||"10",$=i.divisions||"10";t.push(`scene.add(new THREE.GridHelper(${f},${$}));`);break}case"box":{const f=i.size?i.size.split(",").map(Number):[1,1,1];m(`new THREE.BoxGeometry(${f[0]||1},${f[1]||1},${f[2]||1})`,i,[a(0),a(1),a(2)],i.rotation);break}case"sphere":{const f=i.r||i.radius||"0.5",$=i.segments||"32";m(`new THREE.SphereGeometry(${f},${$},${$})`,i,[a(0),a(1),a(2)]);break}case"cylinder":{const f=i.rtop||i.r||"0.5",$=i.rbottom||i.r||"0.5",L=i.h||i.height||"1",R=i.segments||"32";m(`new THREE.CylinderGeometry(${f},${$},${L},${R})`,i,[a(0),a(1),a(2)],i.rotation);break}case"cone":{const f=i.r||i.radius||"0.5",$=i.h||i.height||"1";m(`new THREE.ConeGeometry(${f},${$},32)`,i,[a(0),a(1),a(2)],i.rotation);break}case"torus":{const f=i.r||"1",$=i.tube||"0.3";m(`new THREE.TorusGeometry(${f},${$},16,48)`,i,[a(0),a(1),a(2)],i.rotation);break}case"plane":{const f=i.width||i.w||"5",$=i.height||i.h||"5";m(`new THREE.PlaneGeometry(${f},${$})`,i,[a(0),a(1),a(2)],i.rotation||"-90,0,0");break}case"plate":case"slab":{const f=i.w||i.width||"2",$=i.d||i.depth||"2",L=i.t||i.thickness||"0.2";m(`new THREE.BoxGeometry(${f},${L},${$})`,i,[a(0),a(1),a(2)],i.rotation);break}case"line":{const f=_(i),$=i.width||"2";t.push(`{const _pts=[new THREE.Vector3(${a(0)},${a(1)},${a(2)}),new THREE.Vector3(${a(3)},${a(4)},${a(5)})];`),t.push("const _g=new THREE.BufferGeometry().setFromPoints(_pts);"),t.push(`const _l=new THREE.Line(_g,new THREE.LineBasicMaterial({color:${f},linewidth:${$}}));scene.add(_l);}`);break}case"arrow":{const f=_(i),$=i.length,L=a(3)-a(0),R=a(4)-a(1),C=a(5)-a(2),O=$||`Math.sqrt(${L*L+R*R+C*C})`;t.push(`{const _dir=new THREE.Vector3(${L},${R},${C}).normalize();`),t.push(`const _a=new THREE.ArrowHelper(_dir,new THREE.Vector3(${a(0)},${a(1)},${a(2)}),${O},${f});scene.add(_a);}`);break}case"darrow":{const f=_(i),$=a(3)-a(0),L=a(4)-a(1),R=a(5)-a(2),C=`Math.sqrt(${$}*${$}+${L}*${L}+${R}*${R})`;t.push(`{const _d=new THREE.Vector3(${$},${L},${R}).normalize();`),t.push(`const _a1=new THREE.ArrowHelper(_d,new THREE.Vector3(${a(0)},${a(1)},${a(2)}),${C},${f},${C}*0.12,${C}*0.06);scene.add(_a1);`),t.push(`const _a2=new THREE.ArrowHelper(_d.clone().negate(),new THREE.Vector3(${a(3)},${a(4)},${a(5)}),${C},${f},${C}*0.12,${C}*0.06);scene.add(_a2);}`);break}case"tube":case"pipe":{const f=i.r||i.radius||"0.05",$=i.segments||"8";t.push(`{const _p=new THREE.LineCurve3(new THREE.Vector3(${a(0)},${a(1)},${a(2)}),new THREE.Vector3(${a(3)},${a(4)},${a(5)}));`),t.push(`const _g=new THREE.TubeGeometry(_p,1,${f},${$},false);`),t.push(`const _m=new THREE.Mesh(_g,${k(i)});scene.add(_m);}`);break}case"node":{const f=i.r||"0.1",$=v||i.label||"";if(t.push(`{const _g=new THREE.SphereGeometry(${f},16,16);`),t.push(`const _m=new THREE.Mesh(_g,${k(i,X(i.color||"white"))});`),t.push(`_m.position.set(${a(0)},${a(1)},${a(2)});scene.add(_m);`),$){const L=i.size||"48";t.push('const _c=document.createElement("canvas");_c.width=128;_c.height=64;'),t.push('const _cx=_c.getContext("2d");_cx.fillStyle="white";_cx.fillRect(0,0,128,64);'),t.push('_cx.strokeStyle="black";_cx.strokeRect(0,0,128,64);'),t.push(`_cx.font="bold ${L}px sans-serif";_cx.fillStyle="black";_cx.textAlign="center";_cx.textBaseline="middle";`),t.push(`_cx.fillText("${$}",64,32);`),t.push("const _t=new THREE.CanvasTexture(_c);const _sm=new THREE.SpriteMaterial({map:_t});"),t.push(`const _s=new THREE.Sprite(_sm);_s.position.set(${a(0)},${a(1)}+${parseFloat(f)*2},${a(2)});_s.scale.set(0.5,0.25,1);scene.add(_s);`)}t.push("}");break}case"axes":case"axeslabeled":case"axes_labeled":{const f=i.length||i.l||"3";if(t.push(`{const _ax=new THREE.AxesHelper(${f});`),E.length>=3&&t.push(`_ax.position.set(${a(0)},${a(1)},${a(2)});`),t.push("scene.add(_ax);"),y!=="axes"){const $=(L,R,C,O,U)=>{t.push('{const _c=document.createElement("canvas");_c.width=64;_c.height=64;'),t.push(`const _x=_c.getContext("2d");_x.font="bold 48px sans-serif";_x.fillStyle="${U}";_x.textAlign="center";_x.textBaseline="middle";_x.fillText("${L}",32,32);`),t.push("const _s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(_c)}));"),t.push(`_s.position.set(${R},${C},${O});_s.scale.set(0.4,0.4,1);scene.add(_s);}`)};$(i.xlabel||"X",`${f}*1.1`,"0","0","red"),$(i.ylabel||"Y","0",`${f}*1.1`,"0","green"),$(i.zlabel||"Z","0","0",`${f}*1.1`,"blue")}t.push("}");break}case"carc3d":{const f=i.r||"1",$=parseFloat(i.start||"0"),L=parseFloat(i.end||"270"),R=_(i),C=$*Math.PI/180,O=L*Math.PI/180,U=i.segments||"64";t.push("{const _pts=[];"),t.push(`for(let i=0;i<=${U};i++){const a=${C}+(${O}-${C})*i/${U};_pts.push(new THREE.Vector3(${f}*Math.cos(a)+${a(0)},${a(1)},${f}*Math.sin(a)+${a(2)}));}`),t.push("const _g=new THREE.BufferGeometry().setFromPoints(_pts);"),t.push(`scene.add(new THREE.Line(_g,new THREE.LineBasicMaterial({color:${R}})));`);const Ce=i.headlength||"0.15",Pe=i.headradius||"0.06";t.push(`const _ea=${O};const _ex=${f}*Math.cos(_ea)+${a(0)},_ez=${f}*Math.sin(_ea)+${a(2)};`),t.push(`const _cg=new THREE.ConeGeometry(${Pe},${Ce},12);`),t.push(`const _cm=new THREE.Mesh(_cg,new THREE.MeshStandardMaterial({color:${R}}));`),t.push(`_cm.position.set(_ex,${a(1)},_ez);`),t.push("_cm.rotation.z=Math.PI/2;_cm.rotation.y=-_ea-Math.PI/2;scene.add(_cm);}");break}case"dim3d":{const f=_(i),$=v||i.text||"";t.push(`{const _p1=new THREE.Vector3(${a(0)},${a(1)},${a(2)}),_p2=new THREE.Vector3(${a(3)},${a(4)},${a(5)});`),t.push("const _g=new THREE.BufferGeometry().setFromPoints([_p1,_p2]);"),t.push(`scene.add(new THREE.Line(_g,new THREE.LineBasicMaterial({color:${f}})));`),t.push("const _d=_p2.clone().sub(_p1);const _l=_d.length();const _dn=_d.normalize();"),t.push(`scene.add(new THREE.ArrowHelper(_dn,_p1,_l,${f},_l*0.08,_l*0.04));`),$&&(t.push("const _mid=_p1.clone().add(_p2).multiplyScalar(0.5);"),t.push('const _c=document.createElement("canvas");_c.width=256;_c.height=64;'),t.push('const _x=_c.getContext("2d");_x.fillStyle="white";_x.fillRect(0,0,256,64);'),t.push('_x.font="bold 32px sans-serif";_x.fillStyle="black";_x.textAlign="center";_x.textBaseline="middle";'),t.push(`_x.fillText("${$}",128,32);`),t.push("const _s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(_c)}));"),t.push("_s.position.copy(_mid);_s.position.y+=0.2;_s.scale.set(1,0.25,1);scene.add(_s);")),t.push("}");break}default:t.push(w);break}}return t.join(`
`)}function Qe(e){const t=`three_${Math.random().toString(36).slice(2,8)}`,n=Ne(e);return`<div id="${t}" style="width:100%;height:400px;border:1px solid #ddd;"></div>
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
})();<\/script>`}function Ve(e,t,n){const s=e[t].trim(),o=s.match(/^#?for\s+(\w+)\s*=\s*(.*?)\s+to\s+(.*?)(?:\s*:\s*(.+))?\s*$/i);if(!o)return{html:`<div class="error">Invalid for: ${s}</div>`,nextLine:t+1};const l=o[1],r=W(o[2],n),b=W(o[3],n),_=o[4]?W(o[4],n):1,h=[];let p=t+1,g=1;for(;p<e.length;){const k=e[p].trim();if(/^#?for\s+/i.test(k)&&g++,/^#?next\s*$/i.test(k)&&(g--,g===0)){p++;break}h.push(e[p]),p++}let u="";for(let k=r;_>0?k<=b:k>=b;k+=_){n.setVar(l,k);const m=V(h.join(`
`),n,!0);u+=m.html}return{html:u,nextLine:p}}function Ke(e,t,n){const s=[];let o={cond:e[t].trim().replace(/^#?if\s+/i,""),body:[]},l=t+1,r=1;for(;l<e.length;){const b=e[l].trim();if(/^#?if\s+/i.test(b)){r++,o.body.push(e[l]),l++;continue}if(/^#?end\s+if\s*$/i.test(b)){if(r--,r===0){s.push(o),l++;break}o.body.push(e[l]),l++;continue}if(r===1&&/^#?else\s+if\s+/i.test(b)){s.push(o),o={cond:b.replace(/^#?else\s+if\s+/i,""),body:[]},l++;continue}if(r===1&&/^#?else\s*$/i.test(b)){s.push(o),o={cond:null,body:[]},l++;continue}o.body.push(e[l]),l++}for(const b of s)if(b.cond===null||W(b.cond,n))return{html:V(b.body.join(`
`),n).html,nextLine:l};return{html:"",nextLine:l}}function Ue(e,t,n){const s=e[t].trim().replace(/^#?while\s+/i,""),o=[];let l=t+1,r=1;for(;l<e.length;){const h=e[l].trim();if(/^#?while\s+/i.test(h)&&r++,/^#?loop\s*$/i.test(h)&&(r--,r===0)){l++;break}o.push(e[l]),l++}let b="",_=0;for(;W(s,n)&&_<1e4;){const h=V(o.join(`
`),n);b+=h.html,_++}return{html:b,nextLine:l}}function Xe(e,t,n){const s=[];let o=t+1,l="",r=1;for(;o<e.length;){const h=e[o].trim();if(/^#?repeat\s*$/i.test(h)&&r++,/^#?until\s+/i.test(h)&&(r--,r===0)){l=h.replace(/^#?until\s+/i,""),o++;break}s.push(e[o]),o++}let b="",_=0;do{const h=V(s.join(`
`),n);b+=h.html,_++}while(!W(l,n)&&_<1e4);return{html:b,nextLine:o}}function W(e,t){try{const n=te(e),s=de(n,t);return typeof s=="number"?s:NaN}catch{return 0}}const Ye=`# Ejemplo 5.1 - Analisis de Grid Frame
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
`,Je=`# Calculo Basico
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
A = pi*r^2`,Ze=`# Grafico con anotaciones
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
@{end plot}`,et=`# Ecuaciones Formateadas
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
@{end eq}`,tt=`# FEM Assembly
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
u3 = F3/k`,nt=`# Operaciones con Vectores
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
sz = 0 + 5`,st=`# Dibujo SVG
@{svg}
<svg viewBox="0 0 400 300" style="max-width:400px;background:#fff;border:1px solid #ddd;">
  <rect x="50" y="50" width="300" height="200" fill="none" stroke="#333" stroke-width="2"/>
  <circle cx="200" cy="150" r="60" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <line x1="50" y1="150" x2="350" y2="150" stroke="#999" stroke-dasharray="5,3"/>
  <line x1="200" y1="50" x2="200" y2="250" stroke="#999" stroke-dasharray="5,3"/>
  <text x="200" y="30" text-anchor="middle" font-size="14" fill="#333">Dibujo SVG</text>
</svg>
@{end svg}`,ot=`# Escena 3D con Three.js
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
@{end three}`,lt=`# Control de Flujo
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
next`,it=`# Integracion Numerica (Gauss-Legendre)
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
I_6 = integral3(q, 0, 2, 0, 2, 0, 2)`,ue={calculo:{name:"Calculo Basico",code:Je},plot:{name:"@{plot} Graficos",code:Ze},eq_demo:{name:"@{eq} Ecuaciones",code:et},integral:{name:"Integrales",code:it},fem:{name:"FEM Assembly",code:tt},vectores:{name:"Vectores",code:nt},control:{name:"Control de Flujo",code:lt},three:{name:"@{three} 3D",code:ot},svg:{name:"@{svg} Dibujo",code:st},grid_frame:{name:"Grid Frame (Paz 5.1)",code:Ye}},d=document.getElementById("codeInput"),P=document.getElementById("output"),re=document.getElementById("btnRun"),le=document.getElementById("statusText"),Y=document.getElementById("exampleSelect"),rt=document.getElementById("chkAutoRun"),ae=document.getElementById("splitter"),xe=document.getElementById("inputFrame"),at=document.getElementById("outputFrame"),ct=document.getElementById("rulerH"),dt=document.getElementById("rulerV"),be=document.getElementById("keypadContent"),Ee=document.getElementById("lineNumbers"),Q=document.getElementById("syntaxLayer"),he=document.getElementById("findBar"),F=document.getElementById("findInput"),me=document.getElementById("replaceInput"),J=document.getElementById("findCount"),q=document.getElementById("acPopup");for(const[e,t]of Object.entries(ue)){const n=document.createElement("option");n.value=e,n.textContent=t.name,Y.appendChild(n)}Y.addEventListener("change",()=>{const e=ue[Y.value];e&&(d.value=e.code,D(),j(),A())});let S=null;function A(){const e=d.value;if(!e.trim()){P.innerHTML="";return}le.textContent="Procesando...",re.disabled=!0;try{const t=V(e);P.innerHTML=`<div class="output-page">${t.html}</div>`,le.textContent="Listo",K()}catch(t){P.innerHTML=`<div class="output-page"><div class="line error">Error: ${t.message}</div></div>`,le.textContent="Error"}re.disabled=!1}re.addEventListener("click",A);d.addEventListener("keydown",e=>{if(q.classList.contains("open")){if(e.key==="ArrowDown"){e.preventDefault(),z=(z+1)%I.length,ce();return}if(e.key==="ArrowUp"){e.preventDefault(),z=(z-1+I.length)%I.length,ce();return}if(e.key==="Enter"||e.key==="Tab"){e.preventDefault(),Le();return}if(e.key==="Escape"){Z();return}}if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault(),A();return}if(e.key==="F5"){e.preventDefault(),A();return}if(e.key==="f"&&(e.ctrlKey||e.metaKey)){e.preventDefault(),_e(!1);return}if(e.key==="h"&&(e.ctrlKey||e.metaKey)){e.preventDefault(),_e(!0);return}if(e.key==="Escape"&&he.classList.contains("open")){se();return}if(e.key==="q"&&(e.ctrlKey||e.metaKey)&&!e.shiftKey){e.preventDefault(),Te();return}if(e.key==="q"&&(e.ctrlKey||e.metaKey)&&e.shiftKey){e.preventDefault(),Re();return}if(e.key==="Tab"){e.preventDefault();const t=d.selectionStart,n=d.selectionEnd;d.value=d.value.substring(0,t)+"  "+d.value.substring(n),d.selectionStart=d.selectionEnd=t+2}});d.addEventListener("input",()=>{gt(),S&&clearTimeout(S),S=setTimeout(A,400)});function D(){const e=d.value,t=e.split(`
`).length,n=d.selectionStart,s=e.substring(0,n).split(`
`).length;let o="";for(let l=1;l<=t;l++)o+=`<div${l===s?' class="active"':""}>${l}</div>`;Ee.innerHTML=o}function ut(){Ee.scrollTop=d.scrollTop}d.addEventListener("scroll",ut);d.addEventListener("input",D);d.addEventListener("click",D);d.addEventListener("keyup",D);function j(){const t=d.value.split(`
`);let n=!1;const s=[];for(const o of t){const l=o.trimStart();if(/^@\{(?!end)/.test(l)&&(n=!0),/^@\{end\s/.test(l)){s.push(G(o,"syn-block")),n=!1;continue}if(/^@\{/.test(l)){s.push(G(o,"syn-block"));continue}if(n){s.push(ne(o));continue}if(/^#{1,6}\s/.test(l)){s.push(G(o,"syn-heading"));continue}if(l.startsWith(">")){s.push(G(o,"syn-comment"));continue}if(l.startsWith("'")){s.push(G(o,"syn-comment"));continue}if(/^#?(for|next|if|else|end if|repeat|loop|break|continue|while|do)\b/i.test(l)){s.push(G(o,"syn-keyword"));continue}s.push(ht(o))}Q.innerHTML=s.join(`
`),Q.scrollTop=d.scrollTop,Q.scrollLeft=d.scrollLeft}function ne(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function G(e,t){return`<span class="${t}">${ne(e)}</span>`}function ht(e){return ne(e).replace(/\b(\d+\.?\d*([eE][+-]?\d+)?)\b/g,'<span class="syn-number">$1</span>').replace(/\b(sin|cos|tan|asin|acos|atan|atan2|sqrt|cbrt|ln|log|exp|abs|round|floor|ceiling|min|max|mod|gcd|lcm|sum|product|integral|transpose|lsolve|det|inv|identity|matrix)\b/g,'<span class="syn-function">$1</span>')}d.addEventListener("input",j);d.addEventListener("scroll",()=>{Q.scrollTop=d.scrollTop,Q.scrollLeft=d.scrollLeft});let T=[],H=-1;function _e(e=!1){he.classList.add("open");const t=document.getElementById("replaceRow");t.style.display=e?"flex":"none",F.focus();const n=d.value.substring(d.selectionStart,d.selectionEnd);n&&!n.includes(`
`)&&(F.value=n),F.select(),N()}function se(){he.classList.remove("open"),T=[],H=-1,J.textContent="",d.focus()}function N(){const e=F.value;if(!e){T=[],H=-1,J.textContent="";return}const t=document.getElementById("findCase").checked,n=document.getElementById("findRegex").checked;T=[];const s=d.value;try{if(n){const o=t?"g":"gi",l=new RegExp(e,o);let r;for(;(r=l.exec(s))!==null;)T.push({start:r.index,end:r.index+r[0].length}),r[0].length===0&&l.lastIndex++}else{const o=t?s:s.toLowerCase(),l=t?e:e.toLowerCase();let r=0;for(;(r=o.indexOf(l,r))!==-1;)T.push({start:r,end:r+e.length}),r+=e.length}}catch{}if(T.length>0){const o=d.selectionStart;H=T.findIndex(l=>l.start>=o),H===-1&&(H=0),pe()}else H=-1;fe()}function pe(){if(H<0||H>=T.length)return;const e=T[H];d.selectionStart=e.start,d.selectionEnd=e.end,d.focus();const t=d.value.substring(0,e.start).split(`
`).length,n=parseFloat(getComputedStyle(d).lineHeight)||20;d.scrollTop=Math.max(0,(t-5)*n)}function fe(){T.length===0?J.textContent=F.value?"0/0":"":J.textContent=`${H+1}/${T.length}`}function we(){T.length!==0&&(H=(H+1)%T.length,pe(),fe())}function ke(){T.length!==0&&(H=(H-1+T.length)%T.length,pe(),fe())}function mt(){if(H<0||H>=T.length)return;const e=T[H],t=d.value;d.value=t.substring(0,e.start)+me.value+t.substring(e.end),N(),D(),j()}function pt(){if(T.length===0)return;let e=d.value;for(let t=T.length-1;t>=0;t--){const n=T[t];e=e.substring(0,n.start)+me.value+e.substring(n.end)}d.value=e,N(),D(),j()}F.addEventListener("input",N);document.getElementById("findNext").addEventListener("click",we);document.getElementById("findPrev").addEventListener("click",ke);document.getElementById("replaceOne").addEventListener("click",mt);document.getElementById("replaceAll").addEventListener("click",pt);document.getElementById("findClose").addEventListener("click",se);document.getElementById("findCase").addEventListener("change",N);document.getElementById("findRegex").addEventListener("change",N);F.addEventListener("keydown",e=>{e.key==="Enter"&&(e.preventDefault(),e.shiftKey?ke():we()),e.key==="Escape"&&se()});me.addEventListener("keydown",e=>{e.key==="Escape"&&se()});const ft=[...["sin","cos","tan","asin","acos","atan","atan2","sqrt","cbrt","ln","log","log2","exp","abs","round","floor","ceiling","min","max","mod","gcd","lcm","sum","product","integral","transpose","lsolve","det","inv","identity","matrix","sign","fact","comb","perm"].map(e=>({word:e+"(",kind:"fn"})),...["pi","e","inf"].map(e=>({word:e,kind:"const"})),...["for","next","if","else","end if","repeat","loop","break","continue","while","do"].map(e=>({word:e,kind:"kw"})),...["@{eq}","@{end eq}","@{plot}","@{end plot}","@{svg}","@{end svg}","@{three}","@{end three}","@{draw}","@{end draw}","@{html}","@{end html}","@{css}","@{end css}","@{markdown}","@{end markdown}","@{python}","@{end python}","@{bash}","@{end bash}","@{js}","@{end js}","@{columns 2}","@{end columns}","@{table}","@{end table}","@{function}","@{end function}","@{pagebreak}"].map(e=>({word:e,kind:"block"})),...["alpha","beta","gamma","delta","epsilon","zeta","eta","theta","lambda","mu","nu","xi","rho","sigma","tau","phi","psi","omega","Gamma","Delta","Theta","Lambda","Sigma","Phi","Psi","Omega"].map(e=>({word:e,kind:"greek"}))];let z=0,I=[];function ve(){const e=d.selectionStart,t=d.value;let n=e;for(;n>0&&/[\w@{#.]/.test(t[n-1]);)n--;return{word:t.substring(n,e),start:n}}function gt(){const{word:e,start:t}=ve();if(e.length<2){Z();return}const n=e.toLowerCase();if(I=ft.filter(g=>g.word.toLowerCase().startsWith(n)&&g.word!==e),I.length===0){Z();return}z=0,ce(),d.getBoundingClientRect();const o=d.value.substring(0,t).split(`
`),l=parseFloat(getComputedStyle(d).lineHeight)||20,r=o.length,b=o[o.length-1].length,_=7.8,h=r*l-d.scrollTop+2,p=b*_-d.scrollLeft+50;q.style.top=`${h}px`,q.style.left=`${p}px`,q.classList.add("open")}function ce(){q.innerHTML=I.map((e,t)=>`<div class="ac-item${t===z?" selected":""}" data-idx="${t}">
      <span>${ne(e.word)}</span>
      <span class="ac-kind">${e.kind}</span>
    </div>`).join("")}function Z(){q.classList.remove("open"),I=[]}function Le(){if(I.length===0)return;const e=I[z],{start:t}=ve(),n=d.value,s=d.selectionStart;d.value=n.substring(0,t)+e.word+n.substring(s),d.selectionStart=d.selectionEnd=t+e.word.length,Z(),D(),j(),S&&clearTimeout(S),S=setTimeout(A,400)}q.addEventListener("click",e=>{const t=e.target.closest(".ac-item");t&&(z=parseInt(t.dataset.idx),Le())});function xt(e){const t=e.replace(/\\n/g,`
`),n=d.selectionStart,s=d.selectionEnd;d.value=d.value.substring(0,n)+t+d.value.substring(s),d.selectionStart=d.selectionEnd=n+t.length,d.focus(),D(),j(),S&&clearTimeout(S),S=setTimeout(A,400)}document.addEventListener("click",e=>{const t=e.target.closest("[data-insert]");t&&xt(t.dataset.insert)});document.addEventListener("click",e=>{e.target.closest(".menu-item")||document.querySelectorAll(".menu-item").forEach(n=>n.classList.remove("open"))});document.querySelectorAll(".menu-dropdown button[data-action]").forEach(e=>{e.addEventListener("click",()=>{const t=e.dataset.action;switch(document.querySelectorAll(".menu-item").forEach(n=>n.classList.remove("open")),t){case"new":d.value="",P.innerHTML="";break;case"save":ie(d.value,"document.hcalc","text/plain");break;case"saveas":ie(d.value,"document.hcalc","text/plain");break;case"open":bt();break;case"export-html":ie(P.innerHTML,"output.html","text/html");break;case"undo":document.execCommand("undo");break;case"redo":document.execCommand("redo");break;case"selectall":d.select();break;case"comment":Te();break;case"uncomment":Re();break}})});function ie(e,t,n){const s=new Blob([e],{type:n}),o=document.createElement("a");o.href=URL.createObjectURL(s),o.download=t,o.click(),URL.revokeObjectURL(o.href)}function bt(){const e=document.createElement("input");e.type="file",e.accept=".hcalc,.cpd,.txt",e.onchange=()=>{var s;const t=(s=e.files)==null?void 0:s[0];if(!t)return;const n=new FileReader;n.onload=()=>{d.value=n.result,rt.checked&&A()},n.readAsText(t)},e.click()}function Te(){const e=d.selectionStart,t=d.selectionEnd,n=d.value,o=n.substring(0,e).lastIndexOf(`
`)+1,l=n.indexOf(`
`,t),r=l===-1?n.length:l,_=n.substring(o,r).split(`
`).map(h=>"'"+h).join(`
`);d.value=n.substring(0,o)+_+n.substring(r),d.selectionStart=o,d.selectionEnd=o+_.length}function Re(){const e=d.selectionStart,t=d.selectionEnd,n=d.value,o=n.substring(0,e).lastIndexOf(`
`)+1,l=n.indexOf(`
`,t),r=l===-1?n.length:l,_=n.substring(o,r).split(`
`).map(h=>h.startsWith("'")?h.slice(1):h).join(`
`);d.value=n.substring(0,o)+_+n.substring(r),d.selectionStart=o,d.selectionEnd=o+_.length}let ee=!1;ae.addEventListener("mousedown",e=>{ee=!0,ae.classList.add("dragging"),e.preventDefault()});document.addEventListener("mousemove",e=>{if(!ee)return;const n=xe.parentElement.getBoundingClientRect(),s=e.clientX-n.left,o=n.width-6,l=Math.max(15,Math.min(85,s/o*100));xe.style.flex=`0 0 ${l}%`,at.style.flex=`0 0 ${100-l}%`,K()});document.addEventListener("mouseup",()=>{ee&&(ee=!1,ae.classList.remove("dragging"))});const _t=96,He=_t/2.54;function K(){$t(),yt()}function $t(){const e=ct,t=e.parentElement;e.width=t.clientWidth-18;const n=e.getContext("2d"),s=e.width,o=e.height;n.fillStyle="#F5F5F5",n.fillRect(0,0,s,o),n.strokeStyle="#AAA",n.fillStyle="#888",n.font="9px Segoe UI",n.textAlign="center";const r=P.scrollLeft||0,b=He,_=Math.floor(r/b),h=Math.ceil((r+s)/b);for(let p=_;p<=h;p++){const g=p*b-r;g<0||g>s||(n.beginPath(),p%5===0?(n.moveTo(g,o),n.lineTo(g,o-10),n.stroke(),n.fillText(`${p}`,g,10)):(n.moveTo(g,o),n.lineTo(g,o-5),n.stroke()))}n.beginPath(),n.moveTo(0,o-.5),n.lineTo(s,o-.5),n.stroke()}function yt(){const e=dt,t=e.parentElement;e.height=t.clientHeight-18;const n=e.getContext("2d"),s=e.width,o=e.height;n.fillStyle="#F5F5F5",n.fillRect(0,0,s,o),n.strokeStyle="#AAA",n.fillStyle="#888",n.font="9px Segoe UI",n.textAlign="center";const l=P.scrollTop||0,r=He,b=Math.floor(l/r),_=Math.ceil((l+o)/r);for(let h=b;h<=_;h++){const p=h*r-l;p<0||p>o||(n.beginPath(),h%5===0?(n.moveTo(s,p),n.lineTo(s-10,p),n.stroke(),n.save(),n.translate(9,p),n.rotate(-Math.PI/2),n.fillText(`${h}`,0,0),n.restore()):(n.moveTo(s,p),n.lineTo(s-5,p),n.stroke()))}n.beginPath(),n.moveTo(s-.5,0),n.lineTo(s-.5,o),n.stroke()}P.addEventListener("scroll",K);window.addEventListener("resize",K);setTimeout(K,100);const Et={greek:[{label:"α",insert:"alpha"},{label:"β",insert:"beta"},{label:"γ",insert:"gamma"},{label:"δ",insert:"delta"},{label:"ε",insert:"epsilon"},{label:"ζ",insert:"zeta"},{label:"η",insert:"eta"},{label:"θ",insert:"theta"},{label:"λ",insert:"lambda"},{label:"μ",insert:"mu"},{label:"ν",insert:"nu"},{label:"ξ",insert:"xi"},{label:"π",insert:"pi"},{label:"ρ",insert:"rho"},{label:"σ",insert:"sigma"},{label:"τ",insert:"tau"},{label:"φ",insert:"phi"},{label:"ψ",insert:"psi"},{label:"ω",insert:"omega"},{label:"Γ",insert:"Gamma"},{label:"Δ",insert:"Delta"},{label:"Θ",insert:"Theta"},{label:"Λ",insert:"Lambda"},{label:"Σ",insert:"Sigma"},{label:"Φ",insert:"Phi"},{label:"Ψ",insert:"Psi"},{label:"Ω",insert:"Omega"}],operators:[{label:"+",insert:" + "},{label:"−",insert:" - "},{label:"×",insert:"*"},{label:"÷",insert:"/"},{label:"^",insert:"^"},{label:"!",insert:"!"},{label:"√",insert:"sqrt("},{label:"∛",insert:"cbrt("},{label:"≡",insert:" == "},{label:"≠",insert:" != "},{label:"<",insert:" < "},{label:">",insert:" > "},{label:"≤",insert:" <= "},{label:"≥",insert:" >= "},{label:"∧",insert:" && "},{label:"∨",insert:" || "},{label:"∑",insert:"sum("},{label:"∏",insert:"product("},{label:"∫",insert:"integral("}],functions:[{label:"sin",insert:"sin("},{label:"cos",insert:"cos("},{label:"tan",insert:"tan("},{label:"asin",insert:"asin("},{label:"acos",insert:"acos("},{label:"atan",insert:"atan("},{label:"ln",insert:"ln("},{label:"log",insert:"log("},{label:"exp",insert:"exp("},{label:"abs",insert:"abs("},{label:"sqrt",insert:"sqrt("},{label:"cbrt",insert:"cbrt("},{label:"round",insert:"round("},{label:"floor",insert:"floor("},{label:"ceil",insert:"ceiling("},{label:"min",insert:"min("},{label:"max",insert:"max("},{label:"mod",insert:"mod("},{label:"gcd",insert:"gcd("},{label:"lcm",insert:"lcm("}],blocks:[{label:"@{eq}",insert:"@{eq}\\n\\n@{end eq}"},{label:"@{plot}",insert:"@{plot}\\n\\n@{end plot}"},{label:"@{svg}",insert:"@{svg}\\n\\n@{end svg}"},{label:"@{three}",insert:"@{three}\\n\\n@{end three}"},{label:"@{draw}",insert:"@{draw}\\n\\n@{end draw}"},{label:"@{html}",insert:"@{html}\\n\\n@{end html}"},{label:"@{python}",insert:"@{python}\\n\\n@{end python}"},{label:"@{bash}",insert:"@{bash}\\n\\n@{end bash}"},{label:"@{js}",insert:"@{js}\\n\\n@{end js}"},{label:"@{columns}",insert:"@{columns 2}\\n\\n@{end columns}"},{label:"for",insert:"for i = 1 to 10\\n\\nnext"},{label:"if",insert:"if x > 0\\n\\nelse\\n\\nend if"}]};function Me(e){be.innerHTML="";const t=Et[e]||[];for(const n of t){const s=document.createElement("button");s.className=n.label.length>3?"key-btn wide":"key-btn",s.textContent=n.label,s.dataset.insert=n.insert,s.title=n.insert.replace(/\\n/g,"↵"),be.appendChild(s)}}document.querySelectorAll(".keypad-tab").forEach(e=>{e.addEventListener("click",()=>{document.querySelectorAll(".keypad-tab").forEach(t=>t.classList.remove("active")),e.classList.add("active"),Me(e.dataset.tab)})});Me("greek");var $e;($e=document.getElementById("btnPrint"))==null||$e.addEventListener("click",()=>{const e=window.open("","_blank");e&&(e.document.write(`<!DOCTYPE html><html><head><title>Hekatan Calc Output</title>
    <style>body{font-family:'Segoe UI',sans-serif;padding:30px 40px;}</style></head>
    <body>${P.innerHTML}</body></html>`),e.document.close(),e.print())});d.value=ue.calculo.code;Y.value="calculo";D();j();A();
