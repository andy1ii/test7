// --- FLOW MODE VARIABLES ---
let flowMaskPixels = [];
let particles = [];
let flowLogoScale = 1;
let flowZOff = 0;
let flowColors;

function setupFlow() {
  // Deep blue, bright blue, cyan, and vibrant orange to pop on the white background
  flowColors = [color('#0033aa'), color('#0077ff'), color('#00ddff'), color('#ff6600')];
  processFlowMask();
  initParticles();
}

function windowResizedFlow() {
  processFlowMask();
  initParticles();
  needsClear = true; // Use global needsClear to wipe canvas on resize
}

function processFlowMask() {
  let baseScale = min(width / logoImg.width, height / logoImg.height) * 0.55;
  let minScale = 280 / max(logoImg.width, 1);
  flowLogoScale = max(baseScale, minScale);

  let hrW = floor(logoImg.width * flowLogoScale);
  let hrH = floor(logoImg.height * flowLogoScale);
  let hrX = floor((width - hrW) / 2);
  let hrY = floor((height - hrH) / 2);

  let pg = createGraphics(width, height);
  pg.pixelDensity(1); 
  pg.background(0);
  pg.image(logoImg, hrX, hrY, hrW, hrH);
  pg.loadPixels();

  let totalPixels = width * height;
  flowMaskPixels = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    flowMaskPixels[i] = pg.pixels[i * 4] > 128 ? 1 : 0;
  }
  pg.remove();
}

function initParticles() {
  particles = [];
  let numParticles = 6000; 
  for (let i = 0; i < numParticles; i++) {
    particles.push(spawnParticle(true)); // Pass true to randomize starting life
  }
}

function spawnParticle(randomizeLife = false) {
  let x, y, tries = 0;
  // Try to find a random spot INSIDE the logo mask
  do {
    x = random(width);
    y = random(height);
    tries++;
  } while (flowMaskPixels[floor(x) + floor(y) * width] === 0 && tries < 100);

  let isThick = random(1) > 0.9;
  
  // MASSIVELY INCREASED LIFESPAN for longer flow paths
  let maxL = random(300, 800); 
  let mSpeed = isThick ? random(1.0, 2.0) : random(2.0, 4.0);

  // PRE-CALCULATE INITIAL VELOCITY: 
  // Particles now spawn already moving at full speed instead of easing in from a standstill.
  let scl = 0.0015 / flowLogoScale; 
  let angle = noise(x * scl, y * scl, flowZOff) * TWO_PI * 2.5;
  let startVel = p5.Vector.fromAngle(angle).mult(mSpeed);

  return {
    pos: createVector(x, y),
    prev: createVector(x, y),
    vel: startVel, // Start at full speed immediately
    c: random(flowColors),
    w: isThick ? random(1.5, 3.0) : random(0.2, 1.0), 
    maxSpeed: mSpeed,
    life: randomizeLife ? random(0, maxL) : maxL, 
    maxLife: maxL
  };
}

function drawFlow() {
  // 1. Instant mode-switch fix: Wipe the canvas to pure white when initializing
  if (needsClear) {
    background('#FFFFFF');
    initParticles(); // Respawn all particles so they don't carry over weird velocities
    needsClear = false;
  }

  // Draw a semi-transparent white background to create smooth motion blur trails
  push();
  noStroke();
  fill(255, 255, 255, 12); // Low opacity white leaves elegant trails behind the ink
  rectMode(CORNER);
  rect(0, 0, width, height);
  pop();

  flowZOff += 0.002; // Slower evolution for calmer, longer paths
  let scl = 0.0015 / flowLogoScale; 

  for (let p of particles) {
    // Smoothed out the angle multiplier for wider, longer arcs
    let angle = noise(p.pos.x * scl, p.pos.y * scl, flowZOff) * TWO_PI * 2.5;
    
    let dir = p5.Vector.fromAngle(angle);
    p.vel.lerp(dir, 0.08); 
    p.vel.limit(p.maxSpeed);

    p.prev.x = p.pos.x;
    p.prev.y = p.pos.y;

    p.pos.add(p.vel);
    p.life--;

    // Check bounds against the mask and the screen
    let safeX = constrain(floor(p.pos.x), 0, width - 1);
    let safeY = constrain(floor(p.pos.y), 0, height - 1);
    let isOutsideMask = flowMaskPixels[safeX + safeY * width] === 0;

    // If particle dies or leaves the mask, respawn it with full life
    if (p.life <= 0 || isOutsideMask) {
      Object.assign(p, spawnParticle(false));
    } else {
      let alphaMod = 255; // Start fully opaque (no spawn fade-in to prevent laggy look)
      
      // Only fade out smoothly when the particle is about to die
      if (p.life < 30) {
          alphaMod = map(p.life, 0, 30, 0, 255, true);
      }
      
      let currentC = color(p.c);
      currentC.setAlpha(alphaMod);
      stroke(currentC);
      strokeWeight(p.w);
      line(p.prev.x, p.prev.y, p.pos.x, p.pos.y);
    }
  }
}