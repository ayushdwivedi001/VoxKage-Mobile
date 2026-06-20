import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

// Fluid background HTML (Canvas-based perlin noise shader)
const fluidBackgroundHTML = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #000000; overflow: hidden; width: 100%; height: 100%; -webkit-overflow-scrolling: touch; }
  canvas { display: block; width: 100%; height: 100%; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

// Lock canvas dimensions to maximum screen dimensions to prevent keyboard resizing jumps
let w = canvas.width = window.screen.width || window.innerWidth || 360;
let h = canvas.height = window.screen.height || window.innerHeight || 640;
let maxW = w;
let maxH = h;

function updateSize() {
  const currentW = window.innerWidth || document.documentElement.clientWidth || 360;
  const currentH = window.innerHeight || document.documentElement.clientHeight || 640;
  // If the viewport expands (e.g. rotation), update our max bounds. 
  // We ignore shrinking (which is the keyboard pushing up) to keep the background static.
  if (currentW > maxW) maxW = currentW;
  if (currentH > maxH) maxH = currentH;
  
  if (canvas.width !== maxW || canvas.height !== maxH) {
    canvas.width = maxW;
    canvas.height = maxH;
    w = maxW;
    h = maxH;
  }
}
updateSize();

let t = 0;

// Create an offscreen noise pattern to achieve an organic organic paper/film grain texture
const noiseCanvas = document.createElement('canvas');
const nCtx = noiseCanvas.getContext('2d');
noiseCanvas.width = 128;
noiseCanvas.height = 128;
const nData = nCtx.createImageData(128, 128);
const d = nData.data;
for (let i = 0; i < d.length; i += 4) {
  const val = Math.floor(Math.random() * 255);
  d[i] = val;     // R
  d[i+1] = val;   // G
  d[i+2] = val;   // B
  d[i+3] = 9;     // Alpha (grain opacity ~3.5%)
}
nCtx.putImageData(nData, 0, 0);
const noisePattern = ctx.createPattern(noiseCanvas, 'repeat');

function draw() {
  updateSize();
  
  // Solid pure black base
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);

  t += 0.0006; // extremely slow, premium gradient movement

  // Draw 2 massive glowing dark blue/indigo gradients anchored at the bottom
  // Blob 1: Dark Indigo/Blue (bottom left-middle)
  const b1x = w * 0.3 + Math.sin(t * 0.5) * w * 0.18;
  const b1y = h * 1.05 + Math.cos(t * 0.3) * 20;
  const b1r = h * 0.72 + Math.sin(t * 0.2) * 50;
  const grad1 = ctx.createRadialGradient(b1x, b1y, 0, b1x, b1y, b1r);
  grad1.addColorStop(0, 'rgba(29, 78, 216, 0.58)'); // rich vibrant royal blue
  grad1.addColorStop(0.45, 'rgba(30, 58, 138, 0.22)');
  grad1.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad1;
  ctx.fillRect(0, 0, w, h);

  // Blob 2: Deep Navy/Cobalt (bottom right-middle)
  const b2x = w * 0.72 + Math.cos(t * 0.4) * w * 0.22;
  const b2y = h * 1.02 + Math.sin(t * 0.6) * 20;
  const b2r = h * 0.80 + Math.cos(t * 0.3) * 60;
  const grad2 = ctx.createRadialGradient(b2x, b2y, 0, b2x, b2y, b2r);
  grad2.addColorStop(0, 'rgba(37, 99, 235, 0.48)'); // cobalt blue glow
  grad2.addColorStop(0.5, 'rgba(15, 23, 72, 0.16)');
  grad2.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad2;
  ctx.fillRect(0, 0, w, h);

  // Draw noise grain overlay
  ctx.fillStyle = noisePattern;
  ctx.fillRect(0, 0, w, h);

  requestAnimationFrame(draw);
}
draw();
window.onresize = updateSize;
</script>
</body>
</html>
`;

export const FluidBackground: React.FC = () => {
  if (Platform.OS === 'web') {
    return (
      // @ts-ignore
      <iframe
        srcDoc={fluidBackgroundHTML}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          border: 'none',
          width: '100%',
          height: '100%',
          zIndex: 0,
          pointerEvents: 'none',
        }}
        title="Fluid Background Shader"
      />
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 0 }]}>
      <WebView
        source={{ html: fluidBackgroundHTML }}
        originWhitelist={['*']}
        style={{ flex: 1, backgroundColor: '#000000' }}
        scrollEnabled={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        androidLayerType="hardware"
        allowsInlineMediaPlayback={true}
        startInLoadingState={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        setBuiltInZoomControls={false}
        setDisplayZoomControls={false}
        bounces={false}
      />
    </View>
  );
};
