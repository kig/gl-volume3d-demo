const shaderLib = require('./shaderLib');

module.exports.frag = `#version 300 es

precision highp float;
precision highp sampler3D;

in vec3 vPosition;
in vec3 vNormal;

uniform sampler3D uTexture;
uniform float uTime;
uniform vec2 uResolution;

uniform mat4 uModelView;
uniform mat4 uProjection;

uniform bool uIsocaps;

uniform float uIsoLevel;
uniform float uIsoRange;

uniform vec3 uLightPosition;
uniform vec4 uLightColor;

uniform vec3 uClipBoxMin;
uniform vec3 uClipBoxMax;

out vec4 color;

${shaderLib.raytrace}

void main() {
  Box clipBox = Box(uClipBoxMin, uClipBoxMax);
  vec3 p = vPosition;
  if (!uIsocaps && (any(lessThan(p, clipBox.minPoint)) || any(greaterThan(p, clipBox.maxPoint)))) {
    discard;
  }
  float diffuse = dot(normalize(vNormal), -normalize(transpose(mat3(inverse(uModelView))) * uLightPosition));
  diffuse = abs(diffuse);
  color = vec4(diffuse * uLightColor * uLightColor.a);
  vec3 eps = vec3(0.001);
  if (uIsocaps && any(lessThan(abs(p-clipBox.minPoint), eps)) || any(lessThan(abs(p-clipBox.maxPoint), eps))) {
    color = texture(uTexture, vPosition.xyz).rrra;
    if (color.r < uIsoLevel-uIsoRange || color.r > uIsoLevel+uIsoRange) {
      discard;
    }
  }
  color.a = 1.0;
}`;

module.exports.vert = `#version 300 es

#define POSITION_LOCATION 0
#define NORMAL_LOCATION 1

precision highp float;
precision highp int;

layout(location = POSITION_LOCATION) in vec3 aPosition;
layout(location = NORMAL_LOCATION) in vec3 aNormal;

uniform mat4 uModelView;
uniform mat4 uProjection;
uniform float uTime;
uniform vec3 uClipBoxMin;
uniform vec3 uClipBoxMax;
uniform vec3 uDimensions;
uniform bool uIsocaps;

out vec3 vPosition;
out vec3 vNormal;

${shaderLib.raytrace}

void main() {
  Box clipBox = Box(uClipBoxMin, uClipBoxMax);

  vec3 p = aPosition / uDimensions;
  vec3 cp = uIsocaps ? clamp(p, clipBox.minPoint, clipBox.maxPoint) : p;
  gl_Position = uProjection * uModelView * vec4(cp, 1.0);
  vPosition = cp;
  vNormal = normalize(transpose(mat3(inverse(uModelView))) * aNormal);
}`;
