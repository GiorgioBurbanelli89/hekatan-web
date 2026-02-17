; Inno Setup Script para Hekatan Calc
; Genera un instalador setup.exe con todo incluido

#define MyAppName "Hekatan Calc"
#define MyAppVersion "1.1.0"
#define MyAppPublisher "Hekatan Project"
#define MyAppURL "https://github.com/GiorgioBurbanelli89/hekatan"
#define MyAppExeName "HekatanCalc.exe"

[Setup]
; Información de la aplicación
AppId={{B8D9F4G3-6C5E-5D7F-9G2B-3E0C8F5D7B6G}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\HekatanCalc
DefaultGroupName=Hekatan Calc
AllowNoIcons=yes
LicenseFile=LICENSE
OutputDir=.\Installer
OutputBaseFilename=HekatanCalc-Setup-{#MyAppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=admin
;SetupIconFile={#SourcePath}\Hekatan.Wpf\resources\calcpad.ico
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "quicklaunchicon"; Description: "{cm:CreateQuickLaunchIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked; OnlyBelowVersion: 6.1; Check: not IsAdminInstallMode
Name: "fileassoc"; Description: "Asociar archivos .hcalc y .cpd con Hekatan Calc"; GroupDescription: "Asociaciones de archivos:"

[Files]
; Ejecutable principal y todas las dependencias del build
; Incluye automáticamente (via Hekatan.Common ProjectReference):
;   - MultLangCode\MultLangConfig.json (parser @{} config)
;   - Plugins\ParserDefinition.json, PluginConfig.json
;   - MultLangCode\Templates\* (code templates)
;   - Hekatan.Common.dll, Markdig.Signed.dll, AngouriMath.dll
;   - tools\* (IFC converter, Node.js scripts)
; EXCLUYENDO runtimes de Linux/OSX para reducir tamaño (~100MB vs 229MB)
Source: "Hekatan.Wpf\bin\Release\net10.0-windows\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs; Excludes: "runtimes\linux*,runtimes\osx*,runtimes\linux-*,*.dylib,tools\node_modules\three\examples\*,tools\node_modules\web-ifc\web-ifc-api-node.js,*.ifc"

; ===== EJEMPLOS EN DOCUMENTOS DEL USUARIO =====
; Se instalan en: Documentos\Hekatan Calc\Examples

; Ejemplos organizados por categoría
Source: "Examples\cpd\awatif\*"; DestDir: "{userdocs}\Hekatan Calc\Examples\Awatif - Análisis Estructural"; Flags: ignoreversion skipifsourcedoesntexist
Source: "Examples\cpd\fem-mesh\*"; DestDir: "{userdocs}\Hekatan Calc\Examples\FEM - Elementos Finitos"; Flags: ignoreversion skipifsourcedoesntexist
Source: "Examples\cpd\html-css-ts\*"; DestDir: "{userdocs}\Hekatan Calc\Examples\HTML CSS TypeScript"; Flags: ignoreversion skipifsourcedoesntexist
Source: "Examples\cpd\ifc-viewer\*"; DestDir: "{userdocs}\Hekatan Calc\Examples\IFC - Visor 3D"; Flags: ignoreversion skipifsourcedoesntexist
Source: "Examples\cpd\parsers-multilang\*"; DestDir: "{userdocs}\Hekatan Calc\Examples\Parsers - Multi-Lenguaje"; Flags: ignoreversion skipifsourcedoesntexist
Source: "Examples\cpd\svg\*"; DestDir: "{userdocs}\Hekatan Calc\Examples\SVG - Gráficos Vectoriales"; Flags: ignoreversion skipifsourcedoesntexist
Source: "Examples\cpd\silvana-proyecto\*"; DestDir: "{userdocs}\Hekatan Calc\Examples\Proyecto Ejemplo"; Flags: ignoreversion skipifsourcedoesntexist
Source: "Examples\cpd\otros\*"; DestDir: "{userdocs}\Hekatan Calc\Examples\Otros"; Flags: ignoreversion skipifsourcedoesntexist

; Ejemplos clásicos de Calcpad (Mathematics, Mechanics, Physics)
Source: "Examples\Mathematics\*"; DestDir: "{userdocs}\Hekatan Calc\Examples\Mathematics"; Flags: ignoreversion recursesubdirs skipifsourcedoesntexist; Excludes: "*.py,__pycache__,*.txt"
Source: "Examples\Mechanics\*"; DestDir: "{userdocs}\Hekatan Calc\Examples\Mechanics"; Flags: ignoreversion recursesubdirs skipifsourcedoesntexist; Excludes: "*.py,__pycache__,*.txt"
Source: "Examples\Physics\*"; DestDir: "{userdocs}\Hekatan Calc\Examples\Physics"; Flags: ignoreversion recursesubdirs skipifsourcedoesntexist; Excludes: "*.py,__pycache__"

; Libs necesarios para IFC (en carpeta de instalación, no en Documentos)
Source: "Examples\libs\*"; DestDir: "{app}\libs"; Flags: ignoreversion recursesubdirs skipifsourcedoesntexist

; ===== ARCHIVOS EXCLUIDOS DEL INSTALADOR =====
; NO incluir: *.ifc (archivos 3D gigantes hasta 1.1GB)
; NO incluir: *.EDB, *.$et, *.sdb (modelos ETABS/SAP2000)
; NO incluir: *.py (scripts Python de desarrollo)
; NO incluir: test-debug/ (archivos de prueba)

; Documentación general
; Documentación principal para usuarios
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion isreadme skipifsourcedoesntexist
Source: "CHANGELOG.md"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "LICENSE.txt"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "LICENSE"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Dirs]
; Crear carpeta de ejemplos en Documentos
Name: "{userdocs}\Hekatan Calc"; Flags: uninsalwaysuninstall
Name: "{userdocs}\Hekatan Calc\Examples"; Flags: uninsalwaysuninstall

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Ejemplos"; Filename: "{userdocs}\Hekatan Calc\Examples"
Name: "{group}\{cm:ProgramOnTheWeb,{#MyAppName}}"; Filename: "{#MyAppURL}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{userappdata}\Microsoft\Internet Explorer\Quick Launch\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: quicklaunchicon

[Registry]
; Asociación de archivos .hcalc (nuevo formato Hekatan)
Root: HKA; Subkey: "Software\Classes\.hcalc"; ValueType: string; ValueName: ""; ValueData: "HekatanCalcFile"; Flags: uninsdeletevalue; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\HekatanCalcFile"; ValueType: string; ValueName: ""; ValueData: "Hekatan Calc File"; Flags: uninsdeletekey; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\HekatanCalcFile\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#MyAppExeName},0"; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\HekatanCalcFile\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""; Tasks: fileassoc
; Asociación de archivos .cpd (retrocompatibilidad)
Root: HKA; Subkey: "Software\Classes\.cpd"; ValueType: string; ValueName: ""; ValueData: "HekatanCalcFile"; Flags: uninsdeletevalue; Tasks: fileassoc
; Asociación de archivos .hcalcz (comprimido nuevo)
Root: HKA; Subkey: "Software\Classes\.hcalcz"; ValueType: string; ValueName: ""; ValueData: "HekatanCalcFile"; Flags: uninsdeletevalue; Tasks: fileassoc

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
function InitializeSetup(): Boolean;
var
  ErrorCode: Integer;
  DotnetPath: String;
begin
  Result := True;

  // Verificar si dotnet.exe existe
  DotnetPath := ExpandConstant('{pf}\dotnet\dotnet.exe');
  if not FileExists(DotnetPath) then
  begin
    DotnetPath := ExpandConstant('{pf64}\dotnet\dotnet.exe');
  end;

  // Si dotnet existe, asumir que .NET 10 está instalado
  if not FileExists(DotnetPath) then
  begin
    if MsgBox('Este programa requiere .NET 10 Desktop Runtime.' + #13#10 +
              '¿Desea abrir la página de descarga de .NET 10?',
              mbConfirmation, MB_YESNO) = IDYES then
    begin
      ShellExec('open', 'https://dotnet.microsoft.com/download/dotnet/10.0', '', '', SW_SHOW, ewNoWait, ErrorCode);
    end;
    Result := False;
  end;
end;
