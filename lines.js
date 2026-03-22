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
let linesBgColor = '#1A1A1A';  // <-- Added supplementary background color

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
