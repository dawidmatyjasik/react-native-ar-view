#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRAMEWORKS_DIR="$SCRIPT_DIR/Frameworks"
GLTFKIT2_VERSION="0.5.15"
GLTFKIT2_URL="https://github.com/warrenm/GLTFKit2/releases/download/${GLTFKIT2_VERSION}/GLTFKit2.xcframework.zip"

if [ -d "$FRAMEWORKS_DIR/GLTFKit2.xcframework" ]; then
    echo "GLTFKit2.xcframework already exists, skipping download"
    exit 0
fi

echo "Downloading GLTFKit2 v${GLTFKIT2_VERSION}..."
mkdir -p "$FRAMEWORKS_DIR"
curl -L -o "$FRAMEWORKS_DIR/GLTFKit2.xcframework.zip" "$GLTFKIT2_URL"
unzip -o "$FRAMEWORKS_DIR/GLTFKit2.xcframework.zip" -d "$FRAMEWORKS_DIR"
rm "$FRAMEWORKS_DIR/GLTFKit2.xcframework.zip"
echo "GLTFKit2.xcframework downloaded successfully"
