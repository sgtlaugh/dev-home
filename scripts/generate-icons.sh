#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SOURCE="$PROJECT_ROOT/public/favicon.png"
BUILD_DIR="$PROJECT_ROOT/build"
ICON_PNG="$BUILD_DIR/icon.png"

if [ ! -f "$SOURCE" ]; then
  echo "Error: public/favicon.png not found"
  exit 1
fi

mkdir -p "$BUILD_DIR"
cp "$SOURCE" "$ICON_PNG"

# Generate .icns for macOS (requires macOS tools, skip on Linux)
if command -v iconutil &> /dev/null; then
  ICONSET="$BUILD_DIR/icon.iconset"
  rm -rf "$ICONSET"
  mkdir -p "$ICONSET"
  for size in 16 32 64 128 256 512 1024; do
    sips -z $size $size "$SOURCE" --out "$ICONSET/icon_${size}x${size}.png" > /dev/null
  done
  iconutil -c icns "$ICONSET" -o "$BUILD_DIR/icon.icns"
  rm -rf "$ICONSET"
  echo "Generated: $BUILD_DIR/icon.icns"
fi

echo "Generated: $ICON_PNG"
