#!/bin/bash
APP="$HOME/Documents/GitHub/HD_2D/Binaries/Mac/HD_2D.app"

if [ ! -d "$APP" ]; then
 echo "App not found, skipping."
 exit 0
fi

find "$APP" -exec xattr -d com.apple.provenance {} \; 2>/dev/null || true
find "$APP" -exec xattr -d com.apple.FinderInfo {} \; 2>/dev/null || true
find "$APP" -exec xattr -d com.apple.fileprovider.fpfs#P {} \; 2>/dev/null || true
xattr -cr "$APP"

codesign --force --sign - "$APP"
echo "App signed successfully."
