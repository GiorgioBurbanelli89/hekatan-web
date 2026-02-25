#!/bin/bash
# Script para actualizar Calcpad.Core y Calcpad.OpenXml desde el repo upstream
# Uso: bash Calcpad/update-calcpad.sh

UPSTREAM="https://github.com/Proektsoftbg/Calcpad.git"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMP_DIR=$(mktemp -d)

echo "Clonando Calcpad upstream..."
git clone --depth 1 "$UPSTREAM" "$TEMP_DIR"

if [ $? -ne 0 ]; then
    echo "Error: No se pudo clonar el repositorio"
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo "Actualizando Calcpad.Core..."
rm -rf "$SCRIPT_DIR/Calcpad.Core"
cp -r "$TEMP_DIR/Calcpad.Core" "$SCRIPT_DIR/Calcpad.Core"

echo "Actualizando Calcpad.OpenXml..."
rm -rf "$SCRIPT_DIR/Calcpad.OpenXml"
cp -r "$TEMP_DIR/Calcpad.OpenXml" "$SCRIPT_DIR/Calcpad.OpenXml"

# Re-aplicar ajustes al csproj (eliminar OutputPath de Calcpad.Wpf)
echo "Aplicando ajustes a csproj..."
sed -i '/<OutputPath>.*Calcpad\.Wpf.*/d' "$SCRIPT_DIR/Calcpad.Core/Calcpad.Core.csproj"
sed -i '/<OutputPath>.*Calcpad\.Wpf.*/d' "$SCRIPT_DIR/Calcpad.OpenXml/Calcpad.OpenXml.csproj"
# Eliminar PropertyGroup vacios de Release/Debug que quedan
sed -i '/<PropertyGroup Condition.*Release.*/{N;/.*<PlatformTarget>AnyCPU<\/PlatformTarget>/{N;/.*<\/PropertyGroup>/d}}' "$SCRIPT_DIR/Calcpad.Core/Calcpad.Core.csproj"
sed -i '/<PropertyGroup Condition.*Debug.*/{N;/.*<PlatformTarget>AnyCPU<\/PlatformTarget>/{N;/.*<\/PropertyGroup>/d}}' "$SCRIPT_DIR/Calcpad.Core/Calcpad.Core.csproj"
sed -i '/<PropertyGroup Condition.*Release.*/{N;/.*<PlatformTarget>AnyCPU<\/PlatformTarget>/{N;/.*<\/PropertyGroup>/d}}' "$SCRIPT_DIR/Calcpad.OpenXml/Calcpad.OpenXml.csproj"
sed -i '/<PropertyGroup Condition.*Debug.*/{N;/.*<PlatformTarget>AnyCPU<\/PlatformTarget>/{N;/.*<\/PropertyGroup>/d}}' "$SCRIPT_DIR/Calcpad.OpenXml/Calcpad.OpenXml.csproj"
# Eliminar ServerGarbageCollection PropertyGroup de Calcpad.Core
sed -i '/<ServerGarbageCollection>true<\/ServerGarbageCollection>/d' "$SCRIPT_DIR/Calcpad.Core/Calcpad.Core.csproj"
sed -i '/<ConcurrentGarbageCollection>true<\/ConcurrentGarbageCollection>/d' "$SCRIPT_DIR/Calcpad.Core/Calcpad.Core.csproj"

rm -rf "$TEMP_DIR"
echo "Actualizado desde upstream. Compilar con: dotnet build"
