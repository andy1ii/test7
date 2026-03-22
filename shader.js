// --- SHADER MODE VARIABLES ---
let vertexShader = `
precision highp float;
attribute vec3 aPosition;
attribute vec2 aTexCoord;
attribute vec4 aVertexColor;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;

varying vec2 vTexCoord;

void main() {
  vec4 viewModelPosition = uModelViewMatrix * vec4(aPosition, 1.0);
  gl_Position = uProjectionMatrix * viewModelPosition;  
  vTexCoord = aTexCoord;
}
`;

let fragmentShader = `
#ifdef GL_ES
precision mediump float;
#endif

#define PI 3.14159265358979323846

uniform vec2 resolution;
uniform float time;
uniform vec2 mouse; 
uniform sampler2D tex0; 

varying vec2 vTexCoord;

vec2 rotate2D (vec2 _st, float _angle) {
    _st -= 0.5;
    _st =  mat2(cos(_angle),-sin(_angle),
                sin(_angle),cos(_angle)) * _st;
    _st += 0.5;
    return _st;
}

vec2 tile (vec2 _st, float _zoom) {
    _st *= _zoom;
    return fract(_st);
}

float concentricCircles(in vec2 st, in vec2 radius, in float res, in float scale) {
    float dist = distance(st,radius);
    float pct = floor(dist*res)/scale;
    return pct;
}

void main (void) {
    vec2 st = vTexCoord;
    vec2 texSt = st; 
    
    vec2 mst = gl_FragCoord.xy / mouse.xy;
    float mdist = distance(vec2(1.0, 1.0), mst);
    float dist = distance(st, vec2(sin(time/10.0), cos(time/10.0)));
    
    vec2 patternSt = tile(st, 10.0);
    patternSt = rotate2D(patternSt, dist / (mdist/5.0) * PI * 2.0);
    
    // Generate the original 3-part flat circle pattern
    float c1 = concentricCircles(patternSt, vec2(0.0,0.0), 5.0, 5.0);
    float c2 = concentricCircles(patternSt, vec2(0.0,0.0), 10.0, 10.0);
    float c3 = concentricCircles(patternSt, vec2(0.0,0.0), 20.0, 10.0);
    
    vec3 rawPattern = vec3(c1, c2, c3);

    // --- METALLIC COLOR PALETTE ---
    vec3 gunmetal = vec3(0.15, 0.16, 0.18);  // Dark, cool gray
    vec3 silver = vec3(0.85, 0.88, 0.90);    // Bright, crisp gray
    vec3 titanium = vec3(0.75, 0.70, 0.65);  // Warm, slightly bronze gray
    
    // Map the concentric circle values to the metallic palette
    vec3 patternColor = gunmetal; 
    patternColor = mix(patternColor, silver, c2); 
    patternColor = mix(patternColor, titanium, c1 * 0.9); 

    // Distort the texture coordinates slightly for the glass refraction effect
    vec2 displacement = (rawPattern.xy - 0.5) * 0.06 * sin(time * 1.5);
    vec4 texColor = texture2D(tex0, texSt + displacement);

    // Discard transparent pixels immediately (acts as a perfect, native mask)
    if(texColor.a < 0.05) {
        discard;
    }

    // Mix the original logo color with the new metallic pattern
    vec3 finalColor = mix(texColor.rgb, patternColor, 0.85);
    
    gl_FragColor = vec4(finalColor, texColor.a);
}
`;

let theShader;
let shaderCanvas;

function setupShader() {
  shaderCanvas = createGraphics(windowWidth, windowHeight, WEBGL);
  shaderCanvas.noStroke();
  theShader = shaderCanvas.createShader(vertexShader, fragmentShader);
}

function windowResizedShader() {
  shaderCanvas.resizeCanvas(windowWidth, windowHeight);
}

function drawShader() {
  let timeSec = millis() / 1000.0;
  
  // Automate the "mouse" coordinates to keep the tiles shifting
  let autoX = (width / 2) + sin(timeSec * 0.8) * (width * 0.3);
  let autoY = (height / 2) + cos(timeSec * 0.5) * (height * 0.3);

  background(255); 
  shaderCanvas.clear(); 

  shaderCanvas.shader(theShader);
  
  theShader.setUniform('resolution', [width, height]);
  theShader.setUniform('time', timeSec);
  theShader.setUniform('mouse', [autoX, map(autoY, 0, height, height, 0)]);
  theShader.setUniform('tex0', logoImg); 

  let baseScale = min(width / logoImg.width, height / logoImg.height) * 0.55;
  let minScale = 280 / max(logoImg.width, 1);
  let scaleFactor = max(baseScale, minScale);

  let hrW = logoImg.width * scaleFactor;
  let hrH = logoImg.height * scaleFactor;

  // Draw the flat plane sized to the logo
  shaderCanvas.push();
  shaderCanvas.plane(hrW, hrH);
  shaderCanvas.pop();

  imageMode(CORNER);
  image(shaderCanvas, 0, 0);
}