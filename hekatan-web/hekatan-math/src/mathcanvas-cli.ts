#!/usr/bin/env tsx
/**
 * MathCanvas CLI — Run .hcalc files from terminal with plain-text output
 *
 * Usage:
 *   tsx mathcanvas-cli.ts <file.hcalc>           — Run file, text output
 *   tsx mathcanvas-cli.ts <file.hcalc> --html     — Run file, HTML output
 *   tsx mathcanvas-cli.ts -e "x = 5; x^2 + 3"    — Evaluate expression
 *   tsx mathcanvas-cli.ts --repl                   — Interactive REPL
 */

import { parse } from "./parser.js";
import { parseExpression, evaluate, HekatanEnvironment, executeMultilineFunction } from "./evaluator.js";
import { renderNode, renderValue } from "./renderer.js";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

// ─── Hekatan CSS (base + Gabriola theme) ─────────────────
const HEKATAN_CSS = `
/* ═══ Hekatan Calc — Base Output Styles ═══ */
* { box-sizing: border-box; }
body {
  font-size: 11pt;
  font-family: 'Segoe UI', 'Arial Nova', Helvetica, sans-serif;
  margin: 0; padding: 0;
  background: #b0b0b0;
}

/* ─── Page Layout (A4) ─── */
.page {
  position: relative;
  background: var(--page-bg, #ffffff);
  width: 210mm; min-height: 297mm;
  padding: 10mm 10mm 10mm 12mm;
  margin: 10mm auto;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  box-sizing: border-box;
  font-family: 'Segoe UI', 'Arial Nova', Helvetica, sans-serif;
  font-size: 12pt; line-height: 135%;
}
.page + .page { page-break-before: always; }
.page > p:has(.eq) { text-align: center; margin: 0.2em 0; }
.page > p:has(.matrix) { margin: 0.6em 0; display: flex; align-items: center; flex-wrap: wrap; gap: 0 2px; }
.out-image64 { text-align: center; margin: 8px 0; }
.out-image64 img { display: inline-block; }

/* ─── Page Header/Footer ─── */
.page-header { margin: -2mm 0 4mm 0; font-family: 'Georgia Pro', 'Century Schoolbook', 'Times New Roman', Times, serif; font-size: 9pt; color: #555; }
.page-header .header-content { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 1.5mm; }
.page-header .header-rule { border: none; border-top: 0.5pt solid #888; margin: 0; }
.page-header .header-pagenum { font-style: italic; }
.page-header .header-section { font-style: italic; }
.page-footer { position: absolute; bottom: 4mm; left: 12mm; right: 10mm; font-family: 'Georgia Pro', 'Century Schoolbook', 'Times New Roman', Times, serif; font-size: 9pt; color: #555; }
.page-footer .footer-content { display: flex; justify-content: space-between; align-items: baseline; }
.page-footer .footer-rule { border: none; border-top: 0.5pt solid #888; margin: 0 0 1.5mm 0; }

/* ─── Tables ─── */
table { margin-left: auto !important; margin-right: auto !important; width: auto !important; border-collapse: collapse; }
svg.plot { display: block; margin-left: auto; margin-right: auto; }
td, th { padding: 2pt 4pt; vertical-align: top; }
table.bordered { margin-top: 1em; }
table.bordered th { background-color: #F0F0F0; border: solid 1pt #AAAAAA; }
table.bordered td { border: solid 1pt #CCCCCC; }
table.centered td, .matrix .td { text-align: center; }
table.data td { text-align: right; }
table.data td:first-child { text-align: left; padding-left: 0; }

/* ─── Headings ─── */
h1, h2, h3, h4, h5, h6 { font-family: 'Arial Nova', Helvetica, sans-serif; margin: 0.5em 0; padding: 0; line-height: 150%; }
h1 { font-size: 2.1em; } h2 { font-size: 1.7em; } h3 { font-size: 1.4em; }
h4 { font-size: 1.2em; } h5 { font-size: 1.1em; } h6 { font-size: 1.0em; }
p, li { margin: 0.05em 0; padding: 0; line-height: 120%; }

/* ═══ Equation Styles ═══ */
.eq, .matrix { font-family: 'Georgia Pro', 'Century Schoolbook', 'Times New Roman', Times, serif; }
.eq var { color: #06d; font-size: 105%; }
.eq i { color: #086; font-style: normal; font-size: 90%; }
.eq sub i { font-style: italic; font-size: inherit; color: inherit; }
.eq sub .idx-br { opacity: 0.3; font-style: normal; }
i.unit { color: #043 !important; font-size: 90% !important; vertical-align: -1pt; }
sup.unit { font-family: Calibri, Candara, Corbel, sans-serif; font-size: 70% !important; }
.eq b { font-weight: 600; }
.eq sub { font-family: Calibri, Candara, Corbel, sans-serif; font-size: 80%; vertical-align: -18%; margin-left: 1pt; }
.eq sup { display: inline-block; margin-left: 1pt; margin-top: -3pt; font-size: 75%; }
.eq small { font-family: Calibri, Candara, Corbel, sans-serif; font-size: 70%; }
.eq small var { font-family: 'Georgia Pro', 'Century Schoolbook', 'Times New Roman', Times, serif; font-size: 8.5pt; }
.eq small i { font-family: 'Georgia Pro', 'Century Schoolbook', 'Times New Roman', Times, serif; font-size: 6pt; }
.eq u, input, select { background-color: LightYellow; }

/* ─── Matrix ─── */
.matrix { display: inline-table; border-left: solid 1.5pt black; border-right: solid 1.5pt black; border-radius: 2pt; padding: 1pt 2pt; }
.matrix .tr { display: table-row; }
.matrix .td { white-space: nowrap; padding: 0 2pt; min-width: 10pt; display: table-cell; font-size: 10pt; text-align: center; }
.matrix .td:first-child, .matrix .td:last-child { display: none; }

/* ─── Fractions / Division ─── */
.dvc, .dvr, .dvs { display: inline-block; vertical-align: middle; white-space: nowrap; }
.dvc { padding-left: 2pt; padding-right: 2pt; text-align: center; line-height: 110%; }
.dvr { text-align: center; line-height: 110%; margin-bottom: 4pt; }
.dvs { text-align: left; line-height: 110%; }
.dvl { display: block; border-bottom: solid 1pt black; margin-top: 1pt; margin-bottom: 1pt; }
.dvr small { font-size: 65%; }

/* ─── N-ary Operators ─── */
.nary { color: #C080F0; font-size: 240%; font-family: Georgia Pro Light, serif; font-weight: 200; line-height: 80%; display: block; margin: -1pt 1pt 3pt 1pt; }
.nary em { display: block; transform: scaleX(0.7) rotate(7deg); }
.dvc.down { position: relative; top: 0.5em; }
.dvc.up { position: relative; bottom: 0.6em; }
.low { font-size: 70%; display: inline-block; position: relative; top: 1.2em; }

/* ─── Radical Signs ─── */
.r0, .r1, .r2, .r3, .o0, .o1, .o2, .o3, .b1, .b2, .b3, .c1, .c2, .c3, .c4, .c5, .c6, .c7, .c8 { display: inline-block; }
.r0, .r1, .r2, .r3 { margin-top: -1.5pt; margin-right: 1.5pt; vertical-align: top; background-repeat: no-repeat; background-size: cover; background-position: right top; }
.o0, .o1, .o2, .o3 { border-top: solid 0.75pt; line-height: 130%; vertical-align: middle; margin-top: 0.75pt; padding-top: 1.25pt; padding-left: 1pt; padding-right: 1pt; }
.radical-wrap { display: inline-block; vertical-align: middle; padding-left: 10pt; white-space: nowrap; }
.r { font-family: 'Times New Roman', Times, serif; font-size: 150%; display: inline-block; vertical-align: top; margin-left: -9.5pt; position: relative; top: 1pt; }
.r0 { background-image: url("data:image/svg+xml;base64,PHN2ZyB4bWxuczpzdmc9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZlcnNpb249IjEuMSIgdmlld0JveD0iMCAwIDEwIDIwIiBoZWlnaHQ9IjE1cHQiIHdpZHRoPSIxMHB4Ij4NCiAgPHBvbHlsaW5lIHBvaW50cz0iMCwxMyAyLDEyIDUsMTkgOSwwIiBzdHlsZT0ic3Ryb2tlOmJsYWNrOyBzdHJva2Utd2lkdGg6MC42cHQ7IHN0cm9rZS1saW5lam9pbjpyb3VuZDsgc3Ryb2tlLWxpbmVjYXA6cm91bmQ7IGZpbGw6bm9uZSIgLz4NCiAgPGxpbmUgeDE9IjIuMiIgeTE9IjEyLjMiIHgyPSI0LjYiIHkyPSIxOC43IiBzdHlsZT0ic3Ryb2tlOmJsYWNrOyBzdHJva2Utd2lkdGg6MC44cHQ7IHN0cm9rZS1saW5lY2FwOnJvdW5kOyIgLz4NCjwvc3ZnPg=="); width: 8pt; height: 16pt; margin-left: -8pt; }
.nth { position: relative; bottom: 1pt; }
.eq small.nth { font-size: 70%; }
sup.raised { vertical-align: top; }

/* ─── Bracket Sizes ─── */
.b1, .b2, .b3, .c1, .c2, .c3, .c4, .c5, .c6, .c7, .c8 { vertical-align: middle; font-weight: 100; font-stretch: ultra-condensed; }
.b0, .b1, .c1 { font-family: 'Jost* Thin', sans-serif; }
.b2, .b3, .c2, .c3, .c4, .c5, .c6, .c7, .c8 { font-family: 'Jost* Hairline', sans-serif; }
.b0 { font-size: 120%; font-weight: 600; padding: 0 1pt; }
.b1 { font-size: 240%; margin-top: -3pt; margin-left: -1pt; margin-right: -1pt; }
.b2 { font-size: 370%; margin-top: -5pt; margin-left: -3pt; margin-right: -3pt; }
.b3 { font-size: 520%; margin-top: -8pt; margin-left: -5pt; margin-right: -5pt; }
.c1 { font-size: 240%; margin-top: -4pt; }
.c2 { font-size: 360%; margin-top: -6pt; margin-left: -2.5pt; margin-right: -0.5pt; }
.c3 { font-size: 480%; margin-top: -8pt; margin-left: -3pt; margin-right: -1pt; }
.c4 { font-size: 600%; margin-top: -10pt; margin-left: -4pt; margin-right: -2pt; transform: scaleX(0.9); }

/* ─── Conditional Blocks ─── */
.block { display: inline-block; vertical-align: middle; padding-left: 4pt; margin-left: -1pt; border-left: solid 1pt #80b0e8; background: linear-gradient(to right, rgba(0, 192, 255, 0.06), rgba(0, 192, 255, 0.03)); }
.arr { color: #90c4f0; }
.cond { color: #E000D0; }

/* ─── Design Check ─── */
.err { color: Crimson; background-color: #FEE; }
.ok { color: Green; background-color: #F0FFF0; }
.ref { float: right; margin-left: 18pt; color: Green; background-color: #F8FFF0; }
.side { float: right; max-width: 50%; }
.plot { max-width: 100%; }

/* ─── Indent / Fold ─── */
.indent { border-left: 0.75pt solid #dddddd; padding-left: 2em; }
span.indent { display: inline-block; }

/* ─── Vector Arrow ─── */
.vec { font-family: 'Cambria Math', serif; color: #8af; font-style: normal; display: inline-block; vertical-align: 2pt; margin-left: 3pt; margin-right: -7pt; }

/* ─── Value Tooltip ─── */
.value { position: relative; background-color: #f4fbff; border-radius: 3pt; }
.value:after { content: ""; position: absolute; left: 100%; top: -100%; transform: translateY(-50%); margin-left: 2pt; height: 16pt; line-height: 16pt; width: fit-content; white-space: nowrap; min-width: 10pt; z-index: 1; padding: 0 6pt; border-radius: 6pt 6pt 6pt 0; background: #000; color: #fff; font-family: 'Segoe UI', sans-serif; font-style: normal; font-size: 10pt; text-align: center; display: none; opacity: 0; }
.value:hover:after { content: attr(data-value); display: block; opacity: 1; }

/* ─── @{eq} Block Styles ─── */
.eq-block { margin: 0.5em 0; }
.eq-line { text-align: center; margin: 0.4em 0; line-height: 200%; }
.eq-numbered { position: relative; }
.eq-numbered .ref, .eq-def .ref { float: right; color: inherit; background: none; margin-top: 0; font-size: 100%; }
.eq-align-left .eq-line { text-align: left; padding-left: 1em; }
.eq-align-right .eq-line { text-align: right; padding-right: 1em; }
.eq-align-tbl { font-family: 'Georgia Pro', 'Century Schoolbook', 'Times New Roman', Times, serif; }
.eq-align-tbl td { vertical-align: baseline; }
.eq-def { text-align: left; padding-left: 2em; }
.eq-def-text { color: #555; font-style: italic; font-family: 'Segoe UI', sans-serif; font-size: 90%; margin-left: 1em; }
.eq-fn { font-style: normal; font-weight: normal; font-family: inherit; }

/* ─── Overbar, hat, tilde, dot ─── */
.eq-overbar { display: inline-block; text-decoration: overline; text-decoration-thickness: 1.5px; }
.eq-hat { display: inline-block; position: relative; }
.eq-hat::after { content: '\\0302'; position: absolute; left: 50%; top: -0.35em; transform: translateX(-50%); font-size: 1.1em; }
.eq-tilde { display: inline-block; position: relative; }
.eq-tilde::after { content: '\\0303'; position: absolute; left: 50%; top: -0.35em; transform: translateX(-50%); font-size: 1.1em; }
.eq-dot { display: inline-block; position: relative; }
.eq-dot::after { content: '\\0307'; position: absolute; left: 50%; top: -0.4em; transform: translateX(-50%); font-size: 1.2em; }
.eq-ddot { display: inline-block; position: relative; }
.eq-ddot::after { content: '\\0308'; position: absolute; left: 50%; top: -0.4em; transform: translateX(-50%); font-size: 1.2em; }

/* ─── Inline eq ─── */
.inline-eq { display: inline; white-space: nowrap; }
.inline-eq var { color: inherit; font-size: inherit; }
.inline-eq i { color: inherit; font-size: inherit; }

/* ─── @{eq} Vector/Matrix ─── */
.eq-vec { display: inline-flex; align-items: center; vertical-align: middle; }
.eq-brace-l, .eq-brace-r { display: flex; flex-direction: column; align-self: stretch; width: 5px; }
.eq-brace-l::before, .eq-brace-l::after, .eq-brace-r::before, .eq-brace-r::after { content: ''; flex: 1; min-height: 4px; }
.eq-brace-l::before { border-right: 1px solid currentColor; border-bottom: 1px solid currentColor; border-bottom-right-radius: 5px; }
.eq-brace-l::after { border-right: 1px solid currentColor; border-top: 1px solid currentColor; border-top-right-radius: 5px; }
.eq-brace-r::before { border-left: 1px solid currentColor; border-bottom: 1px solid currentColor; border-bottom-left-radius: 5px; }
.eq-brace-r::after { border-left: 1px solid currentColor; border-top: 1px solid currentColor; border-top-left-radius: 5px; }
.eq-col { display: inline-flex; flex-direction: column; align-items: center; vertical-align: middle; }
.eq-cell { display: block; text-align: center; padding: 0 4pt; line-height: 1.4; white-space: nowrap; }
.eq-mat { display: inline-flex; flex-direction: column; vertical-align: middle; padding: 2pt 0; position: relative; margin-left: 5pt; margin-right: 5pt; }
.eq-mat::before { content: ''; position: absolute; left: -5pt; top: 0; bottom: 0; width: 5pt; border-left: 1.5pt solid currentColor; border-top: 1.5pt solid currentColor; border-bottom: 1.5pt solid currentColor; }
.eq-mat::after { content: ''; position: absolute; right: -5pt; top: 0; bottom: 0; width: 5pt; border-right: 1.5pt solid currentColor; border-top: 1.5pt solid currentColor; border-bottom: 1.5pt solid currentColor; }
.eq-mrow { display: flex; justify-content: center; }
.eq-mcell { padding: 0 6pt; text-align: center; line-height: 1.4; white-space: nowrap; }

/* ─── Cell Array ─── */
.cell-array { display: inline-flex; gap: 12px; align-items: center; vertical-align: middle; }
.cell-element { display: inline-flex; align-items: center; gap: 4px; vertical-align: middle; }
.cell-label { font-style: italic; color: #1565c0; }
.cell-brace { font-size: 160%; font-weight: 300; color: #333; vertical-align: middle; line-height: 1; font-family: 'Jost* Thin', 'Segoe UI', sans-serif; }
.cell-sep { color: #888; margin: 0 2px; vertical-align: middle; }

/* ─── Output Line Wrappers ─── */
.out-line { margin: 0.05em 0; line-height: 120%; white-space: normal; word-wrap: break-word; overflow-wrap: break-word; }
.out-empty { height: 1em; }
.out-comment { color: #444; margin: 0.05em 0; line-height: 120%; }
.out-error { color: Crimson; background-color: #FEE; font-size: 0.88em; margin: 2px 0; padding: 2px 4px; border-radius: 3px; }
.out-symbolic { color: #c792ea; font-style: italic; }
.cas-badge { display: inline-block; font-size: 0.6em; color: #888; background: #f0f0f0; border-radius: 3px; padding: 0 3px; margin-left: 6px; vertical-align: super; font-style: normal; }

/* ─── Bold/Black Equations ─── */
.eq-bold { font-weight: 600; }
.eq-bold var { font-weight: 600; }
.eq-bold .dvl { border-bottom-width: 1.2pt; }

/* ─── lusolve Display ─── */
.lsolve-eq-wrap { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; vertical-align: middle; }
.lsolve-sign { font-size: 1.1em; padding: 0 2px; vertical-align: middle; }
.lsolve-sym-vec { display: inline-grid; grid-template-columns: auto; gap: 0; margin: 4px 2px; vertical-align: middle; padding: 2pt 5pt; }
.lsolve-sym-vec .sym-row { white-space: nowrap; padding: 1pt 5pt; text-align: center; font-size: 10pt; }

/* ─── Matrix / Vector Brackets ─── */
.mat-wrap { display: inline-flex; align-items: center; vertical-align: middle; gap: 0; }
.mat-bkt { display: flex; flex-direction: column; align-self: stretch; width: 5px; min-height: 1em; }
.mat-bkt.left { border-left: 1.5pt solid currentColor; border-top: 1.5pt solid currentColor; border-bottom: 1.5pt solid currentColor; border-radius: 3pt 0 0 3pt; margin-right: 2pt; }
.mat-bkt.right { border-right: 1.5pt solid currentColor; border-top: 1.5pt solid currentColor; border-bottom: 1.5pt solid currentColor; border-radius: 0 3pt 3pt 0; margin-left: 2pt; }
table.mat { border-collapse: collapse; margin: 0; }
table.mat td { text-align: right; padding: 1pt 4pt; font-size: 10pt; white-space: nowrap; }

/* ═══ THEME: Gabriola — estilo Mathcad Prime ═══ */
.theme-gabriola {
  background: #fff;
  font-family: Gabriola, 'Cambria Math', 'STIX Two Math', 'Times New Roman', serif;
  font-size: 14pt; line-height: 1.45; color: #000;
  padding: 20px 30px;
}
.theme-gabriola .eq, .theme-gabriola .matrix {
  font-family: Gabriola, 'Cambria Math', 'STIX Two Math', 'Times New Roman', serif;
  font-size: 14pt; line-height: 1.6; color: #000;
}
.theme-gabriola .out-line { line-height: 160%; margin: 0.15em 0; }
.theme-gabriola .eq-bold { font-weight: 600; }
.theme-gabriola .eq-bold var { font-weight: 600; }
.theme-gabriola .eq-bold .dvc, .theme-gabriola .eq-bold .dvr, .theme-gabriola .eq-bold .dvs { font-weight: 600; }
.theme-gabriola .eq-bold .dvl { border-bottom-width: 1.2pt; }
.theme-gabriola .eq var {
  font-family: Gabriola, 'Cambria Math', 'STIX Two Math', serif;
  color: #000; font-size: 100%; font-style: italic;
}
.theme-gabriola .eq i { color: #000; font-style: italic; font-size: 100%; font-weight: normal; }
.theme-gabriola .eq b { font-weight: normal; font-style: normal; color: #000; }
.theme-gabriola .eq sub {
  font-family: Gabriola, 'Cambria Math', 'STIX Two Math', serif;
  font-size: 70%; vertical-align: -0.25em; margin-left: 1pt; line-height: 0;
}
.theme-gabriola .eq sup { display: inline-block; margin-left: 1pt; font-size: 70%; vertical-align: 0.58em; line-height: 0; }
.theme-gabriola .unit { font-size: 0.85em; color: #00008B; font-weight: bold; font-style: italic; font-family: Gabriola, 'Cambria Math', serif; }
.theme-gabriola .val { font-weight: 600; color: #000; }
.theme-gabriola .matrix { font-family: Gabriola, 'Cambria Math', 'STIX Two Math', serif; }
.theme-gabriola .matrix::before { border-color: #000; border-width: 1.5pt; }
.theme-gabriola .matrix::after { border-color: #000; border-width: 1.5pt; }
.theme-gabriola .matrix .td { font-family: Gabriola, 'Cambria Math', 'STIX Two Math', serif; font-size: 11pt; }
.theme-gabriola .mat-trunc { display: inline-grid; position: relative; gap: 0; align-items: center; vertical-align: middle; }
.theme-gabriola .mat-trunc .mat-row-idx { color: #999; font-size: 0.8em; text-align: right; padding: 0 4px 0 0; user-select: none; }
.theme-gabriola .mat-trunc .mat-col-idx { color: #999; font-size: 0.75em; text-align: center; padding: 0 3pt 2pt 3pt; user-select: none; }
.theme-gabriola .mat-trunc .mat-cell { text-align: right; padding: 0 3pt; font-family: Gabriola, 'Cambria Math', 'STIX Two Math', serif; font-size: 12pt; }
.theme-gabriola .mat-trunc .mat-dots { color: #999; font-size: 0.9em; user-select: none; }
.theme-gabriola .mat-trunc .mat-bracket { display: block; position: absolute; top: 0; bottom: 0; left: 0; right: 0; border-left: 1.87px solid currentColor; border-right: 1.87px solid currentColor; border-radius: 4.5pt; pointer-events: none; z-index: 0; }
.theme-gabriola .cell-array { font-family: Gabriola, 'Cambria Math', 'STIX Two Math', serif; font-size: 14pt; }
.theme-gabriola .cell-element { font-family: Gabriola, 'Cambria Math', 'STIX Two Math', serif; font-size: 14pt; }
.theme-gabriola .cell-label { font-family: Tahoma, 'Segoe UI', sans-serif; font-style: normal; color: #2E3192; font-size: 10pt; }
.theme-gabriola .cell-label var { font-style: normal; }
.theme-gabriola .cell-brace { font-size: 160%; font-weight: 300; color: #333; font-family: Gabriola, 'Cambria Math', serif; }
.theme-gabriola .cell-sep { color: #888; }
.theme-gabriola .idx-br { color: #2E3192; }
.theme-gabriola .func-def { color: #555; font-style: italic; font-family: Gabriola, 'Cambria Math', serif; font-size: 14pt; }
.theme-gabriola .func-keyword { color: #7b1fa2; font-weight: 600; font-style: normal; font-family: Tahoma, 'Segoe UI', sans-serif; font-size: 10pt; }
.theme-gabriola .func-name { color: #2E3192; font-weight: 600; font-style: italic; font-family: Gabriola, 'Cambria Math', serif; font-size: 14pt; }
.theme-gabriola .out-comment { font-family: Tahoma, 'Segoe UI', Calibri, sans-serif; font-size: 11pt; color: #333; }
.theme-gabriola .dvc { padding-left: 3pt; padding-right: 3pt; line-height: 120%; }
.theme-gabriola .dvl { padding: 1px 4px; border-bottom: solid 0.8pt #000; margin-top: 2pt; margin-bottom: 2pt; }
.theme-gabriola .dvl:last-child { border-bottom: none; }
.theme-gabriola .radical-wrap { display: inline-flex; align-items: stretch; vertical-align: middle; padding-left: 0; line-height: 1; }
.theme-gabriola .r0 { background-image: none; width: auto; height: auto; margin-left: 0; margin-top: 0; margin-right: 0; font-family: Gabriola, 'Bell MT', 'STIX Two Math', serif; font-size: 120%; display: flex; align-items: flex-end; }
.theme-gabriola .r0::before { content: '\\221A'; }
.theme-gabriola .o0 { display: inline-block; border-top: 0.8px solid #000; padding: 2px 3px 0 2px; margin-top: 1px; line-height: 1.2; vertical-align: baseline; }
.theme-gabriola .eq-brace-l, .theme-gabriola .eq-brace-r { color: #000; }
.theme-gabriola .eq-mat { color: #000; }
.theme-gabriola .eq-mcell, .theme-gabriola .eq-cell { font-size: 11pt; }
.theme-gabriola .nary { color: #000; font-size: 160%; font-family: Gabriola, 'Cambria Math', 'STIX Two Math', serif; font-weight: normal; font-style: normal; line-height: 0; display: block; margin: 0; padding: 0.8em 0; transform: scaleY(1.3); }
.theme-gabriola .nary em { transform: scaleX(0.75) rotate(6deg); }
.theme-gabriola h1 { font-family: Gabriola, 'Cambria Math', serif; font-size: 22pt; font-weight: normal; color: #2E3192; border-bottom: none; padding-bottom: 4px; }
.theme-gabriola h2 { font-family: Gabriola, 'Cambria Math', serif; font-size: 18pt; font-weight: normal; color: #2E3192; }
.theme-gabriola h3 { font-family: Gabriola, 'Cambria Math', serif; font-size: 16pt; font-weight: normal; color: #2E3192; }
.theme-gabriola .ok { color: green; background-color: #F0FFF0; padding: 1px 4px; font-size: 9pt; }
.theme-gabriola .err { color: red; background-color: #FFF0F0; padding: 1px 4px; font-size: 9pt; }
.theme-gabriola .lsolve-sym-vec .td { font-family: Gabriola, 'Cambria Math', 'STIX Two Math', serif; font-size: 12pt; }
.theme-gabriola .mat-wrap { font-family: Gabriola, 'Cambria Math', 'STIX Two Math', serif; }
.theme-gabriola .eq-align-tbl { font-family: Gabriola, 'Cambria Math', 'STIX Two Math', serif; }
.theme-gabriola .eq-align-tbl td { vertical-align: baseline; }
.theme-gabriola table.mat td { font-family: Gabriola, 'Cambria Math', 'STIX Two Math', serif; font-size: 12pt; }

/* ═══ Print ═══ */
@media print {
  body { margin: 0; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: auto; min-height: auto; padding: 0; margin: 0; box-shadow: none; }
}
@page { size: A4 portrait; margin: 20mm 10mm 15mm 20mm; }
`;

// ─── ANSI colors ──────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

// ─── Strip HTML tags for plain text ───────────────────────
function stripHtml(html: string): string {
  return html
    // Convert <h1>-<h6> to emphasized text
    .replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, (_m, level, text) => {
      const prefix = level === "1" ? "═══" : level === "2" ? "───" : level === "3" ? "---" : "";
      const stripped = stripTags(text);
      if (prefix) return `\n${prefix} ${stripped} ${prefix}\n`;
      return `  ${stripped}\n`;
    })
    // Convert <hr> to line
    .replace(/<hr\s*\/?>/gi, "─".repeat(60))
    // Convert <p class="comment"> to description
    .replace(/<p class="comment">(.*?)<\/p>/gi, (_m, text) => `  ${C.dim}${stripTags(text)}${C.reset}`)
    // Convert line divs
    .replace(/<div class="spacer"><\/div>/gi, "")
    // Convert <div class="line ..."> blocks
    .replace(/<div class="line[^"]*">(.*?)<\/div>/gi, (_m, content) => `  ${stripTags(content)}`)
    // Convert error divs
    .replace(/<div class="line error">(.*?)<\/div>/gi, (_m, content) => `  ${C.red}ERROR: ${stripTags(content)}${C.reset}`)
    // Convert function definitions
    .replace(/<div class="line fn-def">(.*?)<\/div>/gi, (_m, content) => `  ${C.cyan}${stripTags(content)}${C.reset}`)
    // Strip remaining HTML
    .replace(/<[^>]+>/g, "")
    // Decode HTML entities
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ").replace(/&emsp;/g, "  ")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(parseInt(code)))
    .replace(/&times;/g, "×").replace(/&minus;/g, "−").replace(/&plusmn;/g, "±")
    .replace(/&radic;/g, "√").replace(/&infin;/g, "∞")
    // Clean up whitespace
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&emsp;/g, "  ");
}

// ─── Text-mode parse: evaluate and print in plain text ────
function parseText(source: string, env?: HekatanEnvironment): { text: string; env: HekatanEnvironment } {
  const e = env ?? new HekatanEnvironment();
  const lines = source.split("\n");
  const output: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty line
    if (!trimmed) { output.push(""); i++; continue; }

    // Comment //
    if (trimmed.startsWith("//")) { i++; continue; }

    // @{hide} ... @{show}
    if (/^@\{hide\}\s*$/i.test(trimmed)) {
      const hideLines: string[] = [];
      i++;
      while (i < lines.length) {
        if (/^@\{show\}\s*$/i.test(lines[i].trim())) { i++; break; }
        hideLines.push(lines[i]);
        i++;
      }
      parseText(hideLines.join("\n"), e);
      continue;
    }

    // @{eq} block — display equations as-is
    if (/^@\{eq\b/i.test(trimmed)) {
      output.push(`${C.blue}${C.bold}  ┌─ Equations ─┐${C.reset}`);
      i++;
      while (i < lines.length) {
        const lt = lines[i].trim();
        if (/^@\{end\s+eq\}/i.test(lt)) { i++; break; }
        if (lt) {
          // Split by | for description
          const parts = lt.split("|");
          const expr = parts[0].trim();
          const desc = parts[1]?.trim();
          if (desc) {
            output.push(`  ${C.cyan}  ${expr}${C.reset}${C.dim}  ← ${desc}${C.reset}`);
          } else {
            output.push(`  ${C.cyan}  ${expr}${C.reset}`);
          }
        }
        i++;
      }
      output.push(`${C.blue}  └──────────────┘${C.reset}`);
      continue;
    }

    // @{plot} block — just show description
    if (/^@\{plot\b/i.test(trimmed)) {
      output.push(`${C.magenta}  [Plot]${C.reset}`);
      const plotConfig: string[] = [];
      i++;
      while (i < lines.length) {
        const lt = lines[i].trim();
        if (/^@\{end\s+plot\}/i.test(lt)) { i++; break; }
        if (lt.startsWith("title:")) output.push(`${C.magenta}  Title: ${lt.slice(6).trim()}${C.reset}`);
        if (lt.startsWith("function:") || lt.match(/^function\d*:/))
          plotConfig.push(lt.split(":").slice(1).join(":").trim());
        i++;
      }
      if (plotConfig.length) {
        output.push(`${C.dim}  Functions: ${plotConfig.join(", ")}${C.reset}`);
      }
      output.push(`${C.magenta}  (Plot rendered in GUI mode)${C.reset}`);
      continue;
    }

    // @{svg}, @{three}, @{plotly} blocks — skip content
    if (/^@\{(svg|three|plotly)\b/i.test(trimmed)) {
      const blockType = trimmed.match(/^@\{(\w+)/i)![1];
      output.push(`${C.magenta}  [${blockType} block — rendered in GUI mode]${C.reset}`);
      i++;
      while (i < lines.length) {
        if (new RegExp(`^@\\{end\\s+${blockType}\\}`, "i").test(lines[i].trim())) { i++; break; }
        i++;
      }
      continue;
    }

    // @{config ...} — skip silently
    if (/^@\{config\b[^}]*\}\s*$/i.test(trimmed)) { i++; continue; }

    // @{pagebreak} — skip
    if (/^@\{pagebreak\}\s*$/i.test(trimmed)) { output.push("─".repeat(60)); i++; continue; }

    // --- horizontal rule
    if (/^---+\s*$/.test(trimmed)) { output.push("─".repeat(60)); i++; continue; }

    // @{cells} |var = expr|var2 = expr2| — inline variable assignments
    if (/^@\{cells\}\s*\|/.test(trimmed)) {
      const cellPart = trimmed.replace(/^@\{cells\}\s*/, "");
      const cells = cellPart.split("|").map(s => s.trim()).filter(Boolean);
      for (const cell of cells) {
        try {
          const ast = parseExpression(cell);
          const value = evaluate(ast, e);
          if (ast.type === "assign") {
            output.push(`  ${C.bold}${ast.name}${C.reset} = ${C.green}${formatValue(value)}${C.reset}`);
          } else {
            output.push(`  ${cell} ${C.dim}=${C.reset} ${C.green}${formatValue(value)}${C.reset}`);
          }
        } catch (err: any) {
          output.push(`${C.red}  ERROR: ${cell} → ${err.message}${C.reset}`);
        }
      }
      i++; continue;
    }

    // @{text} ... @{end text} — display as plain text
    if (/^@\{text\}\s*$/i.test(trimmed)) {
      i++;
      while (i < lines.length) {
        const lt = lines[i].trim();
        if (/^@\{end\s+text\}/i.test(lt)) { i++; break; }
        output.push(`${C.dim}  ${lines[i]}${C.reset}`);
        i++;
      }
      continue;
    }

    // @{columns} ... @{end columns} — skip structure, parse content
    if (/^@\{columns\b/i.test(trimmed)) {
      i++;
      const colLines: string[] = [];
      while (i < lines.length) {
        const lt = lines[i].trim();
        if (/^@\{end\s+columns\}/i.test(lt)) { i++; break; }
        colLines.push(lines[i]);
        i++;
      }
      const result = parseText(colLines.join("\n"), e);
      if (result.text.trim()) output.push(result.text);
      continue;
    }

    // @{draw} block — skip content
    if (/^@\{draw\b/i.test(trimmed)) {
      output.push(`${C.magenta}  [draw block — rendered in GUI mode]${C.reset}`);
      i++;
      while (i < lines.length) {
        if (/^@\{end\s+draw\}/i.test(lines[i].trim())) { i++; break; }
        i++;
      }
      continue;
    }

    // Heading
    if (/^#{1,6}\s+/.test(trimmed) && !/^#(?:for|if|else|end|while|loop|repeat|until|next)\b/i.test(trimmed)) {
      const level = (trimmed.match(/^#+/) || [""])[0].length;
      const text = trimmed.slice(level).trim();
      if (level === 1) {
        output.push(`\n${C.bold}${C.green}${"═".repeat(60)}${C.reset}`);
        output.push(`${C.bold}${C.green}  ${text}${C.reset}`);
        output.push(`${C.bold}${C.green}${"═".repeat(60)}${C.reset}`);
      } else if (level === 2) {
        output.push(`\n${C.bold}${C.yellow}${"─".repeat(50)}${C.reset}`);
        output.push(`${C.bold}${C.yellow}  ${text}${C.reset}`);
        output.push(`${C.bold}${C.yellow}${"─".repeat(50)}${C.reset}`);
      } else {
        output.push(`\n${C.bold}  ${"#".repeat(level)} ${text}${C.reset}`);
      }
      i++; continue;
    }

    // Description > text
    if (trimmed.startsWith(">")) {
      output.push(`${C.dim}  ${trimmed.slice(1).trim()}${C.reset}`);
      i++; continue;
    }

    // Comment ' text
    if (trimmed.startsWith("'")) {
      output.push(`${C.dim}  ${trimmed.slice(1).trim()}${C.reset}`);
      i++; continue;
    }

    // For loop
    if (/^#?for\s+/i.test(trimmed)) {
      const result = parseForText(lines, i, e);
      output.push(...result.lines);
      i = result.nextLine;
      continue;
    }

    // If block
    if (/^#?if\s+/i.test(trimmed)) {
      const result = parseIfText(lines, i, e);
      output.push(...result.lines);
      i = result.nextLine;
      continue;
    }

    // Multiline function: function[out1, out2] = name(params) ... end
    const mlFnMatch = trimmed.match(
      /^function\s*(?:(?:\[([^\]]*)\]|(\w+))\s*=\s*)?(\w+)\s*\(([^)]*)\)\s*$/i
    );
    if (mlFnMatch) {
      const funcName = mlFnMatch[3];
      const paramStr = mlFnMatch[4] || "";
      let outputs: string[];
      if (mlFnMatch[1]) {
        outputs = mlFnMatch[1].split(",").map(s => s.trim()).filter(Boolean);
      } else if (mlFnMatch[2]) {
        outputs = [mlFnMatch[2]];
      } else {
        outputs = [funcName];
      }
      const params = paramStr.split(",").map(s => s.trim()).filter(Boolean);
      // Collect body lines until matching 'end'
      const bodyLines: string[] = [];
      let depth = 1;
      i++;
      while (i < lines.length && depth > 0) {
        const bLine = lines[i].trim();
        const bLower = bLine.replace(/\/\/.*$/, "").trim().toLowerCase();
        if (/^(for|while|if)\s+/.test(bLower)) depth++;
        if (bLower === "end") {
          depth--;
          if (depth === 0) break;
        }
        bodyLines.push(lines[i]);
        i++;
      }
      i++; // skip the closing 'end'
      e.multilineFunctions.set(funcName, { params, outputs, lines: bodyLines });
      output.push(`${C.cyan}  function ${funcName}(${params.join(", ")}) → [${outputs.join(", ")}]${C.reset}`);
      continue;
    }

    // Function definition: f(x) = expr
    const fnMatch = trimmed.match(/^([A-Za-z_]\w*)\(([^)]*)\)\s*=\s*(.+)$/);
    if (fnMatch) {
      const [, fname, paramsStr, bodyStr] = fnMatch;
      const params = paramsStr.split(/[,;]/).map(s => s.trim()).filter(Boolean);
      try {
        const body = parseExpression(bodyStr);
        e.userFunctions.set(fname, { params, body });
        output.push(`${C.cyan}  ${fname}(${params.join(", ")}) = ${bodyStr}${C.reset}`);
      } catch (err: any) {
        output.push(`${C.red}  ERROR: ${fname} — ${err.message}${C.reset}`);
      }
      i++; continue;
    }

    // Multi-output assignment: [a, b] = func(args)
    const multiOutMatch = trimmed.match(/^\[([^\]]+)\]\s*=\s*(\w+)\s*\(([^)]*)\)\s*$/);
    if (multiOutMatch) {
      const outNames = multiOutMatch[1].split(",").map(s => s.trim()).filter(Boolean);
      const funcCallName = multiOutMatch[2];
      const argsStr = multiOutMatch[3];
      try {
        const argExprs = argsStr ? argsStr.split(",").map(s => s.trim()) : [];
        const argVals = argExprs.map(a => evaluate(parseExpression(a), e));
        const mlFn = e.multilineFunctions.get(funcCallName);
        if (mlFn) {
          const result = executeMultilineFunction(mlFn, argVals, e);
          if (result && result.__cell) {
            for (let k = 0; k < outNames.length; k++) {
              const val = result.elements[k] ?? 0;
              e.setVar(outNames[k], val);
              output.push(`  ${C.bold}${outNames[k]}${C.reset} = ${C.green}${formatValue(val)}${C.reset}`);
            }
          } else {
            e.setVar(outNames[0], result);
            output.push(`  ${C.bold}${outNames[0]}${C.reset} = ${C.green}${formatValue(result)}${C.reset}`);
          }
        } else {
          throw new Error(`Unknown function: ${funcCallName}`);
        }
      } catch (err: any) {
        output.push(`${C.red}  ERROR: ${trimmed} → ${err.message}${C.reset}`);
      }
      i++; continue;
    }

    // Expression / assignment
    try {
      // Remove inline comment
      let expr = trimmed;
      if (expr.includes("//")) expr = expr.slice(0, expr.indexOf("//")).trim();

      const ast = parseExpression(expr);
      const value = evaluate(ast, e);

      if (ast.type === "assign") {
        const name = ast.name;
        const formatted = formatValue(value);
        output.push(`  ${C.bold}${name}${C.reset} = ${C.green}${formatted}${C.reset}`);
      } else {
        const formatted = formatValue(value);
        output.push(`  ${expr} ${C.dim}=${C.reset} ${C.green}${formatted}${C.reset}`);
      }
    } catch (err: any) {
      output.push(`${C.red}  ERROR: ${trimmed} → ${err.message}${C.reset}`);
    }
    i++;
  }

  return { text: output.join("\n"), env: e };
}

// ─── For loop (text mode) ─────────────────────────────────
function parseForText(lines: string[], startIdx: number, env: HekatanEnvironment): { lines: string[]; nextLine: number } {
  const out: string[] = [];
  const header = lines[startIdx].trim().replace(/^#/, "");
  // Parse: for var = start : end  OR  for var = start : step : end
  const m = header.match(/^for\s+(\w+)\s*=\s*(.+?)\s*:\s*(.+?)(?:\s*:\s*(.+))?\s*$/i);
  if (!m) {
    out.push(`${C.red}  Invalid for: ${header}${C.reset}`);
    return { lines: out, nextLine: startIdx + 1 };
  }

  const varName = m[1];
  let startVal: number, endVal: number, step: number;

  try {
    if (m[4]) {
      // for i = start : step : end
      startVal = evaluate(parseExpression(m[2]), env) as number;
      step = evaluate(parseExpression(m[3]), env) as number;
      endVal = evaluate(parseExpression(m[4]), env) as number;
    } else {
      startVal = evaluate(parseExpression(m[2]), env) as number;
      endVal = evaluate(parseExpression(m[3]), env) as number;
      step = startVal <= endVal ? 1 : -1;
    }
  } catch (err: any) {
    out.push(`${C.red}  ERROR in for range: ${err.message}${C.reset}`);
    return { lines: out, nextLine: startIdx + 1 };
  }

  // Collect body lines
  const bodyLines: string[] = [];
  let idx = startIdx + 1;
  let depth = 1;
  while (idx < lines.length) {
    const lt = lines[idx].trim();
    if (/^#?for\s+/i.test(lt) || /^#?if\s+/i.test(lt) || /^#?while\s+/i.test(lt)) depth++;
    if (/^#?(end|loop)\s*$/i.test(lt)) { depth--; if (depth === 0) { idx++; break; } }
    bodyLines.push(lines[idx]);
    idx++;
  }

  // Execute loop
  const maxIter = 10000;
  let count = 0;
  for (let v = startVal; step > 0 ? v <= endVal : v >= endVal; v += step) {
    if (count++ > maxIter) { out.push(`${C.yellow}  (loop limit reached)${C.reset}`); break; }
    env.variables.set(varName, v);
    const result = parseText(bodyLines.join("\n"), env);
    if (result.text.trim()) out.push(result.text);
  }

  return { lines: out, nextLine: idx };
}

// ─── If block (text mode) ─────────────────────────────────
function parseIfText(lines: string[], startIdx: number, env: HekatanEnvironment): { lines: string[]; nextLine: number } {
  const out: string[] = [];
  const header = lines[startIdx].trim().replace(/^#/, "");
  const condStr = header.replace(/^if\s+/i, "").trim();

  let condResult: boolean;
  try {
    const val = evaluate(parseExpression(condStr), env);
    condResult = typeof val === "number" ? val !== 0 : !!val;
  } catch {
    condResult = false;
  }

  const ifBody: string[] = [];
  const elseBody: string[] = [];
  let inElse = false;
  let idx = startIdx + 1;
  let depth = 1;

  while (idx < lines.length) {
    const lt = lines[idx].trim();
    if (/^#?if\s+/i.test(lt)) depth++;
    if (/^#?end(\s+if)?\s*$/i.test(lt)) { depth--; if (depth === 0) { idx++; break; } }
    if (depth === 1 && /^#?else\s*$/i.test(lt)) { inElse = true; idx++; continue; }
    if (inElse) elseBody.push(lines[idx]);
    else ifBody.push(lines[idx]);
    idx++;
  }

  const body = condResult ? ifBody : elseBody;
  if (body.length) {
    const result = parseText(body.join("\n"), env);
    if (result.text.trim()) out.push(result.text);
  }

  return { lines: out, nextLine: idx };
}

// ─── Format value for display ─────────────────────────────
function formatValue(val: any, decimals = 6): string {
  if (typeof val === "number") {
    if (Number.isInteger(val)) return val.toString();
    return val.toPrecision(decimals).replace(/\.?0+$/, "");
  }
  if (Array.isArray(val)) {
    if (val.length === 0) return "[]";
    if (Array.isArray(val[0])) {
      // Matrix
      const rows = val.map((r: number[]) => r.map(v => formatValue(v, decimals)).join("\t"));
      return `[\n    ${rows.join("\n    ")}\n  ]`;
    }
    // Vector
    return `[${val.map((v: number) => formatValue(v, decimals)).join(", ")}]`;
  }
  return String(val);
}

// ─── REPL mode ────────────────────────────────────────────
async function runRepl() {
  const env = new HekatanEnvironment();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log(`${C.bold}${C.cyan}MathCanvas REPL${C.reset} — type expressions, 'quit' to exit`);
  console.log(`${C.dim}Supports: variables, functions, vectors, matrices, for/if${C.reset}\n`);

  const prompt = () => {
    rl.question(`${C.green}mc>${C.reset} `, (input) => {
      const trimmed = input.trim();
      if (!trimmed) { prompt(); return; }
      if (trimmed === "quit" || trimmed === "exit") { rl.close(); return; }
      if (trimmed === "vars") {
        console.log(`${C.cyan}Variables:${C.reset}`);
        for (const [k, v] of env.variables) {
          console.log(`  ${k} = ${formatValue(v)}`);
        }
        prompt(); return;
      }
      if (trimmed === "funcs") {
        console.log(`${C.cyan}Functions:${C.reset}`);
        for (const [k, v] of env.userFunctions) {
          console.log(`  ${k}(${v.params.join(", ")})`);
        }
        prompt(); return;
      }

      const result = parseText(trimmed, env);
      if (result.text.trim()) console.log(result.text);
      prompt();
    });
  };
  prompt();
}

// ─── Main ─────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help") {
    console.log(`
${C.bold}${C.cyan}MathCanvas CLI${C.reset} — Hekatan Math Document Processor

${C.bold}Usage:${C.reset}
  tsx mathcanvas-cli.ts <file.hcalc>           Run file (text output)
  tsx mathcanvas-cli.ts <file.hcalc> --html    Run file (HTML output)
  tsx mathcanvas-cli.ts -e "expression"         Evaluate expression
  tsx mathcanvas-cli.ts --repl                  Interactive mode

${C.bold}Examples:${C.reset}
  tsx mathcanvas-cli.ts newton-raphson.hcalc
  tsx mathcanvas-cli.ts -e "x = 5; x^2 + 3*x - 1"
  tsx mathcanvas-cli.ts --repl
`);
    return;
  }

  // REPL mode
  if (args[0] === "--repl") {
    await runRepl();
    return;
  }

  // Expression mode
  if (args[0] === "-e" && args[1]) {
    const env = new HekatanEnvironment();
    const expressions = args.slice(1).join(" ").split(";");
    for (const expr of expressions) {
      const trimmed = expr.trim();
      if (!trimmed) continue;
      const result = parseText(trimmed, env);
      if (result.text.trim()) console.log(result.text);
    }
    return;
  }

  // File mode
  const filePath = args[0];
  const htmlMode = args.includes("--html");

  if (!fs.existsSync(filePath)) {
    console.error(`${C.red}File not found: ${filePath}${C.reset}`);
    process.exit(1);
  }

  const source = fs.readFileSync(filePath, "utf-8");
  const fileName = path.basename(filePath);

  if (htmlMode) {
    // HTML output using the full parser
    const { html, env } = parse(source);
    // Wrap in Hekatan template with Gabriola theme
    const fullHtml = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${fileName} — Hekatan Calc</title>
<style>
${HEKATAN_CSS}
</style>
</head><body>
<div class="page theme-gabriola">
${html}
</div>
</body></html>`;

    const outPath = filePath.replace(/\.hcalc$/, ".html");
    fs.writeFileSync(outPath, fullHtml, "utf-8");
    console.log(`${C.green}HTML written to: ${outPath}${C.reset}`);
  } else {
    // Text output
    console.log(`${C.bold}${C.cyan}MathCanvas${C.reset} — ${C.dim}${fileName}${C.reset}\n`);
    const { text } = parseText(source);
    console.log(text);
  }
}

main().catch(err => {
  console.error(`${C.red}${err.message}${C.reset}`);
  process.exit(1);
});
