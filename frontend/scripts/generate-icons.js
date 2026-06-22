const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const sourceSvgPath = 'C:\\Users\\AYUSH\\Desktop\\VoxKage\\website\\src\\app\\icon.svg';
const targetDir = path.join(__dirname, '..', 'assets', 'images');

async function main() {
  try {
    console.log('Starting icon generation...');
    
    if (!fs.existsSync(sourceSvgPath)) {
      throw new Error(`Source SVG not found at: ${sourceSvgPath}`);
    }

    const svgContent = fs.readFileSync(sourceSvgPath, 'utf8');

    // 1. Generate icon.png (Universal fallback: 1024x1024)
    console.log('Generating general icon.png...');
    await sharp(Buffer.from(svgContent))
      .resize(1024, 1024)
      .png()
      .toFile(path.join(targetDir, 'icon.png'));
    console.log('✔ icon.png created.');

    // 2. Generate android-icon-foreground.png (Transparent adaptive foreground: 1024x1024 with 66% safe area)
    console.log('Generating android-icon-foreground.png...');
    
    // Strip background rects to keep it transparent
    const transparentSvg = svgContent
      .replace(/<rect[^>]*fill="#09090b"[^>]*\/>/g, '')
      .replace(/<rect[^>]*stroke="white"[^>]*\/>/g, '');

    console.log('Cleaned SVG for foreground:', transparentSvg);

    // Resize SVG to 676x676 (66% of 1024) and pad with 174px transparency on each side
    await sharp(Buffer.from(transparentSvg))
      .resize(676, 676)
      .extend({
        top: 174,
        bottom: 174,
        left: 174,
        right: 174,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(path.join(targetDir, 'android-icon-foreground.png'));
    
    console.log('✔ android-icon-foreground.png created.');
    
    // 3. Generate android-icon-monochrome.png (Optional, using transparent foreground but black/white)
    console.log('Generating android-icon-monochrome.png...');
    await sharp(Buffer.from(transparentSvg))
      .resize(676, 676)
      .extend({
        top: 174,
        bottom: 174,
        left: 174,
        right: 174,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .grayscale()
      .png()
      .toFile(path.join(targetDir, 'android-icon-monochrome.png'));
      
    console.log('✔ android-icon-monochrome.png created.');
    console.log('Icon generation completed successfully, sir!');
  } catch (error) {
    console.error('Failed to generate icons, sir:', error);
    process.exit(1);
  }
}

main();
