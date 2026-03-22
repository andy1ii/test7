// --- LINES MODE VARIABLES ---
let linesMaskPixels = [];
let linesValidPixels = []; 
let linesEdgePixels = []; 
let linesLogoScale = 1;
let linesNodes = [];
let linesZOff = 0;

// --- AESTHETIC CONTROLS (Bold Outlines) ---
let linesNumNodes = 1000;      // Increased to give the outlines plenty of dots to connect
let linesConnectDist = 65;     
let linesMaxConnections = 6;   // INCREASED: Allows the edge nodes to form a continuous chain
let linesDriftSpeed = 1.0;     
let linesEdgeBias = 0.85;      // 85% of nodes form the outline

// --- INTERACTIVITY CONTROLS ---
let linesMouseRadius = 70;     
let linesMouseForce = 6;       

// --- COLOR CONTROL ---
let linesSolidColor = '#FF6600'; 

function setupLines() {
  processLinesMask();
  initLinesNodes();
}

function windowResizedLines() {
  processLinesMask();
  initLinesNodes();
}

function processLinesMask() {
  let baseScale = min(width / logoImg.width, height / logoImg.height) * 0.55;
  let minScale = 280 / max(logoImg.width, 1);
  linesLogoScale = max(baseScale, minScale);

  let hrW = floor(logoImg.width * linesLogoScale);
  let hrH = floor(logoImg.height * linesLogoScale);
  let hrX = floor((width - hrW) / 2);
  let hrY = floor((height - hrH) / 2);

  let pg = createGraphics(width, height);
  pg.pixelDensity(1); 
  pg.background(0);
  pg.image(logoImg, hrX, hrY, hrW, hrH);
  pg.loadPixels();

  let totalPixels = width * height;
  linesMaskPixels = new Uint8Array(totalPixels);
  linesValidPixels = []; 
  linesEdgePixels = [];
  
  for (let i = 0; i < totalPixels; i++) {
    linesMaskPixels[i] = pg.pixels[i * 4] > 128 ? 1 : 0;
  }

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let idx = x + y * width;
      if (linesMaskPixels[idx] === 1) {
        linesValidPixels.push({ x: x, y: y });
        
        if (linesMaskPixels[idx - 1] === 0 || 
            linesMaskPixels[idx + 1] === 0 || 
            linesMaskPixels[idx - width] === 0 || 
            linesMaskPixels[idx + width] === 0) {
          linesEdgePixels.push({ x: x, y: y });
        }
      }
    }
  }
  pg.remove();
}

function initLinesNodes() {
  linesNodes = [];
  if (linesValidPixels.length === 0) return;
  
  for (let i = 0; i < linesNumNodes; i++) {
    linesNodes.push(spawnNode(random(10, 50))); 
  }
}

function spawnNode(startLife = 0) {
  let pt;
  let isEdgeNode = false;

  // Track if this specific node was spawned on the border
  if (random() < linesEdgeBias && linesEdgePixels.length > 0) {
    pt = random(linesEdgePixels);
    isEdgeNode = true;
  } else {
    pt = random(linesValidPixels);
  }

  return {
    x: pt.x,
    y: pt.y,
    life: startLife,
    maxLife: random(25, 90), 
    connCount: 0,
    isEdge: isEdgeNode // Save the edge memory to the node
  };
}

function drawLines() {
  background('#FFFFFF'); 
  linesZOff += 0.008; 

  for (let i = 0; i < linesNodes.length; i++) {
    let n = linesNodes[i];
    n.life++;
    n.connCount = 0; 

    let angle = noise(n.x * 0.008, n.y * 0.008, linesZOff) * TWO_PI * 2.5;
    n.x += cos(angle) * linesDriftSpeed;
    n.y += sin(angle) * linesDriftSpeed;

    // Mouse Repulsion
    let dMouse = dist(n.x, n.y, mouseX, mouseY);
    if (dMouse < linesMouseRadius) {
      let pushFactor = map(dMouse, 0, linesMouseRadius, linesMouseForce, 0);
      let angleFromMouse = atan2(n.y - mouseY, n.x - mouseX);
      n.x += cos(angleFromMouse) * pushFactor;
      n.y += sin(angleFromMouse) * pushFactor;
    }

    let fade = 1;
    let fadeTime = 8; 
    if (n.life < fadeTime) {
      fade = n.life / fadeTime;
    } else if (n.life > n.maxLife - fadeTime) {
      fade = (n.maxLife - n.life) / fadeTime;
    }
    n.fadeMult = constrain(fade, 0, 1);

    let safeX = constrain(floor(n.x), 0, width - 1);
    let safeY = constrain(floor(n.y), 0, height - 1);
    let inMask = linesMaskPixels[safeX + safeY * width] === 1;

    if (!inMask || n.life >= n.maxLife) {
      linesNodes[i] = spawnNode(0); 
    }
  }

  strokeCap(ROUND);
  let connectDistSq = linesConnectDist * linesConnectDist;

  let baseColor = color(linesSolidColor);
  let solidR = red(baseColor);
  let solidG = green(baseColor);
  let solidB = blue(baseColor);

  for (let i = 0; i < linesNodes.length; i++) {
    let nodeA = linesNodes[i];

    if (nodeA.connCount >= linesMaxConnections) continue;

    noStroke();
    // Slightly larger circles for edge nodes to define the boundary
    let circleSize = nodeA.isEdge ? 2.0 : 1.2;
    fill(solidR, solidG, solidB, 255 * nodeA.fadeMult);
    ellipse(nodeA.x, nodeA.y, circleSize, circleSize); 

    for (let j = i + 1; j < linesNodes.length; j++) {
      let nodeB = linesNodes[j];

      if (nodeB.connCount >= linesMaxConnections) continue;

      let dx = abs(nodeA.x - nodeB.x);
      if (dx > linesConnectDist) continue;
      
      let dy = abs(nodeA.y - nodeB.y);
      if (dy > linesConnectDist) continue;

      let midX = floor((nodeA.x + nodeB.x) / 2);
      let midY = floor((nodeA.y + nodeB.y) / 2);
      let midIdx = midX + midY * width;
      if (linesMaskPixels[midIdx] === 0) continue; 

      let dSq = dx * dx + dy * dy;

      if (dSq < connectDistSq) {
        let finalAlpha = 255 * nodeA.fadeMult * nodeB.fadeMult;
        
        // EDGE AWARENESS: Check if BOTH nodes are on the border
        let bothEdges = nodeA.isEdge && nodeB.isEdge;
        
        // If they are forming the outline, draw the line much bolder
        let lineWeight = bothEdges ? 1.8 : 0.5;
        
        // Keep outline lines fully opaque to make them pop, make inner lines slightly softer
        if (!bothEdges) finalAlpha *= 0.7; 

        strokeWeight(lineWeight);
        stroke(solidR, solidG, solidB, finalAlpha);
        
        line(nodeA.x, nodeA.y, nodeB.x, nodeB.y);

        nodeA.connCount++;
        nodeB.connCount++;
        
        if (nodeA.connCount >= linesMaxConnections) break;
      }
    }
  }
}