const sharp = require('sharp');
const fs = require('fs');

async function processLogos() {
  try {
    console.log('Trimming white logo...');
    // Trim transparent background
    await sharp('public/logo.png')
      .trim()
      .toFile('public/logo-trimmed.png');
      
    console.log('Trimming black logo...');
    await sharp('public/logo-black.png')
      .trim()
      .toFile('public/logo-black-trimmed.png');

    // Make an icon for Next.js App Router (favicon replacement)
    // Favicons should ideally be square, so let's get metadata and resize/pad to square
    const metadata = await sharp('public/logo-trimmed.png').metadata();
    const size = Math.max(metadata.width, metadata.height);
    
    await sharp('public/logo.png') // Use the white one as requested
      .trim()
      .resize({
        width: size,
        height: size,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent padding
      })
      // Next.js will pick up icon.png in app directory
      .toFile('src/app/icon.png');
      
    // Delete the old default favicon to let Next.js use icon.png
    if (fs.existsSync('src/app/favicon.ico')) {
      fs.unlinkSync('src/app/favicon.ico');
    }

    console.log('Logos cropped successfully!');
  } catch (error) {
    console.error('Error:', error);
  }
}

processLogos();
