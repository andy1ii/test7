let bioGridA, bioGridB, bioNextA, bioNextB;
let bioSimWidth, bioSimHeight;

// Simulation runs at a lower scale for massive performance gains,
// while the GPU shader handles the perfect, high-res crisp edges!
let bioSimScale = 3; 

// Stable regime parameters for the interior
let bioDA = 1.0;
let bioDB = 0.5;
let bioFeed = 0.029;
let bioKill = 0.057;
let bioSpeed = 3; 

let bioMaskPixels = [];
let bioEdgeMask = []; 
let bioValidSpots = []; 

// ULTRA-FAST TYPED ARRAYS FOR CACHE LOCALITY
let valid_i, valid_x, valid_y, valid_edge;

let bioRenderImg;
let bioMaskLayer; // High-res native mask for the GPU

let bioWebglLayer;
let bioRenderShader;

// ------------------------------------------------------------------
// INLINE SHADER CODE
// ------------------------------------------------------------------
const bioVertSource = `
  attribute vec3 aPosition;
  attribute vec2 aTexCoord;
  uniform mat4 uProjectionMatrix;
  uniform mat4 uModelViewMatrix;
  varying vec2 vTexCoord;
  void main() {
    vTexCoord = aTexCoord;
    gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
  }
`;

const bioFragSource = `
  precision highp float;
  varying vec2 vTexCoord;
  uniform sampler2D u_tex;
  uniform sampler2D u_maskTex; // High-quality, anti-aliased mask uniform
  uniform vec2 u_resolution;
  uniform float u_time;

  float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); }
  float noise(vec2 st) {
      vec2 i = floor(st); vec2 f = fract(st);
      float a = random(i); float b = random(i + vec2(1.0, 0.0));
      float c = random(i + vec2(0.0, 1.0)); float d = random(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  void main() {
      // Pure, undistorted texture coordinates
      vec2 uv = vec2(vTexCoord.x, 1.0 - vTexCoord.y);
      vec2 texel = 1.0 / (u_resolution * 0.5);

      // 1. Sample the high-res GPU mask. 1.0 = inside logo, 0.0 = outside.
      float maskVal = texture2D(u_maskTex, uv).r;
      
      // Completely discard rendering if outside the sharp logo boundary
      if (maskVal < 0.01) {
          gl_FragColor = vec4(1.0, 1.0, 1.0, 0.0); 
          return;
      }

      float h = texture2D(u_tex, uv).r;
      
      // Softer threshold for a smoother, more liquid look inside the fungi
      float cellularAlpha = smoothstep(0.0, 0.15, h);

      float hx = texture2D(u_tex, uv + vec2(texel.x * 2.0, 0.0)).r;
      float hy = texture2D(u_tex, uv + vec2(0.0, texel.y * 2.0)).r;

      float bumpScale = 2.0;
      vec3 normal = normalize(vec3((h - hx) * bumpScale, (h - hy) * bumpScale, 0.15));

      float microNoise = noise(uv * 400.0 + u_time * 0.2);
      normal = normalize(normal + vec3(microNoise * 0.08, microNoise * 0.08, 0.0));

      vec3 lightDir = normalize(vec3(-0.8, -0.8, 1.2));
      vec3 viewDir = vec3(0.0, 0.0, 1.0);

      float diffuse = max(0.0, (dot(normal, lightDir) + 0.5) / 1.5);
      vec3 halfVector = normalize(lightDir + viewDir);
      float specular = pow(max(dot(normal, halfVector), 0.0), 80.0) * 1.5;
      float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);

      vec3 valleyColor = vec3(0.12, 0.31, 0.86);
      vec3 peakColor = vec3(0.85, 0.95, 1.0);    
      
      vec3 albedo = mix(valleyColor, peakColor, smoothstep(0.1, 0.8, h));
      float scatterIntensity = smoothstep(0.2, 0.5, h) - smoothstep(0.5, 0.8, h);
      albedo = mix(albedo, vec3(0.4, 0.6, 0.9), scatterIntensity * 0.5);

      vec3 finalColor = albedo * diffuse;
      finalColor += vec3(1.0) * specular; 
      finalColor += peakColor * fresnel * 0.6; 

      finalColor = finalColor / (finalColor + vec3(0.8));
      finalColor = pow(finalColor, vec3(1.0 / 2.2));

      vec3 patternColorWithInternalValleys = mix(vec3(1.0, 1.0, 1.0), finalColor, cellularAlpha);
      
      // 2. Output pattern, using the native mask boundary for a perfectly sharp, anti-aliased edge
      gl_FragColor = vec4(patternColorWithInternalValleys, maskVal); 
  }
`;
// ------------------------------------------------------------------

function setupBio() {
  bioWebglLayer = createGraphics(windowWidth, windowHeight, WEBGL);
  bioWebglLayer.setAttributes('antialias', true);
  bioWebglLayer.noStroke(); 
  
  // Creates a crisp 2D graphics layer matching the native screen resolution
  bioMaskLayer = createGraphics(windowWidth, windowHeight);
  bioMaskLayer.pixelDensity(pixelDensity());
  
  bioRenderShader = bioWebglLayer.createShader(bioVertSource, bioFragSource);

  initBioSimulation(true);
}

function windowResizedBio() {
  bioWebglLayer.resizeCanvas(windowWidth, windowHeight);
  bioMaskLayer.resizeCanvas(windowWidth, windowHeight);
  initBioSimulation(true);
}

function initBioSimulation(rebuildArrays = false) {
  let baseScale = min(width / logoImg.width, height / logoImg.height) * 0.55;
  let minScale = 280 / max(logoImg.width, 1); 
  let scaleFactor = max(baseScale, minScale);

  let hrW = floor(logoImg.width * scaleFactor);
  let hrH = floor(logoImg.height * scaleFactor);
  let hrX = floor((width - hrW) / 2);
  let hrY = floor((height - hrH) / 2);

  // Draw the high-res native mask for the GPU shader
  bioMaskLayer.clear();
  bioMaskLayer.background(0); // Black background = 0.0 alpha in shader
  bioMaskLayer.image(logoImg, hrX, hrY, hrW, hrH); // White logo = 1.0 alpha in shader

  if (rebuildArrays) {
    bioSimWidth = floor(width / bioSimScale);
    bioSimHeight = floor(height / bioSimScale);
    let totalCells = bioSimWidth * bioSimHeight;

    bioGridA = new Float32Array(totalCells);
    bioGridB = new Float32Array(totalCells);
    bioNextA = new Float32Array(totalCells);
    bioNextB = new Float32Array(totalCells);
    
    bioMaskPixels = new Uint8Array(totalCells);
    bioEdgeMask = new Uint8Array(totalCells);

    bioRenderImg = createImage(bioSimWidth, bioSimHeight);
    
    // Set fixed alpha channel once to avoid updating it every frame
    bioRenderImg.loadPixels();
    for (let i = 0; i < totalCells; i++) {
        bioRenderImg.pixels[i * 4 + 3] = 255;
    }
    bioRenderImg.updatePixels();

    // Fast, low-res mask purely for simulation logic bounds
    let pg = createGraphics(bioSimWidth, bioSimHeight);
    pg.pixelDensity(1); 
    pg.background(0);
    pg.image(logoImg, hrX / bioSimScale, hrY / bioSimScale, hrW / bioSimScale, hrH / bioSimScale);
    pg.loadPixels();

    for (let i = 0; i < totalCells; i++) {
      bioMaskPixels[i] = pg.pixels[i * 4] > 128 ? 1 : 0;
    }
    pg.remove();
  }

  // Reset arrays
  bioValidSpots = [];
  let sw = bioSimWidth;
  let totalCells = bioSimWidth * bioSimHeight;
  
  for (let i = 0; i < totalCells; i++) {
    bioGridA[i] = 1.0;
    bioGridB[i] = 0.0;
    bioNextA[i] = 1.0;
    bioNextB[i] = 0.0;
    bioEdgeMask[i] = 0;
  }

  // Detect logo edges for fungi dissolution
  for (let y = 1; y < bioSimHeight - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      let i = x + y * sw;
      if (bioMaskPixels[i] === 1) {
        bioValidSpots.push(i);
        
        if (
          bioMaskPixels[i - 1] === 0 || bioMaskPixels[i + 1] === 0 ||
          bioMaskPixels[i - sw] === 0 || bioMaskPixels[i + sw] === 0 ||
          bioMaskPixels[i - 1 - sw] === 0 || bioMaskPixels[i + 1 - sw] === 0 ||
          bioMaskPixels[i - 1 + sw] === 0 || bioMaskPixels[i + 1 + sw] === 0
        ) {
          bioEdgeMask[i] = 1; 
        }
      }
    }
  }

  // --- MASSIVE MEMORY OPTIMIZATION ---
  // Pack all valid spot logic into raw typed arrays for instant memory access
  let validCount = bioValidSpots.length;
  valid_i = new Int32Array(validCount);
  valid_x = new Int32Array(validCount);
  valid_y = new Int32Array(validCount);
  valid_edge = new Uint8Array(validCount);

  for (let k = 0; k < validCount; k++) {
      let i = bioValidSpots[k];
      valid_i[k] = i;
      valid_x[k] = i % sw;
      valid_y[k] = ~~(i / sw); // Math.floor replacement
      valid_edge[k] = bioEdgeMask[i];
  }

  // Initial seed
  for(let i = 0; i < 25; i++) {
    if (validCount > 0) {
      let spot = bioValidSpots[floor(random(validCount))];
      if (bioEdgeMask[spot] === 0) {
        let sx = spot % sw;
        let sy = ~~(spot / sw);
        seedBioArea(sx, sy, 5);
      }
    }
  }
}

function drawBio() {
  background(255); 

  // Drop new spores to keep the organism alive
  if (bioValidSpots.length > 0) {
    for (let k = 0; k < 4; k++) {
      let spot = bioValidSpots[floor(random(bioValidSpots.length))];
      if (bioGridB[spot] < 0.05 && bioEdgeMask[spot] === 0) {
        let sx = spot % bioSimWidth;
        let sy = ~~(spot / bioSimWidth);
        seedBioArea(sx, sy, 2);
      }
    }
  }

  for (let iter = 0; iter < bioSpeed; iter++) {
    updateBioSimulation();
    swapBioGrids();
  }

  bioRenderImg.loadPixels();
  let pixels = bioRenderImg.pixels;
  let len = valid_i.length;

  // Only update RGB values of the valid logo pixels
  for (let k = 0; k < len; k++) {
    let i = valid_i[k];
    let c = bioGridB[i] * 255; 
    let pxIdx = i * 4;
    pixels[pxIdx]     = c;
    pixels[pxIdx + 1] = c;
    pixels[pxIdx + 2] = c;
  }
  bioRenderImg.updatePixels();

  bioWebglLayer.clear();
  
  bioWebglLayer.ortho(-width / 2, width / 2, height / 2, -height / 2, 0, 1000);
  
  bioWebglLayer.shader(bioRenderShader);
  bioRenderShader.setUniform('u_tex', bioRenderImg);
  bioRenderShader.setUniform('u_maskTex', bioMaskLayer); // Pass the high-res native mask!
  bioRenderShader.setUniform('u_resolution', [width, height]);
  bioRenderShader.setUniform('u_time', millis() / 1000.0);
  
  bioWebglLayer.rect(-width / 2, -height / 2, width, height);

  image(bioWebglLayer, 0, 0, width, height);
}

function updateBioSimulation() {
  let sw = bioSimWidth;
  let sh = bioSimHeight;
  let t = millis() * 0.0004; 
  
  // Precalculate advection fields (Wind)
  let waveX_Feed = new Float32Array(sw);
  let waveX_Sin = new Float32Array(sw);
  let waveX_Cos = new Float32Array(sw);
  for(let x = 0; x < sw; x++) {
      waveX_Feed[x] = sin(x * 0.06 + t) * 0.0035; 
      waveX_Sin[x] = sin(x * 0.03 + t);
      waveX_Cos[x] = cos(x * 0.03 - t);
  }

  let waveY_Feed = new Float32Array(sh);
  let waveY_Sin = new Float32Array(sh);
  let waveY_Cos = new Float32Array(sh);
  for(let y = 0; y < sh; y++) {
      waveY_Feed[y] = cos(y * 0.06 - t);
      waveY_Cos[y] = cos(y * 0.03 + t) * 0.25;
      waveY_Sin[y] = sin(y * 0.03 - t) * 0.25;
  }
  
  let len = valid_i.length;
  
  // Only calculate reaction/diffusion for valid logo spots
  for (let k = 0; k < len; k++) {
    // Zero math array lookups using pre-packed data
    let i = valid_i[k];
    let x = valid_x[k];
    let y = valid_y[k];

    let a = bioGridA[i];
    let b = bioGridB[i];

    let wy_feed = waveY_Feed[y];
    let wy_cos = waveY_Cos[y];
    let wy_sin = waveY_Sin[y];

    let wx = waveX_Sin[x] * wy_cos;
    let wy = waveX_Cos[x] * wy_sin;

    let wLeft = 1.0 + wx;
    let wRight = 1.0 - wx;
    let wUp = 1.0 + wy;
    let wDown = 1.0 - wy;

    let aSum = bioGridA[i - 1]*wLeft + bioGridA[i + 1]*wRight + bioGridA[i - sw]*wUp + bioGridA[i + sw]*wDown;
    let aDiag = bioGridA[i - 1 - sw] + bioGridA[i + 1 - sw] + bioGridA[i - 1 + sw] + bioGridA[i + 1 + sw];
    let laplaceA = aSum * 0.2 + aDiag * 0.05 - a;

    let bSum = bioGridB[i - 1]*wLeft + bioGridB[i + 1]*wRight + bioGridB[i - sw]*wUp + bioGridB[i + sw]*wDown;
    let bDiag = bioGridB[i - 1 - sw] + bioGridB[i + 1 - sw] + bioGridB[i - 1 + sw] + bioGridB[i + 1 + sw];
    let laplaceB = bSum * 0.2 + bDiag * 0.05 - b;

    let reaction = a * b * b;
    let isEdge = valid_edge[k] === 1;

    let currentFeed = isEdge ? 0.010 : bioFeed + (waveX_Feed[x] * wy_feed);
    let currentKill = isEdge ? 0.080 : bioKill;

    let newA = a + (bioDA * laplaceA - reaction + currentFeed * (1 - a));
    let newB = b + (bioDB * laplaceB + reaction - (currentKill + currentFeed) * b);

    bioNextA[i] = newA < 0.0 ? 0.0 : (newA > 1.0 ? 1.0 : newA);
    bioNextB[i] = newB < 0.0 ? 0.0 : (newB > 1.0 ? 1.0 : newB);
  }
}

function swapBioGrids() {
  let tempA = bioGridA;
  bioGridA = bioNextA;
  bioNextA = tempA;
  let tempB = bioGridB;
  bioGridB = bioNextB;
  bioNextB = tempB;
}

function seedBioArea(x, y, radius) {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      let nx = x + dx;
      let ny = y + dy;
      if (nx > 0 && nx < bioSimWidth - 1 && ny > 0 && ny < bioSimHeight - 1) {
        let idx = nx + ny * bioSimWidth;
        if (bioMaskPixels[idx] === 1) { 
          bioGridB[idx] = 1.0;
        }
      }
    }
  }
}
