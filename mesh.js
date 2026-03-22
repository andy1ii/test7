// --- MESH MODE VARIABLES ---
let meshMaskPixels;
let meshCols, meshRows;
let cellData = []; 
let logoScale = 1; 

// --- DENSITY & DETAIL CONTROLS ---
let baseGridSize = 9;            // Optimized for readability with the new scale
let gridSize;                     
let logoInternalDensity = 55;     
let logoEdgeDensity = 70;         
let backgroundDensity = 2;        

let zOff = 0;
const ANIMATE_FIELD = true;
const FIELD_DRIFT = -0.006;
const GLYPH_STATIC_Z = 137.42;

function setupMesh() {
  textAlign(CENTER, CENTER);
  textFont('CursorMono');
  rectMode(CENTER);
  
  processMeshMask();
  updateMeshGrid();
  buildCellData(); 
}

function windowResizedMesh() {
  processMeshMask();
  updateMeshGrid();
  buildCellData(); 
}

function processMeshMask() {
  let baseScale = min(width / logoImg.width, height / logoImg.height) * 0.55;
  let minScale = 280 / max(logoImg.width, 1);
  
  logoScale = max(baseScale, minScale);

  gridSize = max(4, floor(baseGridSize * logoScale));

  let hrW = floor(logoImg.width * logoScale);
  let hrH = floor(logoImg.height * logoScale);
  let hrX = floor((width - hrW) / 2);
  let hrY = floor((height - hrH) / 2);

  let maskW = width;
  let maskH = height;
  let pg = createGraphics(maskW, maskH);
  pg.pixelDensity(1);
  pg.background(0);
  pg.image(logoImg, hrX, hrY, hrW, hrH);
  pg.loadPixels();

  let totalPixels = maskW * maskH;
  meshMaskPixels = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    meshMaskPixels[i] = pg.pixels[i * 4] > 128 ? 1 : 0;
  }
  pg.remove();
}

function updateMeshGrid() {
  textSize(gridSize * 1.1);
  meshCols = floor(width / gridSize) + 1;
  meshRows = floor(height / gridSize) + 1;
}

function buildCellData() {
  cellData = []; 
  let r = gridSize; 
  let offsets = [
    [-r, 0], [r, 0], [0, -r], [0, r],
    [-r, -r], [r, r], [-r, r], [r, -r]
  ];
  
  for (let y = 0; y < meshRows; y++) {
    for (let x = 0; x < meshCols; x++) {
      let px = x * gridSize;
      let py = y * gridSize;
      
      let safeX = constrain(px, 0, width - 1);
      let safeY = constrain(py, 0, height - 1);
      
      let inLogo = meshMaskPixels[safeX + safeY * width] === 1;
      
      let edgeScore = 0;
      for (let i = 0; i < 8; i++) {
        let cx = constrain(px + offsets[i][0], 0, width - 1);
        let cy = constrain(py + offsets[i][1], 0, height - 1);
        edgeScore += meshMaskPixels[cx + cy * width];
      }
      let nearEdge = (edgeScore > 0 && edgeScore < 8);
      
      let seed = (x * 37 + y * 83) % 100;
      let renderGate = nearEdge ? logoEdgeDensity : (inLogo ? logoInternalDensity : backgroundDensity);
      
      cellData.push({
        px: px, 
        py: py,
        inLogo: inLogo,
        nearEdge: nearEdge,
        seed: seed,
        shouldRender: seed < renderGate 
      });
    }
  }
}

function drawMesh() {
  background('#080808'); 
  
  if (ANIMATE_FIELD) zOff += FIELD_DRIFT;
  
  let scl = 0.0008 / logoScale; 
  let bands = 9;    
  
  for (let i = 0; i < cellData.length; i++) {
    let cell = cellData[i];
    
    if (!cell.shouldRender) continue; 
    
    let px = cell.px;
    let py = cell.py;
    let nearEdge = cell.nearEdge;
    let inLogo = cell.inLogo;
    let seed = cell.seed;

    let n = noise(px * scl, py * scl, zOff);
    let val = n * bands;
    let f = val % 1.0; 
    
    let isOuter = (f > 0.05 && f < 0.20) || (f > 0.80 && f < 0.95);
    let isInner = (f > 0.22 && f < 0.28) || (f > 0.72 && f < 0.78);
    let isCore = (f >= 0.30 && f <= 0.70);
    let isFiller = (inLogo && seed < 15);
    let isOutsideBg = (!inLogo && isCore && seed < 5);
    
    if (!isOuter && !isInner && !isCore && !isFiller && !isOutsideBg) continue; 
    
    let eps = 8.0 * logoScale;
    let dx = noise((px + eps) * scl, py * scl, zOff) - noise((px - eps) * scl, py * scl, zOff);
    let dy = noise(px * scl, (py + eps) * scl, zOff) - noise(px * scl, (py - eps) * scl, zOff);
    let angle = atan2(dy, dx) + HALF_PI;
    
    push();
    translate(px + gridSize / 2, py + gridSize / 2);
    rotate(angle);
    
    let faintAlpha = nearEdge ? 255 : (inLogo ? 220 : 10); 
    let thickNoise = noise(px * (0.02 / logoScale), py * (0.02 / logoScale), zOff * 1.5);
    
    if (isOuter) {
      stroke(255, faintAlpha);
      strokeWeight(map(thickNoise, 0, 1, 0.5 * logoScale, nearEdge ? 3.0 * logoScale : 1.2 * logoScale)); 
      line(-gridSize / 2, 0, gridSize / 2, 0); 
    }
    else if (isInner) {
      stroke(255, faintAlpha * 0.9);
      strokeWeight(map(thickNoise, 0, 1, 0.2 * logoScale, nearEdge ? 2.0 * logoScale : 0.8 * logoScale));
      line(-gridSize / 2, 0, gridSize / 2, 0); 
    }
    else if (isCore) {
      if (inLogo || nearEdge) {
        let packet = noise(px * (0.01 / logoScale), py * (0.01 / logoScale), GLYPH_STATIC_Z); 
        if (packet > 0.25) { 
          let baseShapeScale = map(packet, 0.25, 0.8, 0.7, 2.5); 
          let randScale = map(seed % 10, 0, 9, 0.8, 1.2);
          let dynScale = constrain(baseShapeScale * randScale, 0.6, 2.8);
          
          push();
          rotate(-angle); 
          
          if (seed < 25) {
            scale(min(dynScale, 0.9)); 
            fill(255, nearEdge ? 255 : 220);
            noStroke();
            text((seed % 2 === 0) ? '1' : '0', 0, 0);
          } else if (seed < 50) {
            scale(dynScale); 
            fill(255, nearEdge ? 255 : 200);
            noStroke();
            circle(-gridSize * 0.2, 0, gridSize * 0.2);
            circle(gridSize * 0.3, 0, gridSize * 0.1);
          } else if (seed < 75) {
            scale(dynScale); 
            noFill();
            stroke(255, nearEdge ? 255 : 180);
            strokeWeight(1.0);
            rect(0, 0, gridSize * 0.4, gridSize * 0.4);
          } else if (seed < 88) {
            scale(dynScale); 
            fill(255, nearEdge ? 245 : 190);
            noStroke();
            let dashWidth = gridSize * map(packet, 0.25, 1.0, 0.6, 1.0);
            let dashHeight = gridSize * 0.12;
            let yOffset = (seed % 2 === 0 ? -1 : 1) * gridSize * 0.22;
            rect(0, yOffset, dashWidth, dashHeight); 
          }
          pop();
        } else {
          fill(255, nearEdge ? 180 : 80);
          noStroke();
          circle(0, 0, map(packet, 0, 0.25, 0.5, 1.8 * logoScale)); 
        }
      } else if (isOutsideBg) {
        fill(255, 4); 
        noStroke();
        push();
        rotate(-angle); 
        scale(map(seed % 5, 0, 4, 0.8, 1.2));
        rect(0, gridSize * 0.18, gridSize * 0.6, gridSize * 0.08); 
        pop();
      }
    } 
    if (isFiller) {
       fill(255, nearEdge ? 150 : 50);
       noStroke();
       push();
       rotate(-angle);
       circle(0, 0, map(seed % 3, 0, 2, 1.0 * logoScale, 2.5 * logoScale));
       pop();
    }
    pop();
  }
}