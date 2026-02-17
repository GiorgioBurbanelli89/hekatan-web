using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;

namespace Hekatan.Wpf.MathEditor
{
    /// <summary>
    /// Gestor de autocompletado para MathEditor
    /// Proporciona sugerencias de funciones, directivas y unidades mientras se escribe
    /// </summary>
    public class MathAutoComplete
    {
        private readonly Popup _popup;
        private readonly ListBox _listBox;
        private readonly List<AutoCompleteItem> _allItems;
        private string _currentPrefix = "";
        private Action<string> _insertCallback;
        private double _cursorX;
        private double _cursorY;

        // Snippets: cuando se selecciona, inserta el snippet completo
        private static readonly Dictionary<string, string> Snippets = new(StringComparer.OrdinalIgnoreCase)
        {
            { "#for", "#for i = 1 : n\n\t\n#loop" },
            { "#while", "#while condition\n\t\n#loop" },
            { "#if", "#if condition\n\t\n#end if" },
            { "#def", "#def name$(x$) = \n#end def" },
            { "#hide", "#hide\n\n#show" },
        };

        public MathAutoComplete(Popup popup, ListBox listBox)
        {
            _popup = popup;
            _listBox = listBox;
            _allItems = new List<AutoCompleteItem>();

            InitializeItems();

            _listBox.PreviewMouseLeftButtonUp += ListBox_PreviewMouseLeftButtonUp;
            _listBox.PreviewKeyDown += ListBox_PreviewKeyDown;
        }

        /// <summary>
        /// Establece el callback que se llama cuando se selecciona un item
        /// </summary>
        public void SetInsertCallback(Action<string> callback)
        {
            _insertCallback = callback;
        }

        private void InitializeItems()
        {
            // Directivas (magenta) - sincronizado con AutoCompleteManager
            AddDirective("#append");
            AddDirective("#break");
            AddDirective("#complex");
            AddDirective("#continue");
            AddDirective("#def");
            AddDirective("#deg");
            AddDirective("#else if");
            AddDirective("#else");
            AddDirective("#end def");
            AddDirective("#end if");
            AddDirective("#equ");
            AddDirective("#for");
            AddDirective("#format");
            AddDirective("#format default");
            AddDirective("#global");
            AddDirective("#gra");
            AddDirective("#hide");
            AddDirective("#if");
            AddDirective("#include");
            AddDirective("#input");
            AddDirective("#local");
            AddDirective("#loop");
            AddDirective("#noc");
            AddDirective("#md");
            AddDirective("#md on");
            AddDirective("#md off");
            AddDirective("#nosub");
            AddDirective("#novar");
            AddDirective("#pause");
            AddDirective("#phasor");
            AddDirective("#post");
            AddDirective("#pre");
            AddDirective("#rad");
            AddDirective("#read");
            AddDirective("#repeat");
            AddDirective("#round");
            AddDirective("#round default");
            AddDirective("#show");
            AddDirective("#split");
            AddDirective("#val");
            AddDirective("#varsub");
            AddDirective("#while");
            AddDirective("#wrap");
            AddDirective("#write");
            AddDirective("default");

            // Funciones especiales (magenta)
            AddDirective("$Area{f(x) @ x = a : b}");
            AddDirective("$Block{ }");
            AddDirective("$Find{f(x) @ x = a : b}");
            AddDirective("$Inf{f(x) @ x = a : b}");
            AddDirective("$Inline{ }");
            AddDirective("$Integral{f(x) @ x = a : b}");
            AddDirective("$Map{f(x; y) @ x = a : b & y = c : d}");
            AddDirective("$Mesh_Triangle{vertices; segments; maxArea}");
            AddDirective("$Plot{f(x) @ x = a : b}");
            AddDirective("$Plotly{f(x; y) @ x = a : b & y = c : d}");
            AddDirective("$Product{f(k) @ k = a : b}");
            AddDirective("$Repeat{f(k) @ k = a : b}");
            AddDirective("$Root{f(x) = const @ x = a : b}");
            AddDirective("$Slope{f(x) @ x = a}");
            AddDirective("$Sum{f(k) @ k = a : b}");
            AddDirective("$Sup{f(x) @ x = a : b}");
            AddDirective("$Surface3D{f(x; y) @ x = a : b & y = c : d}");
            AddDirective("$Table{matrix | headers: [h1; h2] | caption: title}");
            AddDirective("$Three{nodes; elements; deformed; loads; supports | scale}");
            AddDirective("$While{ }");

            // Variables de sistema (azul)
            AddVariable("PlotAdaptive");
            AddVariable("PlotHeight");
            AddVariable("PlotLightDir");
            AddVariable("PlotPalette");
            AddVariable("PlotShadows");
            AddVariable("PlotStep");
            AddVariable("PlotSmooth");
            AddVariable("PlotSVG");
            AddVariable("PlotWidth");
            AddVariable("Precision");
            AddVariable("ReturnAngleUnits");

            // Funciones matemáticas (negrita) - lista completa de AutoCompleteManager
            AddFunction("abs(x)");
            AddFunction("acos(x)");
            AddFunction("acosh(x)");
            AddFunction("acot(x)");
            AddFunction("acoth(x)");
            AddFunction("acsc(x)");
            AddFunction("acsch(x)");
            AddFunction("add(A; B; i; j)");
            AddFunction("adj(M)");
            AddFunction("and(M; v; x…)");
            AddFunction("asec(x)");
            AddFunction("asech(x)");
            AddFunction("asin(x)");
            AddFunction("asinh(x)");
            AddFunction("atan(x)");
            AddFunction("atan2(x; y)");
            AddFunction("atanh(x)");
            AddFunction("augment(A; B; C…)");
            AddFunction("average(M; V; x…)");
            AddFunction("cbrt(x)");
            AddFunction("ceiling(x)");
            AddFunction("cholesky(M)");
            AddFunction("clrUnits(x)");
            AddFunction("clsolve(A; b)");
            AddFunction("cmsolve(A; B)");
            AddFunction("cofactor(M)");
            AddFunction("col(M; j)");
            AddFunction("column(m; c)");
            AddFunction("column_hp(m; c)");
            AddFunction("cond(M)");
            AddFunction("cond_1(M)");
            AddFunction("cond_2(M)");
            AddFunction("cond_e(M)");
            AddFunction("cond_i(M)");
            AddFunction("conj(z)");
            AddFunction("copy(A; B; i; j)");
            AddFunction("cos(x)");
            AddFunction("cosh(x)");
            AddFunction("cot(x)");
            AddFunction("coth(x)");
            AddFunction("count(v; x; i)");
            AddFunction("cross(a; b)");
            AddFunction("csc(x)");
            AddFunction("csch(x)");
            AddFunction("det(M)");
            AddFunction("diag2vec(M)");
            AddFunction("diagonal(n; d)");
            AddFunction("diagonal_hp(n; d)");
            AddFunction("dot(a; b)");
            AddFunction("eigen(M; nₑ)");
            AddFunction("eigenvals(M; nₑ)");
            AddFunction("eigenvecs(M; nₑ)");
            AddFunction("exp(x)");
            AddFunction("extract(v; vi)");
            AddFunction("extract_cols(M; vj)");
            AddFunction("extract_rows(M; vi)");
            AddFunction("fact(x)");
            AddFunction("fft(M)");
            AddFunction("fill(v; x)");
            AddFunction("fill_col(M; j; x)");
            AddFunction("fill_row(M; i; x)");
            AddFunction("find(v; x; i)");
            AddFunction("find_eq(v; x; i)");
            AddFunction("find_ge(v; x; i)");
            AddFunction("find_gt(v; x; i)");
            AddFunction("find_le(v; x; i)");
            AddFunction("find_lt(v; x; i)");
            AddFunction("find_ne(v; x; i)");
            AddFunction("first(v; n)");
            AddFunction("floor(x)");
            AddFunction("fprod(A; B)");
            AddFunction("gcd(x; y; z…)");
            AddFunction("getUnits(x)");
            AddFunction("hlookup(M; x; i₁; i₂)");
            AddFunction("hlookup_eq(M; x; i₁; i₂)");
            AddFunction("hlookup_ge(M; x; i₁; i₂)");
            AddFunction("hlookup_gt(M; x; i₁; i₂)");
            AddFunction("hlookup_le(M; x; i₁; i₂)");
            AddFunction("hlookup_lt(M; x; i₁; i₂)");
            AddFunction("hlookup_ne(M; x; i₁; i₂)");
            AddFunction("hp(x)");
            AddFunction("hprod(A; B)");
            AddFunction("identity(n)");
            AddFunction("identity_hp(n)");
            AddFunction("if(cond; vt; vf)");
            AddFunction("ift(M)");
            AddFunction("im(z)");
            AddFunction("inverse(M)");
            AddFunction("isHp(x)");
            AddFunction("join(M; v; x…)");
            AddFunction("join_cols(c₁; c₂; c₃…)");
            AddFunction("join_rows(r₁; r₂; r₃…)");
            AddFunction("kprod(A; B)");
            AddFunction("last(v; n)");
            AddFunction("lcm(x; y; z…)");
            AddFunction("len(v)");
            AddFunction("line(x; M; v; y…)");
            AddFunction("line(x; y; M)");
            AddFunction("ln(x)");
            AddFunction("log(x)");
            AddFunction("log_2(x)");
            AddFunction("lookup(a; b; x)");
            AddFunction("lookup_eq(a; b; x)");
            AddFunction("lookup_ge(a; b; x)");
            AddFunction("lookup_gt(a; b; x)");
            AddFunction("lookup_le(a; b; x)");
            AddFunction("lookup_lt(a; b; x)");
            AddFunction("lookup_ne(a; b; x)");
            AddFunction("lsolve(A; b)");
            AddFunction("ltriang(n)");
            AddFunction("ltriang_hp(n)");
            AddFunction("lu(M)");
            AddFunction("matrix(m; n)");
            AddFunction("matrix_hp(m; n)");
            AddFunction("mandelbrot(x; y)");
            AddFunction("max(M; v; x…)");
            AddFunction("mcount(M; x)");
            AddFunction("mean(M; v; x…)");
            AddFunction("mfill(M; x)");
            AddFunction("mfind(M; x)");
            AddFunction("mfind_eq(M; x)");
            AddFunction("mfind_ge(M; x)");
            AddFunction("mfind_gt(M; x)");
            AddFunction("mfind_le(M; x)");
            AddFunction("mfind_lt(M; x)");
            AddFunction("mfind_ne(M; x)");
            AddFunction("min(M; v; x…)");
            AddFunction("mnorm(M)");
            AddFunction("mnorm_1(M)");
            AddFunction("mnorm_2(M)");
            AddFunction("mnorm_e(M)");
            AddFunction("mnorm_i(M)");
            AddFunction("mod(x; y)");
            AddFunction("mresize(M; m; n)");
            AddFunction("msearch(M; x; i; j)");
            AddFunction("msolve(A; B)");
            AddFunction("n_cols(M)");
            AddFunction("n_rows(M)");
            AddFunction("norm(v)");
            AddFunction("norm_1(v)");
            AddFunction("norm_2(v)");
            AddFunction("norm_e(v)");
            AddFunction("norm_i(v)");
            AddFunction("norm_p(v; p)");
            AddFunction("not(x)");
            AddFunction("or(M; v; x…)");
            AddFunction("order(v)");
            AddFunction("order_cols(M; i)");
            AddFunction("order_rows(M; j)");
            AddFunction("phase(z)");
            AddFunction("product(M; v; x…)");
            AddFunction("qr(M)");
            AddFunction("random(x)");
            AddFunction("range(x₁; xₙ; step)");
            AddFunction("range_hp(x₁; xₙ; step)");
            AddFunction("rank(M)");
            AddFunction("re(z)");
            AddFunction("resize(v; n)");
            AddFunction("reverse(v)");
            AddFunction("revorder(v)");
            AddFunction("revorder_cols(M; i)");
            AddFunction("revorder_rows(M; j)");
            AddFunction("root(x; n)");
            AddFunction("round(x)");
            AddFunction("row(M; i)");
            AddFunction("rsort(v)");
            AddFunction("rsort_cols(M; i)");
            AddFunction("rsort_rows(M; j)");
            AddFunction("search(v; x; i)");
            AddFunction("sec(x)");
            AddFunction("sech(x)");
            AddFunction("setUnits(x; u)");
            AddFunction("sin(x)");
            AddFunction("sign(x)");
            AddFunction("sinh(x)");
            AddFunction("size(v)");
            AddFunction("slice(v; i₁; i₂)");
            AddFunction("slsolve(A; b)");
            AddFunction("smsolve(A; B)");
            AddFunction("sort(v)");
            AddFunction("sort_cols(M; i)");
            AddFunction("sort_rows(M; j)");
            AddFunction("spline(x; M; v; y…)");
            AddFunction("spline(x; y; M)");
            AddFunction("sqr(x)");
            AddFunction("sqrt(x)");
            AddFunction("srss(M; v; x…)");
            AddFunction("stack(A; B; C…)");
            AddFunction("submatrix(M; i₁; i₂; j₁; j₂)");
            AddFunction("sum(M; v; x…)");
            AddFunction("sumsq(M; v; x…)");
            AddFunction("svd(M)");
            AddFunction("switch(c₁; v₁; c₂; v₂; …; def)");
            AddFunction("symmetric(n)");
            AddFunction("symmetric_hp(n)");
            AddFunction("take(n; M; v; x…)");
            AddFunction("take(x; y; M)");
            AddFunction("tan(x)");
            AddFunction("tanh(x)");
            AddFunction("timer()");
            AddFunction("trace(M)");
            AddFunction("transp(M)");
            AddFunction("trunc(x)");
            AddFunction("unit(v)");
            AddFunction("utriang(n)");
            AddFunction("utriang_hp(n)");
            AddFunction("vec2col(v)");
            AddFunction("vec2diag(v)");
            AddFunction("vec2row(v)");
            AddFunction("vector(n)");
            AddFunction("vector_hp(n)");
            AddFunction("vlookup(M; x; j₁; j₂)");
            AddFunction("vlookup_eq(M; x; j₁; j₂)");
            AddFunction("vlookup_ge(M; x; j₁; j₂)");
            AddFunction("vlookup_gt(M; x; j₁; j₂)");
            AddFunction("vlookup_le(M; x; j₁; j₂)");
            AddFunction("vlookup_lt(M; x; j₁; j₂)");
            AddFunction("vlookup_ne(M; x; j₁; j₂)");
            AddFunction("xor(M; v; x…)");

            // Unidades comunes (cyan) - lista extendida
            AddUnit("m");
            AddUnit("m^2");
            AddUnit("m^3");
            AddUnit("m/s");
            AddUnit("cm");
            AddUnit("cm^2");
            AddUnit("cm^3");
            AddUnit("mm");
            AddUnit("mm^2");
            AddUnit("mm^3");
            AddUnit("km");
            AddUnit("km^2");
            AddUnit("km^3");
            AddUnit("in");
            AddUnit("in^2");
            AddUnit("in^3");
            AddUnit("ft");
            AddUnit("ft^2");
            AddUnit("ft^3");
            AddUnit("ft/s");
            AddUnit("yd");
            AddUnit("yd^2");
            AddUnit("yd^3");
            AddUnit("mi");
            AddUnit("mi^2");
            AddUnit("mi^3");
            AddUnit("kg");
            AddUnit("kg/cm^3");
            AddUnit("g");
            AddUnit("g/cm^3");
            AddUnit("mg");
            AddUnit("lb");
            AddUnit("lb/ft^3");
            AddUnit("lb/in^3");
            AddUnit("oz");
            AddUnit("N");
            AddUnit("N*m");
            AddUnit("N*mm");
            AddUnit("N/m^2");
            AddUnit("N/mm^2");
            AddUnit("kN");
            AddUnit("kN*m");
            AddUnit("kN/m");
            AddUnit("kN/m^2");
            AddUnit("MN");
            AddUnit("lb_f");
            AddUnit("lbf");
            AddUnit("kip");
            AddUnit("kip*ft");
            AddUnit("kip/ft");
            AddUnit("tonf");
            AddUnit("ton_f");
            AddUnit("kgf");
            AddUnit("kgf/cm^2");
            AddUnit("Pa");
            AddUnit("kPa");
            AddUnit("MPa");
            AddUnit("GPa");
            AddUnit("psi");
            AddUnit("ksi");
            AddUnit("ksf");
            AddUnit("psf");
            AddUnit("bar");
            AddUnit("mbar");
            AddUnit("atm");
            AddUnit("mmHg");
            AddUnit("J");
            AddUnit("kJ");
            AddUnit("MJ");
            AddUnit("W");
            AddUnit("kW");
            AddUnit("MW");
            AddUnit("hp");
            AddUnit("BTU");
            AddUnit("cal");
            AddUnit("kcal");
            AddUnit("s");
            AddUnit("ms");
            AddUnit("min");
            AddUnit("h");
            AddUnit("d");
            AddUnit("Hz");
            AddUnit("kHz");
            AddUnit("MHz");
            AddUnit("GHz");
            AddUnit("rad");
            AddUnit("deg");
            AddUnit("°");
            AddUnit("°C");
            AddUnit("°F");
            AddUnit("K");
            AddUnit("L");
            AddUnit("mL");
            AddUnit("gal");
            AddUnit("t");
            AddUnit("t/m^3");
            AddUnit("Nm");
            AddUnit("V");
            AddUnit("kV");
            AddUnit("A");
            AddUnit("mA");
            AddUnit("Ω");
            AddUnit("kΩ");
            AddUnit("MΩ");

            // Unidades adicionales (sincronizado con AutoCompleteManager)
            AddUnit("AU");
            AddUnit("Ah");
            AddUnit("Bq");
            AddUnit("C");
            AddUnit("C/kg");
            AddUnit("Ci");
            AddUnit("Da");
            AddUnit("EeV");
            AddUnit("F");
            AddUnit("GA");
            AddUnit("GBq");
            AddUnit("GC");
            AddUnit("GF");
            AddUnit("GGy");
            AddUnit("GH");
            AddUnit("GJ");
            AddUnit("GN");
            AddUnit("GS");
            AddUnit("GSv");
            AddUnit("GT");
            AddUnit("GV");
            AddUnit("GVA");
            AddUnit("GVAR");
            AddUnit("GW");
            AddUnit("GWb");
            AddUnit("GWh");
            AddUnit("GeV");
            AddUnit("Gt");
            AddUnit("Gy");
            AddUnit("GΩ");
            AddUnit("G℧");
            AddUnit("H");
            AddUnit("MA");
            AddUnit("MBq");
            AddUnit("MC");
            AddUnit("MF");
            AddUnit("MGy");
            AddUnit("MH");
            AddUnit("MS");
            AddUnit("MSv");
            AddUnit("MT");
            AddUnit("MV");
            AddUnit("MVA");
            AddUnit("MVAR");
            AddUnit("MWb");
            AddUnit("MWh");
            AddUnit("MeV");
            AddUnit("Mt");
            AddUnit("M℧");
            AddUnit("N*cm");
            AddUnit("N/C");
            AddUnit("N/cm");
            AddUnit("N/cm^2");
            AddUnit("N/cm^3");
            AddUnit("N/mm");
            AddUnit("N/mm^3");
            AddUnit("PeV");
            AddUnit("R");
            AddUnit("Rd");
            AddUnit("S");
            AddUnit("S/m");
            AddUnit("Sv");
            AddUnit("T");
            AddUnit("TA");
            AddUnit("TBq");
            AddUnit("TC");
            AddUnit("TF");
            AddUnit("TGy");
            AddUnit("TH");
            AddUnit("THz");
            AddUnit("TJ");
            AddUnit("TN");
            AddUnit("TPa");
            AddUnit("TS");
            AddUnit("TSv");
            AddUnit("TT");
            AddUnit("TV");
            AddUnit("TVA");
            AddUnit("TVAR");
            AddUnit("TW");
            AddUnit("TWb");
            AddUnit("TWh");
            AddUnit("TeV");
            AddUnit("Torr");
            AddUnit("TΩ");
            AddUnit("T℧");
            AddUnit("V*m");
            AddUnit("V/m");
            AddUnit("VA");
            AddUnit("VAR");
            AddUnit("Wb");
            AddUnit("Wh");
            AddUnit("a");
            AddUnit("ac");
            AddUnit("at");
            AddUnit("bbl");
            AddUnit("bbl_UK");
            AddUnit("bbl_US");
            AddUnit("bbl_dry");
            AddUnit("bu");
            AddUnit("bu_UK");
            AddUnit("bu_US");
            AddUnit("cL");
            AddUnit("cPa");
            AddUnit("cable");
            AddUnit("cable_UK");
            AddUnit("cable_US");
            AddUnit("cd");
            AddUnit("cd/m^2");
            AddUnit("cg");
            AddUnit("ch");
            AddUnit("cwt");
            AddUnit("cwt_UK");
            AddUnit("cwt_US");
            AddUnit("dL");
            AddUnit("dPa");
            AddUnit("daL");
            AddUnit("daN");
            AddUnit("daPa");
            AddUnit("daa");
            AddUnit("dg");
            AddUnit("dm");
            AddUnit("dm^2");
            AddUnit("dm^3");
            AddUnit("dr");
            AddUnit("eV");
            AddUnit("erg");
            AddUnit("fl_oz");
            AddUnit("fl_oz_UK");
            AddUnit("fl_oz_US");
            AddUnit("ft*lb_f");
            AddUnit("ft*lb_f/h");
            AddUnit("ft*lb_f/min");
            AddUnit("ft*lb_f/s");
            AddUnit("ft*oz_f");
            AddUnit("ftm");
            AddUnit("ftm_UK");
            AddUnit("ftm_US");
            AddUnit("fur");
            AddUnit("g/mm^3");
            AddUnit("gal_UK");
            AddUnit("gal_US");
            AddUnit("gal_dry");
            AddUnit("gf");
            AddUnit("gi");
            AddUnit("gi_UK");
            AddUnit("gi_US");
            AddUnit("gr");
            AddUnit("grad");
            AddUnit("hL");
            AddUnit("hN");
            AddUnit("hPa");
            AddUnit("ha");
            AddUnit("hg");
            AddUnit("hpE");
            AddUnit("hpS");
            AddUnit("in*lb_f");
            AddUnit("in*oz_f");
            AddUnit("in/s");
            AddUnit("kA");
            AddUnit("kBq");
            AddUnit("kC");
            AddUnit("kF");
            AddUnit("kGy");
            AddUnit("kH");
            AddUnit("kN*cm");
            AddUnit("kN/cm");
            AddUnit("kN/cm^2");
            AddUnit("kN/cm^3");
            AddUnit("kN/m^3");
            AddUnit("kNm");
            AddUnit("kS");
            AddUnit("kSv");
            AddUnit("kT");
            AddUnit("kVA");
            AddUnit("kVAR");
            AddUnit("kWb");
            AddUnit("kWh");
            AddUnit("kat");
            AddUnit("keV");
            AddUnit("kgf/cm^3");
            AddUnit("kip/ft^3");
            AddUnit("kip/in^3");
            AddUnit("kip_f");
            AddUnit("kip_m");
            AddUnit("kipf");
            AddUnit("kipm");
            AddUnit("klb");
            AddUnit("klb/ft^3");
            AddUnit("klb/in^3");
            AddUnit("kmh");
            AddUnit("kt");
            AddUnit("k℧");
            AddUnit("lb/bu");
            AddUnit("lb/gal");
            AddUnit("lb/yd^3");
            AddUnit("lb_f*ft");
            AddUnit("lb_f*in");
            AddUnit("lb_f/ft^3");
            AddUnit("lb_f/in^3");
            AddUnit("lb_m");
            AddUnit("lbm");
            AddUnit("lea");
            AddUnit("li");
            AddUnit("lm");
            AddUnit("lm*s");
            AddUnit("lm*s/m^3");
            AddUnit("lm/W");
            AddUnit("lx");
            AddUnit("lx*s");
            AddUnit("ly");
            AddUnit("mAh");
            AddUnit("mBq");
            AddUnit("mC");
            AddUnit("mF");
            AddUnit("mGy");
            AddUnit("mH");
            AddUnit("mHz");
            AddUnit("mJ");
            AddUnit("mPa");
            AddUnit("mS");
            AddUnit("mSv");
            AddUnit("mT");
            AddUnit("mV");
            AddUnit("mVA");
            AddUnit("mVAR");
            AddUnit("mW");
            AddUnit("mWb");
            AddUnit("mWh");
            AddUnit("mol");
            AddUnit("mph");
            AddUnit("mΩ");
            AddUnit("m℧");
            AddUnit("nA");
            AddUnit("nBq");
            AddUnit("nC");
            AddUnit("nF");
            AddUnit("nGy");
            AddUnit("nH");
            AddUnit("nHz");
            AddUnit("nJ");
            AddUnit("nL");
            AddUnit("nPa");
            AddUnit("nS");
            AddUnit("nSv");
            AddUnit("nT");
            AddUnit("nV");
            AddUnit("nVA");
            AddUnit("nVAR");
            AddUnit("nW");
            AddUnit("nWb");
            AddUnit("nWh");
            AddUnit("ng");
            AddUnit("nm");
            AddUnit("nmi");
            AddUnit("ns");
            AddUnit("nΩ");
            AddUnit("n℧");
            AddUnit("osf");
            AddUnit("osi");
            AddUnit("oz/ft^3");
            AddUnit("oz/in^3");
            AddUnit("oz_f");
            AddUnit("oz_f*ft");
            AddUnit("oz_f*in");
            AddUnit("oz_f/ft^3");
            AddUnit("oz_f/in^3");
            AddUnit("ozf");
            AddUnit("pA");
            AddUnit("pBq");
            AddUnit("pC");
            AddUnit("pF");
            AddUnit("pGy");
            AddUnit("pH");
            AddUnit("pHz");
            AddUnit("pJ");
            AddUnit("pL");
            AddUnit("pPa");
            AddUnit("pS");
            AddUnit("pSv");
            AddUnit("pT");
            AddUnit("pV");
            AddUnit("pVA");
            AddUnit("pVAR");
            AddUnit("pW");
            AddUnit("pWb");
            AddUnit("pWh");
            AddUnit("pcm");
            AddUnit("perch");
            AddUnit("perch^2");
            AddUnit("pg");
            AddUnit("pk");
            AddUnit("pk_UK");
            AddUnit("pk_US");
            AddUnit("pm");
            AddUnit("pole");
            AddUnit("pole^2");
            AddUnit("ppb");
            AddUnit("ppm");
            AddUnit("ppq");
            AddUnit("ppt");
            AddUnit("ps");
            AddUnit("pt");
            AddUnit("pt_UK");
            AddUnit("pt_US");
            AddUnit("pt_dry");
            AddUnit("pΩ");
            AddUnit("p℧");
            AddUnit("qr");
            AddUnit("qt");
            AddUnit("qt_UK");
            AddUnit("qt_US");
            AddUnit("qt_dry");
            AddUnit("quad");
            AddUnit("rev");
            AddUnit("rod");
            AddUnit("rod^2");
            AddUnit("rood");
            AddUnit("rpm");
            AddUnit("slug");
            AddUnit("slug/ft^3");
            AddUnit("st");
            AddUnit("tf");
            AddUnit("tf/m^2");
            AddUnit("tf/m^3");
            AddUnit("th");
            AddUnit("th^2");
            AddUnit("th^3");
            AddUnit("therm");
            AddUnit("ton");
            AddUnit("ton/ft^3");
            AddUnit("ton/yd^3");
            AddUnit("ton_UK");
            AddUnit("ton_US");
            AddUnit("ton_f/ft^3");
            AddUnit("ton_f/in^3");
            AddUnit("tsf");
            AddUnit("tsi");
            AddUnit("u");
            AddUnit("w");
            AddUnit("y");
            AddUnit("yd/s");
            AddUnit("°R");
            AddUnit("Δ°C");
            AddUnit("Δ°F");
            AddUnit("Ω*m");
            AddUnit("μA");
            AddUnit("μBq");
            AddUnit("μC");
            AddUnit("μF");
            AddUnit("μGy");
            AddUnit("μH");
            AddUnit("μHz");
            AddUnit("μJ");
            AddUnit("μL");
            AddUnit("μPa");
            AddUnit("μS");
            AddUnit("μSv");
            AddUnit("μT");
            AddUnit("μV");
            AddUnit("μVA");
            AddUnit("μVAR");
            AddUnit("μW");
            AddUnit("μWb");
            AddUnit("μWh");
            AddUnit("μbar");
            AddUnit("μg");
            AddUnit("μm");
            AddUnit("μs");
            AddUnit("μΩ");
            AddUnit("μ℧");
            // Constantes
            AddConstant("π");
            AddConstant("e");
            AddConstant("∞");

            // Vector y Matrix (DarkOrange) - se muestran al escribir [
            AddBracket("[;]  Vector");
            AddBracket("[;|;]  Matrix");

            // Lenguajes externos (se muestran al escribir @{)
            AddExternalLang("@{html}");
            AddExternalLang("@{css}");
            AddExternalLang("@{ts}");
            AddExternalLang("@{typescript}");
            AddExternalLang("@{js}");
            AddExternalLang("@{javascript}");
            AddExternalLang("@{python}");
            AddExternalLang("@{c}");
            AddExternalLang("@{cpp}");
            AddExternalLang("@{csharp}");
            AddExternalLang("@{cs}");
            AddExternalLang("@{fortran}");
            AddExternalLang("@{rust}");
            AddExternalLang("@{go}");
            AddExternalLang("@{java}");
            AddExternalLang("@{markdown}");
            AddExternalLang("@{md}");
            AddExternalLang("@{sql}");
            AddExternalLang("@{shell}");
            AddExternalLang("@{bash}");
            AddExternalLang("@{powershell}");
            AddExternalLang("@{octave}");
            AddExternalLang("@{matlab}");
        }

        private void AddVariable(string text)
        {
            _allItems.Add(new AutoCompleteItem(text, AutoCompleteItemType.Variable));
        }

        private void AddDirective(string text)
        {
            _allItems.Add(new AutoCompleteItem(text, AutoCompleteItemType.Directive));
        }

        private void AddFunction(string text)
        {
            _allItems.Add(new AutoCompleteItem(text, AutoCompleteItemType.Function));
        }

        private void AddUnit(string text)
        {
            _allItems.Add(new AutoCompleteItem(text, AutoCompleteItemType.Unit));
        }

        private void AddConstant(string text)
        {
            _allItems.Add(new AutoCompleteItem(text, AutoCompleteItemType.Constant));
        }

        private void AddBracket(string text)
        {
            _allItems.Add(new AutoCompleteItem(text, AutoCompleteItemType.Bracket));
        }

        private void AddExternalLang(string text)
        {
            _allItems.Add(new AutoCompleteItem(text, AutoCompleteItemType.ExternalLang));
        }

        /// <summary>
        /// Muestra el popup de autocompletado en la posición del cursor
        /// </summary>
        public void Show(string prefix, double cursorX, double cursorY)
        {
            _currentPrefix = prefix;
            _cursorX = cursorX;
            _cursorY = cursorY;

            UpdateFilteredItems();

            if (_listBox.Items.Count > 0)
            {
                _popup.HorizontalOffset = cursorX;
                _popup.VerticalOffset = cursorY + 20; // Debajo del cursor
                _popup.IsOpen = true;
                _listBox.SelectedIndex = 0;
            }
            else
            {
                Hide();
            }
        }

        /// <summary>
        /// Actualiza el filtro con un nuevo prefijo
        /// </summary>
        public void UpdateFilter(string prefix)
        {
            _currentPrefix = prefix;
            UpdateFilteredItems();

            if (_listBox.Items.Count == 0)
            {
                Hide();
            }
        }

        private void UpdateFilteredItems()
        {
            _listBox.Items.Clear();

            if (string.IsNullOrEmpty(_currentPrefix))
            {
                return;
            }

            // Caso especial: cuando el prefijo es "[", mostrar solo Vector y Matrix
            bool showOnlyBrackets = _currentPrefix == "[";

            foreach (var item in _allItems)
            {
                // Si estamos mostrando solo brackets, filtrar por tipo
                if (showOnlyBrackets)
                {
                    if (item.Type != AutoCompleteItemType.Bracket)
                        continue;
                }
                else if (!item.Text.StartsWith(_currentPrefix, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var listItem = new ListBoxItem
                {
                    Content = item.Text,
                    Tag = item
                };

                // Aplicar estilo según el tipo
                switch (item.Type)
                {
                    case AutoCompleteItemType.Directive:
                        listItem.Foreground = Brushes.DarkMagenta;
                        break;
                    case AutoCompleteItemType.Function:
                        listItem.FontWeight = FontWeights.Bold;
                        break;
                    case AutoCompleteItemType.Unit:
                        listItem.Foreground = Brushes.DarkCyan;
                        break;
                    case AutoCompleteItemType.Constant:
                        listItem.Foreground = Brushes.DarkBlue;
                        break;
                    case AutoCompleteItemType.Variable:
                        listItem.Foreground = Brushes.Blue;
                        break;
                    case AutoCompleteItemType.Bracket:
                        listItem.Foreground = Brushes.DarkOrange;
                        break;
                    case AutoCompleteItemType.ExternalLang:
                        listItem.Foreground = Brushes.Green;
                        listItem.FontWeight = FontWeights.Bold;
                        break;
                }

                _listBox.Items.Add(listItem);
            }
        }

        /// <summary>
        /// Oculta el popup
        /// </summary>
        public void Hide()
        {
            _popup.IsOpen = false;
        }

        /// <summary>
        /// Indica si el popup está visible
        /// </summary>
        public bool IsVisible => _popup.IsOpen;

        /// <summary>
        /// Selecciona el siguiente item
        /// </summary>
        public void SelectNext()
        {
            if (_listBox.Items.Count > 0)
            {
                int newIndex = _listBox.SelectedIndex + 1;
                if (newIndex >= _listBox.Items.Count)
                    newIndex = 0;
                _listBox.SelectedIndex = newIndex;
                _listBox.ScrollIntoView(_listBox.SelectedItem);
            }
        }

        /// <summary>
        /// Selecciona el item anterior
        /// </summary>
        public void SelectPrevious()
        {
            if (_listBox.Items.Count > 0)
            {
                int newIndex = _listBox.SelectedIndex - 1;
                if (newIndex < 0)
                    newIndex = _listBox.Items.Count - 1;
                _listBox.SelectedIndex = newIndex;
                _listBox.ScrollIntoView(_listBox.SelectedItem);
            }
        }

        /// <summary>
        /// Confirma la selección actual
        /// </summary>
        public void ConfirmSelection()
        {
            if (_listBox.SelectedItem is ListBoxItem selectedItem)
            {
                InsertSelectedItem(selectedItem);
            }
        }

        private void InsertSelectedItem(ListBoxItem item)
        {
            if (item?.Tag is AutoCompleteItem autoItem)
            {
                string textToInsert = autoItem.Text;

                // Para Vector y Matrix, solo insertar el código sin la etiqueta
                // "[;]  Vector" -> "[;]"
                // "[;|;]  Matrix" -> "[;|;]"
                if (autoItem.Type == AutoCompleteItemType.Bracket)
                {
                    int spaceIndex = textToInsert.IndexOf("  ");
                    if (spaceIndex > 0)
                        textToInsert = textToInsert.Substring(0, spaceIndex);
                }

                // Usar snippet si existe
                if (Snippets.TryGetValue(textToInsert, out string snippet))
                {
                    textToInsert = snippet;
                }

                // Remover el prefijo que ya fue escrito
                if (textToInsert.StartsWith(_currentPrefix, StringComparison.OrdinalIgnoreCase))
                {
                    textToInsert = textToInsert.Substring(_currentPrefix.Length);
                }

                Hide();
                _insertCallback?.Invoke(textToInsert);
            }
        }

        private void ListBox_PreviewMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            if (_listBox.SelectedItem is ListBoxItem item)
            {
                InsertSelectedItem(item);
            }
        }

        private void ListBox_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter || e.Key == Key.Tab)
            {
                ConfirmSelection();
                e.Handled = true;
            }
            else if (e.Key == Key.Escape)
            {
                Hide();
                e.Handled = true;
            }
        }
    }

    public enum AutoCompleteItemType
    {
        Directive,
        Function,
        Unit,
        Constant,
        Variable,
        Bracket,      // Para Vector y Matrix
        ExternalLang  // Para @{html}, @{cpp}, etc.
    }

    public class AutoCompleteItem
    {
        public string Text { get; }
        public AutoCompleteItemType Type { get; }

        public AutoCompleteItem(string text, AutoCompleteItemType type)
        {
            Text = text;
            Type = type;
        }
    }
}
