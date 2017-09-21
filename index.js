var canvas   = document.body.appendChild(document.createElement('canvas'))
var gl       = canvas.getContext('webgl2')
var now      = require('right-now')
var mat4     = require('gl-mat4')
var vec3     = require('gl-vec3')
var isosurface = require('isosurface');

var params = {
  isocaps: true,
  volume: false,
  isosurface: true,
  isoLevel: 0.7,
  isoRange: 0.6
};

var clipBox = {
  min: [0,0,0.4],
  max: [1,1,0.6]
};


var frag = `#version 300 es

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

out vec4 color;

struct Box {
  vec3 minPoint;
  vec3 maxPoint;
};

bool boxIntersect(vec3 ro, vec3 rd, Box box, out float t1, out float t2, out vec3 nml)
{
  vec3 ird = 1.0 / rd;
  vec3 v1 = (box.minPoint - ro) * ird;
  vec3 v2 = (box.maxPoint - ro) * ird;
  vec3 n = min(v1, v2);
  vec3 f = max(v1, v2);
  float enter = max(n.x, max(n.y, n.z));
  float exit = min(f.x, min(f.y, f.z));
  if (exit > 0.0 && enter < exit) {
    t1 = enter;
    t2 = exit;
    return true;
  }
  return false;
}

bool planeIntersect(vec3 ro, vec3 rd, vec3 p, vec3 nml, out float t)
{
  float d = dot(nml, rd);
  if (d <= 0.0) {
    return false;
  }
  d = -dot(ro-p, nml) / d;
  if (d < 0.0) {
    return false;
  }
  t = d;
  return true;
}

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
  float alpha = 4.0*mix(0.05*c.r, 0.01*c.r, pow(clamp(c.r+0., 0.0, 1.0), 4.0));
  //if (abs(c.r - uIsoLevel) <= uIsoRange) {
  //  alpha = 0.2;
  //}
  vec3 col = 1.0-max(vec3(0.0), vec3(c.r*2., abs(0.7-c.r), 0.8-c.r)+0.5);
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

  vec4 accum = vec4(0.0);
  color = vec4(0.0);
  float t1, t2;
  vec3 nml;
  Box clipBox = Box(uClipBoxMin, uClipBoxMax);
  if (boxIntersect(ro, rd, clipBox, t1, t2, nml)) {
    vec3 uvw = (ro + rd * t1);
    if ( uIsocaps && all(lessThanEqual(uvw, vec3(1.0))) && all(greaterThanEqual(uvw, vec3(0.0))) ) {
      vec4 c = texture(uTexture, uvw, -16.0);
      if (abs(c.r - uIsoLevel) <= uIsoRange) {
        vec4 col = getColor(uvw, c);
        color = 1.0 - col;
        color.a = sqrt(c.r);
      }
    }
    vec3 p1 = ro + rd * t1;
    vec4 accum = vec4(0.0);
    bool noHit = true;
    float steps = (t2-t1) * 64.0;
    float maxSteps = sqrt(3.0) * 64.0;
    for (float i=0.0; i<maxSteps; i++) {
      vec3 uvw = (p1 + rd * (t2-t1) * (1.0-i/steps));
      //uvw += vec3(sin(uTime + uvw.y*6.0) * 0.2, 0.0, 0.0);
      vec3 ou = uvw;
      if (all(lessThanEqual(uvw, clipBox.maxPoint)) && all(greaterThanEqual(uvw, clipBox.minPoint)) ) {
        vec4 c = texture(uTexture, uvw, -16.0);
        if (abs(c.r - uIsoLevel) <= uIsoRange) {
          vec4 col = getColor(uvw, c);
          accum = mix(accum, col, col.a);
          noHit = false;
        }
      }
    }
    if (noHit) {
      discard;
      return;
    }
    color = mix(1.0 - accum, color, color.a);
    color.a = 1.0;
  } else {
    discard;
  }
}
`;

var vert = `#version 300 es

#define POSITION_LOCATION 0

precision highp float;
precision highp int;

layout(location = POSITION_LOCATION) in vec3 aPosition;

out vec3 vPosition;

void main() {
  gl_Position = vec4(aPosition, 1.0);
  vPosition = gl_Position.xyz;
}`;


var isoFrag = `#version 300 es

precision highp float;
precision highp sampler3D;

in vec3 vPosition;
in vec3 vNormal;
in float vClipped;

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

out vec4 color;

void main() {
  color = vec4(abs(dot(normalize(vNormal), -normalize(transpose(mat3(inverse(uModelView))) * uLightPosition))) * uLightColor * uLightColor.a);
  if (vClipped > 0.0) {
    color = texture(uTexture, vPosition.xyz).rrra;
    if (!uIsocaps || (vClipped > 1.0 && abs(color.r - uIsoLevel) > uIsoRange)) {
      discard;
    }
  }
  color.a = 1.0;
}`;

var isoVert = `#version 300 es

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

struct Box {
  vec3 minPoint;
  vec3 maxPoint;
};

void main() {
  Box clipBox = Box(uClipBoxMin, uClipBoxMax);

  vec3 p = aPosition / uDimensions;
  vec3 cp = clamp(p, clipBox.minPoint, clipBox.maxPoint);
  vec3 d = (p - cp) * uDimensions;
  vec3 ad = abs(d);
  float maxD = max(max(ad.x, ad.y), ad.z);
  vClipped = maxD;
  gl_Position = uProjection * uModelView * vec4(cp, 1.0);
  vPosition = cp;
  vNormal = normalize(transpose(mat3(inverse(uModelView))) * aNormal);
}`;

function ifWarn(name, str) {
  if (str && /[^\s\0]/.test(str)) {
    console.error(name+"\n"+str);
    return str;
  }
  return false;
}

function createProgram(gl, vert, frag) {
  var vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, vert);
  gl.compileShader(vs);
  var fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, frag);
  gl.compileShader(fs);

  var program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.deleteShader(vs);
  gl.attachShader(program, fs);
  gl.deleteShader(fs);
  gl.linkProgram(program);
  var error = false;
  error |= ifWarn('program', gl.getProgramInfoLog(program));
  error |= ifWarn('vertex', gl.getShaderInfoLog(vs));
  error |= ifWarn('fragment', gl.getShaderInfoLog(fs));
  if (error) {
    throw(new Error("Invalid shader"));
  }
  return program;
}

var rayProgram = createProgram(gl, vert, frag);
var isoProgram = createProgram(gl, isoVert, isoFrag);


var distance = 5;
var fov = 45;
var theta = 0;
var alpha = 0;
var down = false;
var downPos = [0, 0];
var pos = [0, 0];
var delta = [0, 0];

window.onmousedown = function(ev) {
  if (ev.target.tagName === 'CANVAS') {
    ev.preventDefault();
    down = true;
    downPos = [ev.clientX, ev.clientY];
  }
};

window.onmousemove = function(ev) {
  if (down) {
    pos = [ev.clientX, ev.clientY];
    delta = pos.map((v,i) => v - downPos[i]);
    downPos = pos;
    theta -= delta[0] * 0.01;
    while (theta < 0) {
      theta += Math.PI*2;
    }
    theta %= Math.PI*2;
    alpha -= delta[1] * 0.01;
    alpha = Math.max(-Math.PI/2, Math.min(Math.PI/2, alpha));
    ev.preventDefault();
  }
};

window.onmouseup = function(ev) {
  if (down) {
    ev.preventDefault();
    down = false;
  }
};

window.addEventListener('wheel', function(ev) {
  ev.preventDefault();
  var wheelDelta = ev.wheelDeltaY || ev.deltaY || ev.wheelDelta || ev.detail;
  if (wheelDelta === undefined) {
    wheelDelta = 0;
  }
  distance *= Math.pow(1.01, -wheelDelta);
  distance = Math.max(0.5, Math.min(10, distance));
}, false);

var controls = document.createElement('div');
controls.className = 'controls';
controls.style.position = 'absolute';
controls.style.zIndex = 1;
controls.style.left = '10px';
controls.style.top = '10px';
controls.appendChild(createSlider('Min X', clipBox.min, 0, 0, 1));
controls.appendChild(createSlider('Min Y', clipBox.min, 1, 0, 1));
controls.appendChild(createSlider('Min Z', clipBox.min, 2, 0, 1));
controls.appendChild(createSlider('Max X', clipBox.max, 0, 0, 1));
controls.appendChild(createSlider('Max Y', clipBox.max, 1, 0, 1));
controls.appendChild(createSlider('Max Z', clipBox.max, 2, 0, 1));
controls.appendChild(createSlider('Iso level', params, 'isoLevel', 0, 1));
controls.appendChild(createSlider('Iso range', params, 'isoRange', 0, 1));
controls.appendChild(createCheckbox('Isocaps', params, 'isocaps'));
controls.appendChild(createCheckbox('Isosurface', params, 'isosurface'));
controls.appendChild(createCheckbox('Volume', params, 'volume'));
document.body.appendChild(controls);

function createSlider(name, targetObj, targetValue, minValue, maxValue) {
  var reader = (x) => parseFloat(x.value);
  return createInput(name, targetObj, targetValue, 'range', reader, {
    min: minValue,
    max: maxValue,
    step: 0.001,
    value: targetObj[targetValue]
  });
}

function createCheckbox(name, targetObj, targetValue) {
  var reader = (x) => x.checked;
  return createInput(name, targetObj, targetValue, 'checkbox', reader, {
    checked: targetObj[targetValue]
  });
}

function createInput(name, targetObj, targetValue, type, reader, params) {
  var inputContainer = document.createElement('div');
  var label = document.createElement('label');
  label.for = name;
  label.textContent = name;
  var input = document.createElement('input');
  input.id = name;
  input.type = type;
  for (var i in params) {
    input[i] = params[i];
  }
  input.oninput = input.onchange = function(ev) {
    targetObj[targetValue] = reader(this);
  };
  inputContainer.appendChild(label);
  inputContainer.appendChild(input);
  return inputContainer;
}

var getData = function(fn, responseType, callback) {
  if (!callback) {
    callback = responseType;
    responseType = 'text';
  }
  var xhr = new XMLHttpRequest;
  xhr.responseType = responseType;
  xhr.onload = function() {
    callback(xhr.response);
  };
  xhr.open('GET', fn, true);
  xhr.send();
};

var getDataMulti = function(fns, responseType, callback) {
  if (!callback) {
    callback = responseType;
    responseType = 'text';
  }
  var todo = fns.length;
  var results = [];
  var handle = function(idx) {
    return function(data) {
      results[idx] = data;
      todo--;
      if (todo === 0) {
        callback(results);
      }
    };
  };
  fns.forEach(function(fn, idx) { getData(fn, responseType, handle(idx)); });
};

var parseCSV = function(str) {
  return str.replace(/^\s+|\s+$/g, '').split(/\r?\n/g).map(function(x) { return x.split(',').map(parseFloat) });
};

var brains = [];
for (var i=1; i<=109; i++) {
  brains.push('data/MRbrain.' + i);
}

getDataMulti(brains, 'arraybuffer', function(mris) {
  var dims = [256, 256, 109];
  var [dataWidth, dataHeight, dataDepth] = dims;

  var mri = new Uint16Array(mris.length * mris[0].byteLength/2);
  for (var i=0; i<mris.length; i++) {
    mri.set(new Uint16Array(mris[i]), i * mris[0].byteLength/2);
  }
  for (var i=0; i<mri.length; i++) {
    mri[i] = ((mri[i] << 8) & 0xff00) | (mri[i] >> 8);
  }

  var triangleMatrix   = mat4.create()
  var projectionMatrix = mat4.create()

  var potential = function(x, y, z) {
    if (x < 0 || x > (dataWidth-0.5) || y < 0 || y > (dataHeight-0.5) || z < 0 || z > (dataDepth-0.5)) {
      return 0;
    } 
    x = Math.round(x);
    y = Math.round(y);
    z = Math.round(z);
    var off = x + y * dataWidth + z * dataWidth * dataHeight;
    var v = Math.max(0, Math.min(1, (mri[off] - 1300)/2000));
    return Math.abs(v - params.isoLevel) <= params.isoRange;
  };


  // ISOSURFACE TODO
  /*
    [x] Isosurface using marching cubes
    [x] Caps with alpha mask and clip box test
      - looks bad, doesn't seal the volume 
    [x] Update isosurface on params changes
      - it's very slow
    [ ] Generate cap geometry
      - Generate isosurface
      - Raycast along clip plane and count intersections
      - Generate triangles for rays with odd number of intersections
    [ ] Generate smooth vertex normals for the isosurface
      - Find the faces that share the vertex
      - Average the face normals
    [ ] Experiment with marching cubes in the ray marcher
  */

  var bounds = [
    [0,0,0].map(x => x-1), 
    [dataWidth, dataHeight, dataDepth].map(x => x+1)
  ];

function updateIsosurface(gl, isoBuffer, isoNormalBuffer, dims, potential, bounds) {
  var obj = isosurface.marchingCubes(dims, potential, bounds);
  var ps = obj.positions;
  var verts = new Float32Array(3 * 3 * obj.cells.length);
  var normals = new Float32Array(3 * 3 * obj.cells.length);
  var nml = vec3.create();
  var v1 = vec3.create();
  var v2 = vec3.create();
  for (var i = 0; i < obj.cells.length; i++) {
    var cs = obj.cells[i];
    var off = i * 9;
    var p1,p2,p3;
    p1 = ps[cs[0]];
    p2 = ps[cs[1]];
    p3 = ps[cs[2]];
    vec3.subtract(v1, p2, p1);
    vec3.subtract(v2, p3, p1);
    vec3.cross(nml, v1, v2);
    verts[off++] = p1[0]; verts[off++] = p1[1]; verts[off++] = p1[2];
    verts[off++] = p2[0]; verts[off++] = p2[1]; verts[off++] = p2[2];
    verts[off++] = p3[0]; verts[off++] = p3[1]; verts[off++] = p3[2];
    off -= 9;
    normals[off++] = nml[0]; normals[off++] = nml[1]; normals[off++] = nml[2];
    normals[off++] = nml[0]; normals[off++] = nml[1]; normals[off++] = nml[2];
    normals[off++] = nml[0]; normals[off++] = nml[1]; normals[off++] = nml[2];
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, isoBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, isoNormalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
  return verts.length / 3;
}

  var data = new Uint8Array(dataWidth*dataHeight*dataDepth*4);
  for (var i=0; i<mri.length; i++) {
    var v = Math.max(0, Math.min(1, (mri[i] - 1300)/2000)) * 255;
    data[i*4] = v;
    data[i*4+1] = v;
    data[i*4+2] = v;
    data[i*4+3] = 255;
  }

  var texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_3D, texture);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_BASE_LEVEL, 0);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAX_LEVEL, Math.log2(dataWidth));
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage3D(
    gl.TEXTURE_3D,  // target
    0,              // level
    gl.RGBA,        // internalformat
    dataWidth,      // width
    dataHeight,     // height
    dataDepth,      // depth
    0,              // border
    gl.RGBA,        // format
    gl.UNSIGNED_BYTE, // type
    data            // pixel
  );
  gl.generateMipmap(gl.TEXTURE_3D);

  var triangleBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, triangleBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1.0, +1.0, +0.0,
      -1.0, -1.0, +0.0,
      +1.0, -1.0, +0.0,

      -1.0, +1.0, +0.0,
      +1.0, -1.0, +0.0,
      +1.0, +1.0, +0.0
    ]), gl.STATIC_DRAW);

  var isoBuffer = gl.createBuffer();
  var isoNormalBuffer = gl.createBuffer();

  var isoVerticeCount = updateIsosurface(gl, isoBuffer, isoNormalBuffer, dims, potential, bounds);
  var currentIsoLevel = params.isoLevel;
  var currentIsoRange = params.isoRange;

  function uniloc(gl, program, name) {
    if (!program.uniformLocations) {
      program.uniformLocations = {};
    }
    if (!program.uniformLocations[name]) {
      program.uniformLocations[name] = gl.getUniformLocation(program, name);
    }
    return program.uniformLocations[name];
  }

  function render() {
    if (params.isosurface && (params.isoLevel !== currentIsoLevel || params.isoRange !== currentIsoRange)) {
      isoVerticeCount = updateIsosurface(gl, isoBuffer, isoNormalBuffer, dims, potential, bounds);
      currentIsoLevel = params.isoLevel;
      currentIsoRange = params.isoRange;
    }
    var width = gl.drawingBufferWidth;
    var height = gl.drawingBufferHeight;

    // Clear the screen and set the viewport before
    // drawing anything
    gl.clearColor(1,1,1,1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.viewport(0, 0, width, height);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    // Calculate projection matrix
    mat4.perspective(projectionMatrix, fov, width / height, 0.1, 100);
    var pos = [
      Math.cos(theta) * Math.cos(alpha) * distance,
      Math.sin(alpha) * distance,
      Math.sin(theta) * Math.cos(alpha) * distance
    ];
    mat4.lookAt(triangleMatrix, pos, [0,0,0], [0,-1,0]);
    mat4.translate(triangleMatrix, triangleMatrix, [-0.5, -0.5, -0.3]);
    mat4.scale(triangleMatrix, triangleMatrix, [1, 1, 0.6]);

    function setUniforms(gl, program) {
      gl.useProgram(program);
      gl.uniform1i(uniloc(gl, program, 'uTexture'), texture);
      gl.uniform1i(uniloc(gl, program, 'uIsocaps'), params.isocaps ? 1 : 0);
      gl.uniform1f(uniloc(gl, program, 'uTime'), now() / 1000.0);
      gl.uniform1f(uniloc(gl, program, 'uIsoLevel'), params.isoLevel);
      gl.uniform1f(uniloc(gl, program, 'uIsoRange'), params.isoRange);
      gl.uniform2f(uniloc(gl, program, 'uResolution'), width, height);
      gl.uniform3fv(uniloc(gl, program, 'uDimensions'), dims);
      gl.uniform3fv(uniloc(gl, program, 'uClipBoxMin'), clipBox.min);
      gl.uniform3fv(uniloc(gl, program, 'uClipBoxMax'), clipBox.max);
      gl.uniform3fv(uniloc(gl, program, 'uLightPosition'), [1,1,1]);
      gl.uniform4fv(uniloc(gl, program, 'uLightColor'), [1,1,1,1]);
      gl.uniformMatrix4fv(uniloc(gl, program, 'uProjection'), false, projectionMatrix);
      gl.uniformMatrix4fv(uniloc(gl, program, 'uModelView'), false, triangleMatrix);
    }

    if (params.volume) {
      setUniforms(gl, rayProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, triangleBuffer);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.disableVertexAttribArray(1);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    if (params.isosurface) {
      setUniforms(gl, isoProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, isoBuffer);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, isoNormalBuffer);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, isoVerticeCount);
    }
  }

  // Resize the canvas to fit the screen
  window.addEventListener('resize'
    , require('canvas-fit')(canvas)
    , false
  )

  function tick() {
    render();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);


})