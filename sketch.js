let currentMode = 'cube'; 
let logoImg;
let needsClear = true; // Handles clean canvas wiping between modes

function preload() {
  logoImg = loadImage('resources/CursorLogoRevised.png');
}

function setup() {
  let canvas = createCanvas(windowWidth, windowHeight);
  canvas.position(0, 0);
  canvas.style('z-index', '-1'); 
  
  // High-resolution (Retina) rendering
  pixelDensity(2); 
  
  // Initialize all generative modes
  setupCube();
  setupMesh();
  setupFlow(); 
  setupLines(); 
  setupShader();
  setupBio();
}

function draw() {
  if (currentMode === 'cube') {
    needsClear = false; 
    drawCube();
  } else if (currentMode === 'mesh') {
    needsClear = false; 
    drawMesh();
  } else if (currentMode === 'flow') {
    drawFlow();
  } else if (currentMode === 'lines') { 
    drawLines();
  } else if (currentMode === 'shader') {
    needsClear = true; // Shader mode handles its own background wiping
    drawShader();
  } else if (currentMode === 'bio') {
    needsClear = false; // Bio mode handles its own background wiping
    drawBio();
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  
  // Resize all generative modes
  windowResizedCube();
  windowResizedMesh();
  windowResizedFlow(); 
  windowResizedLines(); 
  windowResizedShader();
  windowResizedBio();
}

function setMode(newMode) {
  if (currentMode !== newMode) {
    currentMode = newMode;
    needsClear = true; // Trigger canvas wipe when changing modes
    
    // Update active button states in the DOM
    document.getElementById('btn-cube').classList.remove('active');
    document.getElementById('btn-mesh').classList.remove('active');
    document.getElementById('btn-flow').classList.remove('active');
    document.getElementById('btn-lines').classList.remove('active');
    document.getElementById('btn-shader').classList.remove('active');
    document.getElementById('btn-bio').classList.remove('active');

    document.getElementById('btn-' + newMode).classList.add('active');
  }
}