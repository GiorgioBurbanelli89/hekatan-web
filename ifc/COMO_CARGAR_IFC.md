# Calcpad IFC CLI v3.0 - Guia de Carga

## Requisitos

1. **Python 3** instalado
2. Los archivos IFC en la carpeta `ifc/`
3. Un navegador moderno (Chrome, Edge)

---

## 1. Iniciar el servidor local

Abrir una terminal en la raiz del proyecto (`Calcpad-7.5.7/`) y ejecutar:

```bash
python -m http.server 8888 --bind 127.0.0.1
```

El servidor queda escuchando en `http://127.0.0.1:8888`.

---

## 2. Abrir el visor

En el navegador ir a:

```
http://127.0.0.1:8888/ifc/ifc-cli.html
```

---

## 3. Formas de cargar un archivo IFC

### 3a. Auto-carga (configurada en el HTML)

El archivo `ifc-cli.html` tiene un bloque de auto-carga al final del `<body>`:

```html
<script>
window.__ifcAutoLoad = {
    baseUrl: "http://127.0.0.1:8888/ifc/vivienda%20Silvia%20sin%20escalera.ifc",
    merges: [
        { filter: "escalera", url: "http://127.0.0.1:8888/ifc/Silvia_Cedeno_escalera.ifc" }
    ]
};
</script>
```

- `baseUrl`: modelo principal que se carga al abrir la pagina
- `merges`: lista de archivos IFC adicionales que se fusionan automaticamente

Para cambiar el archivo, editar la URL en `baseUrl`. Los espacios en nombres se codifican como `%20`.

### 3b. Boton "Abrir IFC"

Clic en el boton **Abrir IFC** de la barra de herramientas. Se abre un dialogo para seleccionar un archivo `.ifc` del disco.

### 3c. Drag & Drop

Arrastrar un archivo `.ifc` desde el explorador de archivos y soltarlo sobre el viewport 3D (area oscura izquierda).

### 3d. Comando CLI: `load` / `abrir`

En la consola CLI (panel derecho inferior), escribir:

```
load
```

o su alias en espanol:

```
abrir
```

Esto abre el mismo dialogo de seleccion de archivo.

### 3e. Comando CLI: `loadurl`

Para cargar desde una URL (util con MCP o automatizacion):

```
loadurl http://127.0.0.1:8888/ifc/vivienda_Silvia_con_escalera_v3.ifc
```

### 3f. Desde JavaScript (MCP Chrome)

```javascript
window.ifc.loadFromUrl("http://127.0.0.1:8888/ifc/vivienda_Silvia_con_escalera_v3.ifc")
```

---

## 4. Fusionar (Merge) otro IFC

Para agregar elementos de un segundo archivo (ej. escalera) al modelo ya cargado:

### Boton "Fusionar IFC"

Clic en **Fusionar IFC** en la barra de herramientas.

### Comando CLI

```
merge escalera http://127.0.0.1:8888/ifc/Silvia_Cedeno_escalera.ifc
```

Tipos de merge disponibles: `escalera`/`stair`, `todo`/`all`.

---

## 5. Archivos IFC disponibles

| Archivo | Descripcion |
|---------|-------------|
| `vivienda Silvia sin escalera.ifc` | Modelo base sin escalera |
| `vivienda_Silvia_con_escalera.ifc` | Modelo completo v1 |
| `vivienda_Silvia_con_escalera_v2.ifc` | Modelo completo v2 |
| `vivienda_Silvia_con_escalera_v3.ifc` | Modelo completo v3 (mas reciente) |
| `Silvia_Cedeno_escalera.ifc` | Solo la escalera (para merge) |
| `Silvia_Cedeno_escalera_metros.ifc` | Escalera en metros |
| `Vivienda_Silvia_Cedeno_3D.ifc` | Modelo 3D exportado |
| `Vivienda_Silvia Cedeno - BIMx_A1.ifc` | Exportacion BIMx |
| `vivienda Silvia.ifc` | Modelo original |

---

## 6. Comandos CLI principales

| Comando | Alias | Descripcion |
|---------|-------|-------------|
| `help` | `ayuda`, `?` | Lista de comandos |
| `load` | `abrir` | Abrir archivo IFC |
| `loadurl <url>` | - | Cargar desde URL |
| `merge <tipo> <url>` | `fusionar` | Fusionar otro IFC |
| `save` | `guardar` | Guardar modelo |
| `meta` | `info` | Metadatos del archivo |
| `summary` | `resumen` | Resumen estructural |
| `levels` | `niveles` | Niveles y elevaciones |
| `columns` | `columnas` | Detalle de columnas |
| `beams` | `vigas` | Detalle de vigas |
| `slabs` | `losas` | Detalle de losas |
| `rebar` | `refuerzo` | Barras de refuerzo |
| `grids` | `ejes` | Ejes y grillas |
| `profiles` | `perfiles` | Perfiles rectangulares |
| `stats` | `estadisticas` | Todas las entidades |
| `fit` | `encuadrar` | Encuadrar modelo |
| `view top` | `vista top` | Vista planta |
| `view front` | - | Vista frontal |
| `view 3d` | - | Vista 3D |
| `wireframe` | `wire` | Toggle wireframe |
| `showall` | `mostrartodo` | Mostrar todo |
| `report` | `reporte` | Generar reporte HTML |
| `extract json` | `extraer json` | Exportar geometria JSON |
| `extract csv` | - | Tabla de elementos CSV |
| `savehtml` | `guardarhtml` | Guardar HTML con estado |
| `delete <tipo>` | `eliminar` | Eliminar por tipo |

---

## 7. Controles del viewport

- **Rotar**: clic izquierdo + arrastrar
- **Pan**: clic derecho + arrastrar (o clic medio)
- **Zoom**: rueda del raton
- **Seleccionar**: clic sobre un elemento
- Barra inferior: checkboxes para Ejes, Grid, Wire, Seleccionar
