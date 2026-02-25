        /// <summary>
        /// Generates a synchronized Canvas animation with mass-spring-damper,
        /// phasor spiral, and sinusoidal waveform — all driven by requestAnimationFrame.
        /// Parameters: xi1, xi2 (damping ratios), label1, label2, title, wn
        /// </summary>
        private string GenerateSpringAnimation(int w, int h, Dictionary<string, string> p)
        {
            var title = p.GetValueOrDefault("title", "Animacion Sincronizada");
            var xi1 = p.GetValueOrDefault("xi1", p.GetValueOrDefault("xi", "0.125"));
            var xi2 = p.GetValueOrDefault("xi2", "0.5");
            var label1 = p.GetValueOrDefault("label1", "poco amortiguamiento");
            var label2 = p.GetValueOrDefault("label2", "buen amortiguamiento");
            var wnVal = p.GetValueOrDefault("wn", "2");

            var uid = "sa" + Guid.NewGuid().ToString("N").Substring(0, 8);
            string JsEsc(string s) => s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", " ").Replace("\r", "");

            var sb = new StringBuilder();
            sb.Append("<canvas id=\"").Append(uid)
              .Append("\" width=\"880\" height=\"480\" style=\"border:2px solid #ddd;border-radius:8px;background:#fafafa;display:block;margin:10px auto\"></canvas>");
            sb.Append("<div style=\"text-align:center;margin:6px auto;font-size:12px;color:#555;font-family:sans-serif\">");
            sb.Append("<label>&#9654; Velocidad: <input type=\"range\" id=\"").Append(uid).Append("spd\" min=\"0.1\" max=\"3.0\" step=\"0.1\" value=\"0.6\" style=\"width:200px;vertical-align:middle\"> ");
            sb.Append("<b><span id=\"").Append(uid).Append("sv\">0.6</span>x</b></label>");
            sb.Append("&nbsp;&nbsp;<button id=\"").Append(uid).Append("rst\" style=\"font-size:11px;padding:2px 8px;cursor:pointer\">Reset</button></div>");

            var js = "(function(){"
+ "var cv=document.getElementById(\"__UID__\");if(!cv)return;"
+ "var c=cv.getContext(\"2d\"),W=880,H=480;"
+ "var wn=__WN__,tMax=25,nP=500,prog=0,spd=0.6,pF=0;"
+ "var x1v=__XI1__,x2v=__XI2__,c1=\"#d32f2f\",c2=\"#1565c0\";"
+ "var sl=document.getElementById(\"__UID__spd\"),sv=document.getElementById(\"__UID__sv\"),rb=document.getElementById(\"__UID__rst\");"
+ "if(sl){sl.addEventListener(\"input\",function(){spd=parseFloat(this.value);sv.textContent=spd.toFixed(1);});}"
+ "if(rb){rb.addEventListener(\"click\",function(){spd=0.6;sl.value=0.6;sv.textContent=\"0.6\";prog=0;pF=0;});}"
+ "var msH=185,eq=115,amp=35,pcx=135,pcy=340,pR=120;"
+ "var wL=295,wR=865,wT=220,wB=460,wW=wR-wL,wH=wB-wT,wCY=wT+wH/2;"
+ "function rsp(t,xi){var w=wn*Math.sqrt(1-xi*xi);return Math.exp(-xi*wn*t)*Math.sin(w*t);}"
+ "function env(t,xi){return Math.exp(-xi*wn*t);}"
+ "function pXf(t,xi){var w=wn*Math.sqrt(1-xi*xi);return Math.exp(-xi*wn*t)*Math.cos(w*t);}"
+ "function tXf(t){return wL+(t/tMax)*wW;}"
+ "function vYf(v){return wCY-v*(wH/2);}"
+ "function zig(x,y1,y2,n){"
+ "var s=(y2-y1)/(2*n+2);c.beginPath();c.moveTo(x,y1);c.lineTo(x,y1+s);"
+ "for(var i=0;i<n;i++){c.lineTo(x-10,y1+s*(2*i+2));c.lineTo(x+10,y1+s*(2*i+3));}"
+ "c.lineTo(x,y2);c.strokeStyle=\"#777\";c.lineWidth=1.5;c.stroke();}"
+ "function pis(x,y1,y2){"
+ "var m=(y1+y2)/2,pw=7,ph=14;c.strokeStyle=\"#aaa\";c.lineWidth=1.5;"
+ "c.beginPath();c.moveTo(x,y1);c.lineTo(x,m-ph/2);c.stroke();"
+ "c.strokeRect(x-pw,m-ph/2,pw*2,ph);"
+ "c.beginPath();c.moveTo(x,m+ph/2);c.lineTo(x,y2);c.stroke();}"
+ "function bx(x,y,w,h,col,txt){"
+ "c.fillStyle=col;c.fillRect(x,y,w,h);c.fillStyle=\"#fff\";"
+ "c.font=\"bold 13px sans-serif\";c.textAlign=\"center\";c.fillText(txt,x+w/2,y+h/2+5);}"
+ "function drawMS(tCur){"
+ "var a1=amp*rsp(tCur,x1v),a2=amp*rsp(tCur,x2v);"
+ "c.fillStyle=\"#333\";c.font=\"bold 12px sans-serif\";c.textAlign=\"center\";"
+ "c.fillText(\"__TITLE__\",W/2,16);"
+ "var px1=290;"
+ "c.fillStyle=c1;c.font=\"bold 10px sans-serif\";"
+ "c.fillText(\"\\u03BE = \"+x1v+\" (__LAB1__)\",px1,33);"
+ "c.fillStyle=\"#666\";c.fillRect(px1-50,40,100,5);"
+ "for(var i=0;i<5;i++)c.fillRect(px1-45+i*20,35,2,5);"
+ "zig(px1-18,45,eq+a1,5);pis(px1+18,45,eq+a1);bx(px1-22,eq+a1,44,32,c1,\"m\");"
+ "var px2=590;"
+ "c.fillStyle=c2;c.font=\"bold 10px sans-serif\";"
+ "c.fillText(\"\\u03BE = \"+x2v+\" (__LAB2__)\",px2,33);"
+ "c.fillStyle=\"#666\";c.fillRect(px2-50,40,100,5);"
+ "for(var i=0;i<5;i++)c.fillRect(px2-45+i*20,35,2,5);"
+ "zig(px2-18,45,eq+a2,5);pis(px2+18,45,eq+a2);bx(px2-22,eq+a2,44,32,c2,\"m\");"
+ "c.setLineDash([3,3]);c.strokeStyle=\"#bbb\";c.lineWidth=0.5;"
+ "c.beginPath();c.moveTo(200,eq+16);c.lineTo(700,eq+16);c.stroke();c.setLineDash([]);"
+ "c.fillStyle=\"#aaa\";c.font=\"8px sans-serif\";c.textAlign=\"left\";c.fillText(\"equilibrio\",205,eq+14);"
+ "if(Math.abs(a1)>2){c.strokeStyle=c1;c.lineWidth=1;"
+ "c.beginPath();c.moveTo(px1+28,eq+16);c.lineTo(px1+28,eq+a1+16);c.stroke();"
+ "c.beginPath();c.moveTo(px1+25,eq+a1+16);c.lineTo(px1+28,eq+a1+10);c.stroke();"
+ "c.beginPath();c.moveTo(px1+31,eq+a1+16);c.lineTo(px1+28,eq+a1+10);c.stroke();}"
+ "if(Math.abs(a2)>2){c.strokeStyle=c2;c.lineWidth=1;"
+ "c.beginPath();c.moveTo(px2+28,eq+16);c.lineTo(px2+28,eq+a2+16);c.stroke();"
+ "c.beginPath();c.moveTo(px2+25,eq+a2+16);c.lineTo(px2+28,eq+a2+10);c.stroke();"
+ "c.beginPath();c.moveTo(px2+31,eq+a2+16);c.lineTo(px2+28,eq+a2+10);c.stroke();}"
+ "c.textAlign=\"center\";c.font=\"11px sans-serif\";"
+ "c.fillStyle=c1;c.fillText(\"\\u2195 Vibra MUCHO\",px1,msH-5);"
+ "c.fillStyle=c2;c.fillText(\"\\u2195 Vibra poco\",px2,msH-5);}"
+ "function drawPH(n){"
+ "c.fillStyle=\"#333\";c.font=\"bold 11px sans-serif\";c.textAlign=\"center\";"
+ "c.fillText(\"Diagrama Fasorial (espiral)\",pcx,205);"
+ "c.setLineDash([3,3]);c.strokeStyle=\"#ddd\";c.lineWidth=1;"
+ "c.beginPath();c.arc(pcx,pcy,pR,0,2*Math.PI);c.stroke();"
+ "c.beginPath();c.arc(pcx,pcy,pR*0.5,0,2*Math.PI);c.stroke();"
+ "c.setLineDash([]);c.strokeStyle=\"#ddd\";c.lineWidth=0.5;"
+ "c.beginPath();c.moveTo(pcx-pR-10,pcy);c.lineTo(pcx+pR+10,pcy);c.stroke();"
+ "c.beginPath();c.moveTo(pcx,pcy-pR-10);c.lineTo(pcx,pcy+pR+10);c.stroke();"
+ "drawSp(x1v,c1,n);drawSp(x2v,c2,n);"
+ "c.fillStyle=\"#999\";c.font=\"9px sans-serif\";c.textAlign=\"center\";"
+ "c.fillText(\"El vector gira y decrece\",pcx,H-8);}"
+ "function drawSp(xi,col,n){"
+ "c.strokeStyle=col;c.lineWidth=1.5;c.globalAlpha=0.5;c.beginPath();"
+ "for(var i=0;i<=n;i++){var t=i*tMax/nP,px=pcx+pXf(t,xi)*pR,py=pcy-rsp(t,xi)*pR;"
+ "if(i===0)c.moveTo(px,py);else c.lineTo(px,py);}"
+ "c.stroke();c.globalAlpha=1;"
+ "if(n>0){var t2=n*tMax/nP,px2=pcx+pXf(t2,xi)*pR,py2=pcy-rsp(t2,xi)*pR;"
+ "c.fillStyle=col;c.beginPath();c.arc(px2,py2,4,0,2*Math.PI);c.fill();"
+ "c.strokeStyle=col;c.globalAlpha=0.3;c.lineWidth=1;"
+ "c.beginPath();c.moveTo(pcx,pcy);c.lineTo(px2,py2);c.stroke();c.globalAlpha=1;}}"
+ "function drawWF(n){"
+ "c.fillStyle=\"#333\";c.font=\"bold 11px sans-serif\";c.textAlign=\"center\";"
+ "c.fillText(\"Forma Sinusoidal x(t)\",wL+wW/2,205);"
+ "c.strokeStyle=\"#eee\";c.lineWidth=0.5;var i;"
+ "for(i=0;i<=10;i++){var gx=wL+i*wW/10;c.beginPath();c.moveTo(gx,wT);c.lineTo(gx,wB);c.stroke();}"
+ "for(i=0;i<=8;i++){var gy=wT+i*wH/8;c.beginPath();c.moveTo(wL,gy);c.lineTo(wR,gy);c.stroke();}"
+ "c.strokeStyle=\"#bbb\";c.lineWidth=0.7;"
+ "c.beginPath();c.moveTo(wL,wCY);c.lineTo(wR,wCY);c.stroke();"
+ "c.strokeStyle=\"#999\";c.lineWidth=1;c.strokeRect(wL,wT,wW,wH);"
+ "c.fillStyle=\"#666\";c.font=\"9px sans-serif\";c.textAlign=\"right\";"
+ "c.fillText(\"1.0\",wL-3,wT+3);c.fillText(\"0\",wL-3,wCY+3);c.fillText(\"-1.0\",wL-3,wB+3);"
+ "c.textAlign=\"center\";"
+ "for(i=0;i<=5;i++)c.fillText((i*tMax/5).toFixed(0),tXf(i*tMax/5),wB+13);"
+ "c.fillText(\"t (s)\",wL+wW/2,H-5);"
+ "drawWv(x1v,c1,n);drawWv(x2v,c2,n);"
+ "if(n>0&&n<nP){var t=n*tMax/nP;"
+ "c.setLineDash([2,2]);c.strokeStyle=\"#666\";c.lineWidth=0.5;"
+ "c.beginPath();c.moveTo(tXf(t),wT);c.lineTo(tXf(t),wB);c.stroke();c.setLineDash([]);}}"
+ "function drawWv(xi,col,n){"
+ "c.setLineDash([3,3]);c.strokeStyle=col;c.globalAlpha=0.2;c.lineWidth=1;c.beginPath();"
+ "for(var i=0;i<=n;i++){var t=i*tMax/nP;if(i===0)c.moveTo(tXf(t),vYf(env(t,xi)));else c.lineTo(tXf(t),vYf(env(t,xi)));}"
+ "c.stroke();c.beginPath();"
+ "for(var i=0;i<=n;i++){var t=i*tMax/nP;if(i===0)c.moveTo(tXf(t),vYf(-env(t,xi)));else c.lineTo(tXf(t),vYf(-env(t,xi)));}"
+ "c.stroke();c.setLineDash([]);c.globalAlpha=1;"
+ "c.strokeStyle=col;c.lineWidth=2;c.beginPath();"
+ "for(var i=0;i<=n;i++){var t=i*tMax/nP;if(i===0)c.moveTo(tXf(t),vYf(rsp(t,xi)));else c.lineTo(tXf(t),vYf(rsp(t,xi)));}"
+ "c.stroke();"
+ "if(n>0&&n<nP){var t=n*tMax/nP;c.fillStyle=col;c.beginPath();c.arc(tXf(t),vYf(rsp(t,xi)),3,0,2*Math.PI);c.fill();}}"
+ "function conn(n){"
+ "if(n<1||n>=nP)return;var t=n*tMax/nP;"
+ "c.setLineDash([2,3]);c.lineWidth=1;"
+ "var v1=rsp(t,x1v),yC1=pcy-v1*pR;"
+ "c.strokeStyle=c1;c.globalAlpha=0.25;"
+ "c.beginPath();c.moveTo(pcx+pR+5,yC1);c.lineTo(wL,yC1);c.stroke();"
+ "var v2=rsp(t,x2v),yC2=pcy-v2*pR;"
+ "c.strokeStyle=c2;"
+ "c.beginPath();c.moveTo(pcx+pR+5,yC2);c.lineTo(wL,yC2);c.stroke();"
+ "c.setLineDash([]);c.globalAlpha=1;}"
+ "function leg(){"
+ "c.lineWidth=2;c.font=\"10px sans-serif\";c.textAlign=\"left\";"
+ "c.strokeStyle=c1;c.beginPath();c.moveTo(20,H-12);c.lineTo(40,H-12);c.stroke();"
+ "c.fillStyle=c1;c.fillText(\"\\u03BE=\"+x1v+\" (__LAB1__)\",44,H-8);"
+ "c.strokeStyle=c2;c.beginPath();c.moveTo(W/2-30,H-12);c.lineTo(W/2-10,H-12);c.stroke();"
+ "c.fillStyle=c2;c.fillText(\"\\u03BE=\"+x2v+\" (__LAB2__)\",W/2-6,H-8);}"
+ "function frame(){"
+ "c.clearRect(0,0,W,H);c.fillStyle=\"#fafafa\";c.fillRect(0,0,W,H);"
+ "var n=Math.min(Math.floor(prog),nP),tCur=n*tMax/nP;"
+ "c.strokeStyle=\"#ddd\";c.lineWidth=1;"
+ "c.beginPath();c.moveTo(10,msH+7);c.lineTo(W-10,msH+7);c.stroke();"
+ "drawMS(tCur);drawPH(n);drawWF(n);conn(n);leg();"
+ "if(n>=nP){pF++;if(pF>150){prog=0;pF=0;}}else{prog+=spd;}"
+ "requestAnimationFrame(frame);}"
+ "frame();})();";

            js = js.Replace("__UID__", uid)
                   .Replace("__XI1__", xi1)
                   .Replace("__XI2__", xi2)
                   .Replace("__WN__", wnVal)
                   .Replace("__TITLE__", JsEsc(title))
                   .Replace("__LAB1__", JsEsc(label1))
                   .Replace("__LAB2__", JsEsc(label2));

            sb.Append("<script>").Append(js).Append("</script>");
            return sb.ToString();
        }
