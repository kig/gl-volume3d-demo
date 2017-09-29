const shaderLib = require('./shaderLib');

module.exports.frag = `#version 300 es

precision highp float;
precision highp sampler3D;

in vec3 vPosition;

uniform sampler3D uTexture;
uniform float uTime;
uniform vec2 uResolution;

uniform mat4 uModelView;
uniform mat4 uProjection;

uniform vec3 uClipBoxMin;
uniform vec3 uClipBoxMax;

uniform bool uIsocaps;

uniform float uIsoLevel;
uniform float uIsoRange;
uniform float uRaySteps;

out vec4 color;

${shaderLib.raytrace}

vec3 gradient(vec3 uvw, vec4 c)
{
  vec3 e = vec3(0.0, 0.0, 1.0 / 256.0);
  vec4 dx = texture(uTexture, uvw + e.zxx, -16.0) - c;
  vec4 dy = texture(uTexture, uvw + e.xzx, -16.0) - c;
  vec4 dz = texture(uTexture, uvw + e.xxz, -16.0) - c;
  return vec3(dx.r, dy.r, dz.r);
}

vec3 grey(vec3 rgb) {
  return vec3((rgb.r + rgb.g + rgb.b) / 3.0);
}

vec4 getColor(vec3 uvw, vec4 c) {
  vec3 grad = gradient(uvw, c);
  float alpha = 0.005; //mix(0.05*c.r, 0.01*c.r, pow(clamp(c.r+0., 0.0, 1.0), 4.0));
  if (abs(c.r - uIsoLevel) <= uIsoRange) {
    alpha = 0.15;
  }
  alpha *= c.a;
  c.r = abs(c.r - uIsoLevel) * 2.0;
  vec3 col = 1.0-max(vec3(0.0), vec3(c.r*2., abs(0.7-c.r), 0.8-c.r)+0.5);
  col = col.bgr;
  col.r *= 0.75;
  col.b *= 0.5;
  return vec4(pow(grey(abs(grad))+abs(grad), vec3(0.5))+col, alpha);  
}

vec4 getCapColor(vec3 uvw, vec4 c) {
  vec3 grad = gradient(uvw, c);
  float alpha = 0.005; //mix(0.05*c.r, 0.01*c.r, pow(clamp(c.r+0., 0.0, 1.0), 4.0));
  if (abs(c.r - uIsoLevel) <= uIsoRange) {
    alpha = 0.15;
  }
  alpha *= c.a;
  vec3 col = 1.0-max(vec3(0.0), vec3(c.r*2., abs(0.7-c.r), 0.8-c.r)+0.5);
  col = col.bgr;
  col.r *= 0.75;
  col.b *= 0.5;
  return vec4(pow(grey(abs(grad))+abs(grad), vec3(0.5))+col, alpha);  
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution * 2.0 - 1.0;

  mat4 clipToEye = inverse(uProjection);
  mat4 eyeToWorld = inverse(uModelView);

  vec4 clipNear = vec4(uv, -1.0, 1.0);
  vec4 clipFar = vec4(uv, 1.0, 1.0);

  vec4 eyeNear = clipToEye * clipNear;
  vec4 eyeFar = clipToEye * clipFar;

  vec4 worldNear = eyeToWorld * eyeNear;
  vec4 worldFar = eyeToWorld * eyeFar;

  vec3 ro = worldNear.xyz / worldNear.w;
  vec3 rd = normalize((worldFar.xyz / worldFar.w) - ro);

  color = vec4(0.0);
  float t1, t2;
  vec3 nml;
  Box clipBox = Box(uClipBoxMin, uClipBoxMax);
  if (boxIntersect(ro, rd, clipBox, t1, t2, nml)) {
    vec3 uvw = (ro + rd * t1);
    if ( uIsocaps && all(lessThanEqual(uvw, vec3(1.0))) && all(greaterThanEqual(uvw, vec3(0.0))) ) {
      vec4 c = texture(uTexture, uvw, -16.0);
      if (abs(c.r - uIsoLevel) <= uIsoRange) {
        vec4 col = getCapColor(uvw, c);
        color = 1.0 - col;
        color.a = sqrt(c.r) * c.a;
      }
    }
    vec3 p1 = ro + rd * t1;
    vec4 accum = vec4(0.0);
    bool noHit = true;
    float steps = ceil((t2-t1) * uRaySteps);
    for (float i=0.0; i<=steps; i++) {
      float t = 1.0 - i/steps;
      vec3 uvw = (p1 + rd * (t2-t1) * t);
      //uvw += vec3(sin(uTime + uvw.y*6.0) * 0.2, 0.0, 0.0);
      vec3 ou = uvw;
      if (all(lessThanEqual(uvw, clipBox.maxPoint)) && all(greaterThanEqual(uvw, clipBox.minPoint)) ) {
        vec4 c = texture(uTexture, uvw, -16.0);
        //if (abs(c.r - uIsoLevel) <= uIsoRange) {
          vec4 col = getColor(uvw, c);
          accum = mix(accum, col, col.a);
          noHit = false;
        //}
      }
    }
//    if (noHit) {
//      discard;
//      return;
//    }
    color = mix(1.0 - accum, color, color.a);
    color.a = 1.0;
  }
}
`;

module.exports.vert = `#version 300 es

#define POSITION_LOCATION 0

precision highp float;
precision highp int;

layout(location = POSITION_LOCATION) in vec3 aPosition;

out vec3 vPosition;

void main() {
  gl_Position = vec4(aPosition, 1.0);
  vPosition = gl_Position.xyz;
}`;

