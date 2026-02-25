# Ejemplo.py — en IDLE
from hekatan import run; run()

title("Integral - Area bajo la curva")

heading("Funcion", 2)
text("Se tiene la funcion cuadratica:")
calc("f(x) = x^2 + 1")

hr()

heading("Integral indefinida", 2)
text("La integral indefinida de f(x):")
integral("x^2 + 1", "x")

eq_block("∫ x^2*dx = (x^{3})/(3)  (1)")
eq_block("∫ 1*dx = x  (2)")

text("Primitiva:")
eq_block("F(x) = (x^{3})/(3) + x + C  (3)")

hr()

heading("Integral definida", 2)
text("Evaluando en el intervalo [0, 3]:")
integral("x^2 + 1", "x", "0", "3", "A")

a = 3
F_a = a^3/3 + a
b_val = 0
F_b = b_val^3/3 + b_val
A = F_a - F_b

note("A = F(3) - F(0) = 12 - 0 = 12", "success")

hr()

heading("Grafica - Area bajo la curva", 2)
text("La region sombreada representa el area A = 12:")

html_raw('''
<svg width="480" height="320" viewBox="0 0 480 320" style="margin:16px auto;display:block;font-family:'Segoe UI',sans-serif;">
  <defs>
    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4682E0" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#4682E0" stop-opacity="0.1"/>
    </linearGradient>
  </defs>
  <!-- Ejes -->
  <line x1="50" y1="280" x2="440" y2="280" stroke="#333" stroke-width="1.5"/>
  <line x1="50" y1="280" x2="50" y2="20" stroke="#333" stroke-width="1.5"/>
  <polygon points="440,280 432,276 432,284" fill="#333"/>
  <polygon points="50,20 46,28 54,28" fill="#333"/>
  <text x="445" y="285" font-size="14" fill="#333" font-style="italic">x</text>
  <text x="35" y="18" font-size="14" fill="#333" font-style="italic">y</text>

  <!-- Marcas eje X -->
  <line x1="150" y1="276" x2="150" y2="284" stroke="#333" stroke-width="1"/>
  <text x="147" y="298" font-size="12" fill="#333">1</text>
  <line x1="250" y1="276" x2="250" y2="284" stroke="#333" stroke-width="1"/>
  <text x="247" y="298" font-size="12" fill="#333">2</text>
  <line x1="350" y1="276" x2="350" y2="284" stroke="#333" stroke-width="1"/>
  <text x="347" y="298" font-size="12" fill="#333">3</text>

  <!-- Marcas eje Y -->
  <line x1="46" y1="255" x2="54" y2="255" stroke="#333" stroke-width="1"/>
  <text x="30" y="259" font-size="11" fill="#333">1</text>
  <line x1="46" y1="230" x2="54" y2="230" stroke="#333" stroke-width="1"/>
  <text x="30" y="234" font-size="11" fill="#333">2</text>
  <line x1="46" y1="155" x2="54" y2="155" stroke="#333" stroke-width="1"/>
  <text x="30" y="159" font-size="11" fill="#333">5</text>
  <line x1="46" y1="30" x2="54" y2="30" stroke="#333" stroke-width="1"/>
  <text x="22" y="34" font-size="11" fill="#333">10</text>

  <!-- Area sombreada -->
  <polygon points="50,280 50,255 75,249 100,243 125,236 150,230 175,222 200,212 225,200 250,180 275,159 300,134 325,106 350,30 350,280" fill="url(#areaGrad)" stroke="none"/>

  <!-- Curva f(x) = x^2 + 1 -->
  <path d="M 50,255 C 100,243 150,230 200,212 C 250,180 300,134 350,30" fill="none" stroke="#2060C0" stroke-width="2.5" stroke-linecap="round"/>

  <!-- Etiqueta curva -->
  <text x="360" y="50" font-size="14" fill="#2060C0" font-style="italic">f(x) = x&#178; + 1</text>

  <!-- Etiqueta area -->
  <text x="170" y="240" font-size="16" fill="#1a5090" font-weight="bold">A = 12</text>

  <!-- Linea vertical x=3 -->
  <line x1="350" y1="280" x2="350" y2="30" stroke="#2060C0" stroke-width="1" stroke-dasharray="4,4"/>

  <text x="37" y="298" font-size="12" fill="#333">0</text>
</svg>
''')

show()
