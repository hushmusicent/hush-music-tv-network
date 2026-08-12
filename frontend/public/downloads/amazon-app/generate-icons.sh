#!/bin/bash
# Generate Amazon App icons from a source image
# Usage: ./generate-icons.sh source-logo.png

SOURCE=$1

if [ -z "$SOURCE" ]; then
    echo "Usage: ./generate-icons.sh source-logo.png"
    echo ""
    echo "Required output sizes:"
    echo "  - icon-114.png (114x114) - Small icon"
    echo "  - icon-512.png (512x512) - Large icon"  
    echo "  - banner-firetv.png (1920x1080) - Fire TV banner"
    echo "  - banner-tablet.png (1280x720) - Tablet banner"
    echo "  - splash.png (1920x1080) - Splash screen"
    exit 1
fi

# Check if ImageMagick is installed
if ! command -v convert &> /dev/null; then
    echo "ImageMagick not installed. Install with: apt-get install imagemagick"
    echo ""
    echo "Or create these images manually:"
    echo "  - 114x114 PNG (small icon)"
    echo "  - 512x512 PNG (large icon)"
    echo "  - 1920x1080 PNG (Fire TV banner with logo)"
    echo "  - 1280x720 PNG (Tablet banner)"
    exit 1
fi

echo "Generating icons from $SOURCE..."

# Generate icons
convert "$SOURCE" -resize 114x114 -gravity center -background '#000000' -extent 114x114 assets/icon-114.png
convert "$SOURCE" -resize 512x512 -gravity center -background '#000000' -extent 512x512 assets/icon-512.png

# Generate banners (logo centered on dark background)
convert -size 1920x1080 xc:'#0a0a0a' "$SOURCE" -resize 400x400 -gravity center -composite assets/banner-firetv.png
convert -size 1280x720 xc:'#0a0a0a' "$SOURCE" -resize 300x300 -gravity center -composite assets/banner-tablet.png
convert -size 1920x1080 xc:'#0a0a0a' "$SOURCE" -resize 500x500 -gravity center -composite assets/splash.png

echo "Done! Generated:"
ls -la assets/
