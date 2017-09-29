const shaderLib = require('./shaderLib.js');

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
  color = texture(uTexture, vPosition).rrra;
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

out vec3 vPosition;
out vec3 vNormal;

out float vClipped;

${shaderLib.raytrace}

void main() {
  vec3 p = aPosition / uDimensions;
  gl_Position = uProjection * uModelView * vec4(p, 1.0);
  vPosition = p;
  vNormal = normalize(transpose(mat3(inverse(uModelView))) * aNormal);
}`;
