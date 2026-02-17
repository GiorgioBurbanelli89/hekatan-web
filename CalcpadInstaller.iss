; Inno Setup Script para Calcpad Debugger
; Genera un instalador setup.exe con todo incluido

#define MyAppName "Calcpad Debugger"
#define MyAppVersion "7.5.8-symbolic"
#define MyAppPublisher "Calcpad Development Team"
#define MyAppURL "https://github.com/GiorgioBurbanelli89/calcpad_fork"
#define MyAppExeName "CalcpadDebugger.exe"

[Setup]
; Información de la aplicación
AppId={{B8F9D2E1-4A3C-4F5B-9E2D-1C8A7B6D4E3F}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\Calcpad
DefaultGroupName=Calcpad
AllowNoIcons=yes
LicenseFile=LICENSE.txt
OutputDir=.\Installer
OutputBaseFilename=CalcpadDebugger-Setup-{#MyAppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=admin
SetupIconFile=CalcpadDebugger\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "quicklaunchicon"; Description: "{cm:CreateQuickLaunchIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked; OnlyBelowVersion: 6.1; Check: not IsAdminInstallMode
Name: "fileassoc"; Description: "Asociar archivos .cpd con {#MyAppName}"; GroupDescription: "Asociaciones de archivos:"

[Files]
; Ejecutable principal de CalcpadDebugger
Source: "CalcpadDebugger\bin\Release\net10.0-windows\CalcpadDebugger.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "CalcpadDebugger\bin\Release\net10.0-windows\CalcpadDebugger.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "CalcpadDebugger\bin\Release\net10.0-windows\CalcpadDebugger.runtimeconfig.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "CalcpadDebugger\bin\Release\net10.0-windows\CalcpadDebugger.deps.json"; DestDir: "{app}"; Flags: ignoreversion

; Dependencias de Calcpad
Source: "CalcpadDebugger\bin\Release\net10.0-windows\Hekatan.Core.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "CalcpadDebugger\bin\Release\net10.0-windows\Hekatan.Common.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "CalcpadDebugger\bin\Release\net10.0-windows\Hekatan.OpenXml.dll"; DestDir: "{app}"; Flags: ignoreversion

; Otras dependencias (NuGet packages)
Source: "CalcpadDebugger\bin\Release\net10.0-windows\*.dll"; DestDir: "{app}"; Flags: ignoreversion

; Archivos de ejemplo
Source: "ejemplo-multiples-lenguajes.cpd"; DestDir: "{app}\Examples"; Flags: ignoreversion
Source: "*.cpd"; DestDir: "{app}\Examples"; Flags: ignoreversion

; Documentación
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion isreadme
Source: "AI_TEACHER_README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "LICENSE.txt"; DestDir: "{app}"; Flags: ignoreversion

; Configuración para AI Teacher
Source: ".env.example"; DestDir: "{app}"; Flags: ignoreversion

; Código fuente para depuración (opcional)
Source: "Hekatan.Core\*.cs"; DestDir: "{app}\Source\Hekatan.Core"; Flags: ignoreversion recursesubdirs
Source: "Hekatan.Common\*.cs"; DestDir: "{app}\Source\Hekatan.Common"; Flags: ignoreversion recursesubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:ProgramOnTheWeb,{#MyAppName}}"; Filename: "{#MyAppURL}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{userappdata}\Microsoft\Internet Explorer\Quick Launch\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: quicklaunchicon

[Registry]
; Asociación de archivos .cpd
Root: HKA; Subkey: "Software\Classes\.cpd"; ValueType: string; ValueName: ""; ValueData: "CalcpadFile"; Flags: uninsdeletevalue; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\CalcpadFile"; ValueType: string; ValueName: ""; ValueData: "Calcpad File"; Flags: uninsdeletekey; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\CalcpadFile\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#MyAppExeName},0"; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\CalcpadFile\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""; Tasks: fileassoc

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

  // Si dotnet existe, asumir que .NET 10 está instalado (ya que el proyecto compila)
  if not FileExists(DotnetPath) then
  begin
    if MsgBox('Este programa requiere .NET 10 Runtime.' + #13#10 +
              '¿Desea abrir la página de descarga de .NET 10?',
              mbConfirmation, MB_YESNO) = IDYES then
    begin
      ShellExec('open', 'https://dotnet.microsoft.com/download/dotnet/10.0', '', '', SW_SHOW, ewNoWait, ErrorCode);
    end;
    Result := False;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  EnvFile: String;
begin
  if CurStep = ssPostInstall then
  begin
    // Crear archivo .env si no existe
    EnvFile := ExpandConstant('{app}\.env');
    if not FileExists(EnvFile) then
    begin
      FileCopy(ExpandConstant('{app}\.env.example'), EnvFile, False);
    end;
  end;
end;

[UninstallDelete]
Type: files; Name: "{app}\.env"
